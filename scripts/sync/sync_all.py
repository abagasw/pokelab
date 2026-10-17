#!/usr/bin/env python3
"""
Pokemon TCG Indonesia - Auto-Sync Script
=========================================
Unified script that syncs:
  1. Card data + images from Pokepedia Supabase API
  2. Tournament data + decklists from LimitlessTCG

Designed to run inside a Docker container on a schedule (cron / ofelia).

Usage:
  python sync_all.py                       # run all syncs
  python sync_all.py --cards-only          # only sync card data + images
  python sync_all.py --tournaments-only    # only sync tournament data
  python sync_all.py --dry-run             # show what would be synced

Environment variables:
  DB_PATH               - path to SQLite database (default: /app/data/pokemon_tcg.db)
  IMAGE_DIR             - path to card images dir (default: /app/card-images)
  POKEPEDIA_API_KEY     - Supabase publishable/secret key for pokepedia.id (REQUIRED for card sync)
                          Get from pokepedia.id Supabase dashboard (new format: sb_publishable_* or sb_secret_*)
                          Legacy anon keys disabled since 2026-06-13
  POKEPEDIA_SUPABASE_URL - Supabase REST URL (default: https://tlauakxyrxpwnwgdywum.supabase.co/rest/v1)
  SYNC_WORKERS          - concurrent image download workers (default: 8)
  SYNC_TIMEOUT          - request timeout in seconds (default: 20)
"""

from __future__ import annotations

import json
import mimetypes
import os
import re
import shutil
import sqlite3
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError as exc:
    print(f"Missing dependency: {exc}. Install: pip install requests beautifulsoup4")
    sys.exit(1)

try:
    ROOT_DIR = Path(__file__).resolve().parents[2]
except IndexError:
    ROOT_DIR = Path(__file__).resolve().parent
DB_PATH = Path(os.environ.get("DB_PATH", str(ROOT_DIR / "backend-go" / "pokemon_tcg.db")))
IMAGE_DIR = Path(os.environ.get("IMAGE_DIR", str(ROOT_DIR / "frontend-astro" / "public" / "card-images")))
POKEPEDIA_URL = os.environ.get("POKEPEDIA_SUPABASE_URL", "https://tlauakxyrxpwnwgdywum.supabase.co/rest/v1")
POKEPEDIA_API_KEY = os.environ.get("POKEPEDIA_API_KEY") or ""
WORKERS = int(os.environ.get("SYNC_WORKERS", "8"))
TIMEOUT = int(os.environ.get("SYNC_TIMEOUT", "20"))


def require_pokepedia_key() -> str:
    """Hard-fail only when a card sync actually needs the key.

    --tournaments-only runs keep working without any Pokepedia key.
    """
    if not POKEPEDIA_API_KEY:
        print("ERROR: POKEPEDIA_API_KEY environment variable is required for Pokepedia sync.")
        print("       Set it to a Supabase publishable key (sb_publishable_*) or secret key (sb_secret_*).")
        print("       Legacy anon keys have been disabled by Supabase since 2026-06-13.")
        sys.exit(1)
    return POKEPEDIA_API_KEY


def pokepedia_headers():
    return {
    "Accept": "application/json",
    "apikey": require_pokepedia_key(),
    "Authorization": f"Bearer {require_pokepedia_key()}",
    "Origin": "https://www.pokepedia.id",
    "Referer": "https://www.pokepedia.id/",
}

# LIMITLESS_BASE deprecated - using LIMITLESS_API
LIMITLESS_HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36"}
IMAGE_HEADERS = {"User-Agent": LIMITLESS_HEADERS["User-Agent"], "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"}
LOG_FILE = Path(os.environ.get("SYNC_LOG", "/app/logs/sync.log"))

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

def log(msg: str):
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    try:
        LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        with LOG_FILE.open("a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass

def to_int(v, d=0):
    try: return int(v)
    except (TypeError, ValueError): return d

def to_json(v):
    return None if v is None else json.dumps(v, ensure_ascii=False)

def safe_ext(url, ct=""):
    ext = Path(urlparse(url).path).suffix.lower()
    if ext in {".jpg",".jpeg",".png",".webp",".gif",".avif"}: return ext
    g = mimetypes.guess_extension(ct.split(";")[0].strip()) if ct else ""
    if g in {".jpg",".jpeg",".png",".webp",".gif",".avif"}: return g
    return ".webp"

# ===================================================================
# Part 1: Pokepedia Card + Image Sync
# ===================================================================

@dataclass
class ImageResult:
    card_id: str
    remote_url: str
    local_url: str | None
    status: str
    reason: str = ""


def pokepedia_get(endpoint: str, params: str = "") -> list[dict]:
    url = f"{POKEPEDIA_URL}/{endpoint}"
    if params:
        url = f"{url}?{params}"
    resp = requests.get(url, headers=pokepedia_headers(), timeout=TIMEOUT)
    if resp.status_code == 401:
        msg = resp.text
        if "Legacy API keys are disabled" in msg:
            raise RuntimeError(
                "Supabase legacy API key is disabled. "
                "Set POKEPEDIA_API_KEY to a new publishable key (sb_publishable_*) or secret key (sb_secret_*) "
                "from the pokepedia.id Supabase dashboard. Legacy anon keys were disabled on 2026-06-13."
            )
        else:
            raise RuntimeError(f"Supabase authentication failed (401): {msg}")
    resp.raise_for_status()
    return resp.json()


def resolve_host_ip(host: str) -> str | None:
    try:
        resp = requests.get("https://cloudflare-dns.com/dns-query",
            headers={"accept": "application/dns-json"}, params={"name": host, "type": "A"}, timeout=10)
        for a in resp.json().get("Answer", []):
            if a.get("type") == 1 and a.get("data"):
                return a["data"]
    except Exception:
        pass
    return None


def fetch_with_curl_resolve(remote_url: str, target: Path, host_ip: str) -> tuple[bool, str]:
    curl = shutil.which("curl") or shutil.which("curl.exe")
    if not curl:
        return False, "curl not found"
    host = urlparse(remote_url).hostname or ""
    tmp = target.with_suffix(target.suffix + ".tmp")
    cmd = [curl, "-k", "-L", "--fail", "--silent", "--show-error",
           "--connect-timeout", str(TIMEOUT), "--max-time", str(max(TIMEOUT*3, 45)),
           "--resolve", f"{host}:443:{host_ip}",
           "-A", IMAGE_HEADERS["User-Agent"], "-H", IMAGE_HEADERS["Accept"],
           "-o", str(tmp), "-w", "%{content_type}", remote_url]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=max(TIMEOUT*4, 60))
        ct = (r.stdout or "").strip()
        if r.returncode != 0:
            tmp.unlink(missing_ok=True)
            return False, (r.stderr or f"curl exit {r.returncode}").strip()
        if not ct.startswith("image/"):
            tmp.unlink(missing_ok=True)
            return False, f"not image: {ct}"
        if not tmp.exists() or tmp.stat().st_size == 0:
            return False, "empty image"
        tmp.replace(target)
        return True, ct
    except Exception as exc:
        tmp.unlink(missing_ok=True)
        return False, str(exc)


def download_one_image(card_id: str, remote_url: str, exp_code: str, resolve_ips: dict) -> ImageResult:
    if not remote_url:
        return ImageResult(card_id, remote_url, None, "skipped", "no url")
    ext = safe_ext(remote_url)
    exp_folder = exp_code or "unknown"
    target = IMAGE_DIR / exp_folder / f"{card_id}{ext}"
    public_url = f"/card-images/{exp_folder}/{card_id}{ext}"
    if target.exists() and target.stat().st_size > 0:
        return ImageResult(card_id, remote_url, public_url, "exists")
    target.parent.mkdir(parents=True, exist_ok=True)
    # Try direct request
    try:
        resp = requests.get(remote_url, headers=IMAGE_HEADERS, timeout=TIMEOUT, stream=True, verify=False)
        ct = resp.headers.get("content-type", "")
        if resp.status_code < 400 and ct.startswith("image/"):
            ext = safe_ext(remote_url, ct)
            target = IMAGE_DIR / exp_folder / f"{card_id}{ext}"
            public_url = f"/card-images/{exp_folder}/{card_id}{ext}"
            target.parent.mkdir(parents=True, exist_ok=True)
            tmp = target.with_suffix(target.suffix + ".tmp")
            with tmp.open("wb") as f:
                for chunk in resp.iter_content(chunk_size=65536):
                    if chunk: f.write(chunk)
            tmp.replace(target)
            return ImageResult(card_id, remote_url, public_url, "downloaded")
    except Exception:
        pass
    # Fallback: curl DNS bypass
    host = urlparse(remote_url).hostname or ""
    host_ip = resolve_ips.get(host)
    if host_ip:
        ext = safe_ext(remote_url)
        target = IMAGE_DIR / exp_folder / f"{card_id}{ext}"
        public_url = f"/card-images/{exp_folder}/{card_id}{ext}"
        target.parent.mkdir(parents=True, exist_ok=True)
        ok, reason = fetch_with_curl_resolve(remote_url, target, host_ip)
        if ok:
            return ImageResult(card_id, remote_url, public_url, "downloaded")
        return ImageResult(card_id, remote_url, None, "failed", reason)
    return ImageResult(card_id, remote_url, None, "failed", "no dns bypass")

def sync_pokepedia(dry_run: bool = False) -> dict:
    """Sync card data from Pokepedia Supabase + download images."""
    log("=== POKEPEDIA SYNC START ===")
    # Validate API key is present (checked at module load, but double-check for clarity)
    if not os.environ.get("POKEPEDIA_API_KEY"):
        raise RuntimeError("POKEPEDIA_API_KEY not set. Required for Pokepedia sync.")
    stats = {"expansions": 0, "cards_synced": 0, "images_downloaded": 0,
             "images_existing": 0, "images_failed": 0, "images_skipped": 0}

    # 1. Fetch expansions
    log("Fetching expansions from Pokepedia Supabase...")
    try:
        expansions = pokepedia_get("expansions", "select=*&order=released_at.desc")
    except Exception as exc:
        log(f"ERROR fetching expansions: {exc}")
        return stats
    log(f"Found {len(expansions)} expansions")
    stats["expansions"] = len(expansions)
    if dry_run:
        log("DRY RUN - skipping actual sync")
        return stats

    # 2. Fetch all cards (paginated)
    log("Fetching all cards from Pokepedia Supabase...")
    all_cards = []
    offset = 0
    while True:
        batch = pokepedia_get("cards", f"select=*&order=id.asc&offset={offset}&limit=1000")
        if not batch: break
        all_cards.extend(batch)
        offset += 1000
        if len(batch) < 1000: break
    log(f"Total cards fetched: {len(all_cards)}")

    # 3. Pre-flight R2 host check
    log("Pre-flight: checking R2 image host...")
    r2_host = ""
    resolve_ips = {}
    for card in all_cards[:5]:
        url = card.get("image_url", "")
        if url:
            r2_host = urlparse(url).hostname or ""
            break
    if r2_host:
        try:
            resp = requests.get(f"https://{r2_host}/test.webp", headers=IMAGE_HEADERS, timeout=10, verify=False)
            ct = resp.headers.get("content-type", "")
            if not ct.startswith("image/"):
                ip = resolve_host_ip(r2_host)
                if ip:
                    resolve_ips[r2_host] = ip
                    log(f"R2 host DNS bypass: {r2_host} -> {ip}")
        except Exception:
            ip = resolve_host_ip(r2_host)
            if ip:
                resolve_ips[r2_host] = ip
                log(f"R2 host DNS bypass: {r2_host} -> {ip}")

    # 4. Download images
    log(f"Downloading images with {WORKERS} workers...")
    image_map = {}
    cards_needing_download = []
    for card in all_cards:
        card_id = str(card.get("id", ""))
        remote_url = card.get("image_url", "")
        exp_code = card.get("expansion_code", "")
        if not card_id or not remote_url:
            stats["images_skipped"] += 1
            continue
        ext = safe_ext(remote_url)
        target = IMAGE_DIR / (exp_code or "unknown") / f"{card_id}{ext}"
        if target.exists() and target.stat().st_size > 0:
            image_map[card_id] = f"/card-images/{exp_code or 'unknown'}/{card_id}{ext}"
            stats["images_existing"] += 1
        else:
            cards_needing_download.append((card_id, remote_url, exp_code))

    log(f"Existing images: {stats['images_existing']}, to download: {len(cards_needing_download)}")

    with ThreadPoolExecutor(max_workers=WORKERS) as executor:
        futures = {executor.submit(download_one_image, cid, url, exp, resolve_ips): cid
                   for cid, url, exp in cards_needing_download}
        for future in as_completed(futures):
            result = future.result()
            if result.status == "downloaded":
                image_map[result.card_id] = result.local_url
                stats["images_downloaded"] += 1
            elif result.status == "failed":
                stats["images_failed"] += 1
                if stats["images_failed"] <= 5:
                    log(f"  FAILED {result.card_id}: {result.reason}")
            done = stats["images_downloaded"] + stats["images_failed"]
            if done > 0 and done % 200 == 0:
                log(f"  Progress: {done}/{len(cards_needing_download)}")

    # 5. Sync cards to DB
    log("Syncing cards to database...")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    for exp in expansions:
        code = exp.get("code")
        if not code: continue
        cursor.execute(
            "INSERT INTO expansions (code, name_id, name_en, released_at, total_cards, created_at) "
            "VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP) "
            "ON CONFLICT(code) DO UPDATE SET name_id=excluded.name_id, name_en=excluded.name_en, "
            "total_cards=excluded.total_cards, released_at=excluded.released_at",
            (code, exp.get("name_id"), exp.get("name_en"), exp.get("released_at"), exp.get("total_cards")))

    for card in all_cards:
        details = card.get("details") or {}
        card_id = str(card.get("id", ""))
        image_url = image_map.get(card_id) or card.get("image_url", "")
        cursor.execute(
            "INSERT INTO cards (id, external_id, expansion_code, collector_number, name_id, name_en, "
            "category, rarity, image_url, updated_at, regulation_mark, illustrator, hp, card_type, "
            "evolution_stage, evolves_from, retreat_cost, attacks, abilities, weakness, resistance, pokedex) "
            "VALUES (?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,?,?,?,?,?,?,?,?,?,?,?,?) "
            "ON CONFLICT(id) DO UPDATE SET expansion_code=excluded.expansion_code, collector_number=excluded.collector_number, "
            "name_id=excluded.name_id, name_en=excluded.name_en, category=excluded.category, rarity=excluded.rarity, "
            "image_url=excluded.image_url, updated_at=CURRENT_TIMESTAMP, regulation_mark=excluded.regulation_mark, "
            "illustrator=excluded.illustrator, hp=excluded.hp, card_type=excluded.card_type, "
            "evolution_stage=excluded.evolution_stage, evolves_from=excluded.evolves_from, "
            "retreat_cost=excluded.retreat_cost, attacks=excluded.attacks, abilities=excluded.abilities, "
            "weakness=excluded.weakness, resistance=excluded.resistance, pokedex=excluded.pokedex",
            (card_id, card.get("id"), card.get("expansion_code"), card.get("collector_number"),
             card.get("name_id"), card.get("name_en") or card.get("name_id"),
             card.get("category") or "Unknown", card.get("rarity"), image_url,
             card.get("regulation_mark"), card.get("illustrator"),
             details.get("hp"), details.get("card_type"), details.get("evolution_stage"),
             details.get("evolves_from"), details.get("retreat_cost"),
             to_json(card.get("attacks") or details.get("attacks")),
             to_json(card.get("abilities") if card.get("abilities") is not None else details.get("abilities")),
             to_json(card.get("weakness") or details.get("weakness")),
             to_json(card.get("resistance") if card.get("resistance") is not None else details.get("resistance")),
             to_json(card.get("pokedex") or details.get("pokedex"))))
        stats["cards_synced"] += 1
    conn.commit()
    conn.close()
    log(f"Pokepedia sync done: {stats['cards_synced']} cards, {stats['images_downloaded']} images downloaded")
    return stats

# ===================================================================
# Part 2: LimitlessTCG Tournament + Decklist Sync (via play.limitlesstcg.com API)
# ===================================================================

LIMITLESS_API = "https://play.limitlesstcg.com/api"

class CardIndex:
    def __init__(self, cursor):
        self.by_name = {}
        self.by_clean = {}
        self.search_rows = []
        cursor.execute("SELECT id, COALESCE(name_en,''), COALESCE(name_id,''), COALESCE(category,'') "
                       "FROM cards ORDER BY (expansion_code IS NOT NULL) DESC, updated_at DESC")
        for card_id, name_en, name_id, cat in cursor.fetchall():
            val = (str(card_id), cat)
            for name in {name_en, name_id}:
                if not name: continue
                self.by_name.setdefault(name.lower(), val)
                c = self._norm(name)
                if c:
                    self.by_clean.setdefault(c, val)
                    self.search_rows.append((c, val[0], val[1]))

    @staticmethod
    def _norm(v):
        v = re.sub(r"\b(ex|vstar|vmax|gx|radiant)\b", "", v.lower())
        return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9\s'\u2019-]+", " ", v)).strip()

    def find(self, name):
        lo = name.lower()
        if lo in self.by_name: return self.by_name[lo]
        c = self._norm(name)
        if c in self.by_clean: return self.by_clean[c]
        if len(c) >= 4:
            for idx, cid, cat in self.search_rows:
                if c in idx or idx in c: return cid, cat
        return None, None


def limitless_api_get(endpoint: str, params: str = "", retries: int = 5) -> list[dict] | dict:
    """Fetch from play.limitlesstcg.com API with 429 backoff."""
    url = f"{LIMITLESS_API}/{endpoint}"
    if params:
        url = f"{url}?{params}"
    import time as _time
    for attempt in range(retries):
        try:
            resp = requests.get(url, headers=LIMITLESS_HEADERS, timeout=30)
            if resp.status_code == 429 and attempt < retries - 1:
                wait = 20 * (attempt + 1)
                log(f"  429 rate limited, backing off {wait}s ({url.rsplit('/', 2)[-2] if '/' in url else url})")
                _time.sleep(wait)
                continue
            resp.raise_for_status()
            return resp.json()
        except Exception as exc:
            log(f"  API Error {url}: {exc}")
            return [] if "tournaments" in endpoint else {}
    return [] if "tournaments" in endpoint else {}


def normalize_tournament_date(value):
    """Best-effort ISO (YYYY-MM-DD) normalization for mixed DB date formats."""
    if not value:
        return ""
    value = str(value).strip()
    if len(value) >= 10 and value[4] == "-" and value[7] == "-":
        return value[:10]
    try:
        from datetime import datetime

        return datetime.strptime(value, "%d %b %y").strftime("%Y-%m-%d")
    except ValueError:
        return value


def sync_limitless(dry_run=False, full=False):
    log("=== LIMITLESS TCG SYNC START (API) ===")
    stats = {"tournaments_checked": 0, "tournaments_new": 0, "standings_scraped": 0,
             "decklists_imported": 0, "cards_imported": 0, "cards_missing": 0}

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Get latest tournament date in DB to avoid re-fetching old ones.
    # Dates are historically mixed: Pokepedia-era rows use "DD MMM YY"
    # while Limitless rows use ISO "YYYY-MM-DD". Normalize before comparing.
    cursor.execute("SELECT date FROM tournaments WHERE id LIKE 'limitless-%'")
    db_dates = [normalize_tournament_date(r[0]) for r in cursor.fetchall() if r[0]]
    latest_db_date = max(db_dates) if db_dates else None
    log(f"Latest tournament in DB: {latest_db_date}")

    # 1. Fetch tournaments via API (paginated, max 5 pages = 250 most recent)
    log("Fetching tournaments from Limitless API...")
    all_tourneys = []
    page = 1
    max_pages = 15
    
    while page <= max_pages:
        batch = limitless_api_get("tournaments", f"game=PTCG&format=STANDARD&limit=50&page={page}")
        if not batch:
            break
        all_tourneys.extend(batch)
        # Stop if we've reached tournaments older than what we have
        if latest_db_date and not full:
            oldest_in_batch = min(normalize_tournament_date(t.get("date")) for t in batch)
            if latest_db_date and oldest_in_batch <= latest_db_date:
                log(f"Reached tournaments older than DB (oldest in batch: {oldest_in_batch[:10]})")
                break
        if len(batch) < 50:
            break
        page += 1
        time.sleep(0.1)  # be nice to API

    stats["tournaments_checked"] = len(all_tourneys)
    log(f"Found {len(all_tourneys)} tournaments via API")

    if not all_tourneys:
        conn.close()
        log("No tournaments found")
        return stats
    existing = {r[0] for r in cursor.execute("SELECT id FROM tournaments").fetchall()}
    if full:
        # full mode: re-process tournaments, skipping ones whose standings
        # already carry match records (smart resume after interruption).
        done = {
            r[0]
            for r in cursor.execute(
                "SELECT DISTINCT t.external_id FROM tournaments t "
                "JOIN decklists dl ON dl.tournament_id = t.id "
                "WHERE dl.win_count + dl.loss_count + dl.tie_count > 0"
            ).fetchall()
        }
        new_tourneys = [t for t in all_tourneys if t["id"] not in done]
        log(f"Skipping {len(all_tourneys) - len(new_tourneys)} tournaments already backfilled")
    else:
        new_tourneys = [t for t in all_tourneys if f"limitless-{t['id']}" not in existing]
    stats["tournaments_new"] = len(new_tourneys)
    log(f"Tournaments to sync: {len(new_tourneys)} / {len(all_tourneys)} (full={full})")

    if not new_tourneys:
        conn.close()
        log("No new tournaments to sync")
        return stats

    if dry_run:
        conn.close()
        for t in new_tourneys:
            log(f"  WOULD SYNC: {t['id']}: {t['name']} ({t['date'][:10]})")
        return stats

    card_index = CardIndex(cursor)

    for i, t in enumerate(new_tourneys):
        tid = t["id"]
        log(f"  [{i+1}/{len(new_tourneys)}] {tid}: {t['name'][:60]}")
        # Insert tournament
        cursor.execute(
            "INSERT INTO tournaments (id, external_id, name, date, format, location, created_at) "
            "VALUES (?,?,?,?,'Standard',?,CURRENT_TIMESTAMP) "
            "ON CONFLICT(id) DO UPDATE SET name=excluded.name, date=excluded.date, location=excluded.location",
            (f"limitless-{tid}", tid, t["name"], t["date"][:10], t.get("players", "")))

        # 2. Fetch standings with decklists via API
        standings = limitless_api_get(f"tournaments/{tid}/standings")
        stats["standings_scraped"] += len(standings)
        log(f"    Standings: {len(standings)} players")

        for s in standings:
            decklist = s.get("decklist")
            if not decklist:
                continue

            placing = s.get("placing")
            player = s.get("player", "Unknown")
            name = s.get("name", player)
            record = s.get("record", {})
            deck_info = s.get("deck", {})
            archetype = deck_info.get("name") or deck_info.get("id") or "Unknown"
            deck_archetype_id = deck_info.get("id", "unknown")

            rank = str(placing) if placing else "0"
            deck_id = f"tourney-{tid}-{rank}-{player}"
            deck_name = f"{archetype} ({name}) - {t['name']}"

            cursor.execute(
                "INSERT INTO decks (id, name, archetype, description, format, tournament_count, updated_at) "
                "VALUES (?,?,?,?,'Standard',1,CURRENT_TIMESTAMP) "
                "ON CONFLICT(id) DO UPDATE SET name=excluded.name, archetype=excluded.archetype, "
                "description=excluded.description, updated_at=CURRENT_TIMESTAMP",
                (deck_id, deck_name, archetype, f"Rank {rank} at {t['name']} by {name} ({record.get('wins',0)}-{record.get('losses',0)}-{record.get('ties',0)})"))
            stats["decklists_imported"] += 1

            list_id = f"list-{deck_id}"
            cursor.execute(
                "INSERT INTO decklists (id, deck_id, name, player_name, tournament_id, placement, "
                "win_count, loss_count, tie_count, points, created_at) "
                "VALUES (?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) "
                "ON CONFLICT(id) DO UPDATE SET name=excluded.name, player_name=excluded.player_name, "
                "tournament_id=excluded.tournament_id, placement=excluded.placement, "
                "win_count=excluded.win_count, loss_count=excluded.loss_count, "
                "tie_count=excluded.tie_count, points=excluded.points",
                (list_id, deck_id, f"Official List - Rank {rank}", name, f"limitless-{tid}", placing or 0,
                 to_int(record.get("wins")), to_int(record.get("losses")),
                 to_int(record.get("ties")), to_int(record.get("points"))))
            cursor.execute("DELETE FROM deck_cards WHERE deck_id = ?", (deck_id,))

            # Decklist from API: {"pokemon": [...], "trainer": [...], "energy": [...]}
            # Each card: {"count": N, "set": "MEG", "number": "114", "name": "Boss's Orders"}
            for cat in ("pokemon", "trainer", "energy"):
                for cd in decklist.get(cat, []) or []:
                    cn = cd.get("name", "")
                    cnt = to_int(cd.get("count"))
                    if not cn or cnt <= 0:
                        continue
                    # Match by English name (API returns English names)
                    cid, dbcat = card_index.find(cn)
                    if cid:
                        cursor.execute("INSERT INTO deck_cards (deck_id, card_id, count, is_pokemon) VALUES (?,?,?,?)",
                                       (list_id, cid, cnt, dbcat == "Pokemon"))
                        stats["cards_imported"] += cnt
                    else:
                        stats["cards_missing"] += 1
                        # Debug: log first few missing
                        if stats["cards_missing"] <= 5:
                            log(f"    MISSING: {cn} ({cat})")

        time.sleep(0.5)  # rate limiting (429s at higher rates)

        # Commit periodically so interrupted runs keep their progress.
        if (i + 1) % 20 == 0:
            conn.commit()
            log(f"    [checkpoint] committed {i + 1}/{len(new_tourneys)}")

    conn.commit()
    conn.close()
    log(f"LimitlessTCG sync done: {stats['tournaments_new']} new tournaments, {stats['decklists_imported']} decklists, {stats['cards_imported']} cards")
    return stats


# ===================================================================
# Main
# ===================================================================

def main():
    import argparse
    parser = argparse.ArgumentParser(description="Pokemon TCG Indonesia - Auto-Sync")
    parser.add_argument("--cards-only", action="store_true", help="Only sync Pokepedia cards + images")
    parser.add_argument("--tournaments-only", action="store_true", help="Only sync LimitlessTCG tournaments")
    parser.add_argument("--full", action="store_true", help="Full sync: refetch all tournaments and backfill standings records")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be synced")
    args = parser.parse_args()

    log("=" * 60)
    log(f"Auto-Sync starting (cards={not args.tournaments_only}, tournaments={not args.cards_only}, dry_run={args.dry_run})")
    log(f"DB: {DB_PATH}")
    log(f"Images: {IMAGE_DIR}")
    log("=" * 60)

    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)

    result = {"timestamp": datetime.now(timezone.utc).isoformat()}
    if not args.tournaments_only:
        result["pokepedia"] = sync_pokepedia(dry_run=args.dry_run)
    if not args.cards_only:
        result["limitless"] = sync_limitless(dry_run=args.dry_run, full=getattr(args, "full", False))

    log("=" * 60)
    log("SYNC COMPLETE")
    log(json.dumps(result, indent=2, default=str))
    log("=" * 60)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
