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
  POKEPEDIA_API_KEY     - Supabase anon key for pokepedia.id
  POKEPEDIA_SUPABASE_URL - Supabase REST URL
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

ROOT_DIR = Path(__file__).resolve().parents[2]
DB_PATH = Path(os.environ.get("DB_PATH", str(ROOT_DIR / "backend-go" / "pokemon_tcg.db")))
IMAGE_DIR = Path(os.environ.get("IMAGE_DIR", str(ROOT_DIR / "frontend-astro" / "public" / "card-images")))
POKEPEDIA_URL = os.environ.get("POKEPEDIA_SUPABASE_URL", "https://tlauakxyrxpwnwgdywum.supabase.co/rest/v1")
POKEPEDIA_KEY = os.environ.get("POKEPEDIA_API_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRsYXVha3h5cnhwd253Z2R5d3VtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4OTg2NzIsImV4cCI6MjA4ODQ3NDY3Mn0.cmXJnlBcDNzzJQyd1FPbKaveYlzWgAfGJ_2EijZkr4Q")
WORKERS = int(os.environ.get("SYNC_WORKERS", "8"))
TIMEOUT = int(os.environ.get("SYNC_TIMEOUT", "20"))

POKEPEDIA_HEADERS = {
    "Accept": "application/json",
    "apikey": POKEPEDIA_KEY,
    "Authorization": f"Bearer {POKEPEDIA_KEY}",
    "Origin": "https://www.pokepedia.id",
    "Referer": "https://www.pokepedia.id/",
}

LIMITLESS_BASE = "https://limitlesstcg.com"
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
    resp = requests.get(url, headers=POKEPEDIA_HEADERS, timeout=TIMEOUT)
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
# Part 2: LimitlessTCG Tournament + Decklist Sync
# ===================================================================

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


def limitless_soup(url):
    try:
        r = requests.get(url, headers=LIMITLESS_HEADERS, timeout=30)
        r.raise_for_status()
        return BeautifulSoup(r.text, "html.parser")
    except Exception as exc:
        log(f"  Error fetching {url}: {exc}")
        return None


def scrape_tournament_list():
    log("Fetching tournament list from LimitlessTCG...")
    soup = limitless_soup(f"{LIMITLESS_BASE}/tournaments?game=PTCG&format=standard")
    if not soup: return []
    tourneys = []
    for row in soup.find_all("tr"):
        cols = row.find_all("td")
        if not cols: continue
        link = row.find("a", href=re.compile(r"/tournaments/\d+"))
        if not link: continue
        t_id = link.get("href").split("/")[-1]
        if t_id in [t["id"] for t in tourneys]: continue
        tourneys.append({"id": t_id, "name": link.text.strip(),
                         "date": cols[0].text.strip() if cols else "",
                         "players": cols[2].text.strip() if len(cols) > 2 else ""})
    log(f"Found {len(tourneys)} tournaments on listing page")
    return tourneys


def scrape_standings(tourney_id, limit=32):
    soup = limitless_soup(f"{LIMITLESS_BASE}/tournaments/{tourney_id}")
    if not soup: return []
    labs = soup.find("a", href=re.compile(r"labs\.limitlesstcg\.com.*standings"))
    if not labs: labs = soup.find("a", href=re.compile(r"labs\.limitlesstcg\.com"))
    if labs:
        url = labs.get("href")
        if "standings" not in url: url = url.rstrip("/") + "/standings"
        return _labs_standings(url, limit)
    table = soup.find("table", class_="standings") or soup.find("table")
    if not table: return []
    standings = []
    for row in table.find_all("tr")[1:limit+1]:
        cols = row.find_all("td")
        if len(cols) < 2: continue
        rank = row.get("data-rank") or cols[0].text.strip()
        player = row.get("data-name") or cols[1].text.strip()
        deck_name = row.get("data-deck") or ""
        list_url = ""
        for col in cols[2:]:
            ll = col.find("a", href=re.compile(r"/decks/list/"))
            if ll: list_url = LIMITLESS_BASE + ll.get("href"); break
            if not deck_name:
                dl = col.find("a", href=re.compile(r"/decks/"))
                if dl: deck_name = dl.text.strip()
        standings.append({"rank": rank, "player": player, "deck_name": deck_name or "Unknown", "list_url": list_url})
    return standings


def _labs_standings(url, limit):
    soup = limitless_soup(url)
    if not soup: return []
    standings = []
    for row in soup.find_all("tr")[1:limit+1]:
        cols = row.find_all("td")
        if len(cols) < 2: continue
        rank = cols[0].text.strip()
        player = cols[1].text.strip()
        deck_name = ""
        list_url = ""
        for col in cols[2:]:
            al = col.find("a", href=re.compile(r"/decks/"))
            if al and "/list" not in (al.get("href") or "") and not deck_name:
                imgs = al.find_all("img")
                deck_name = " ".join(img.get("alt","").capitalize() for img in imgs) if imgs else al.text.strip()
            ll = col.find("a", href=re.compile(r"/decklist|/list/|/decks/list/"))
            if ll:
                href = ll.get("href")
                m = re.match(r"(https?://[^/]+)", url)
                list_url = href if href.startswith("http") else (m.group(1) if m else LIMITLESS_BASE) + href
        standings.append({"rank": rank, "player": player, "deck_name": deck_name or "Unknown", "list_url": list_url})
    return standings


def scrape_decklist(url):
    if not url: return None
    soup = limitless_soup(url)
    if not soup: return None
    for script in soup.find_all("script", type="application/json"):
        if "data-sveltekit-fetched" in script.attrs and script.string and "pokemon" in script.string:
            try:
                data = json.loads(script.string)
                body = json.loads(data.get("body", "{}"))
                msg = body.get("message", {})
                if "pokemon" in msg:
                    dl = {"pokemon": [], "trainer": [], "energy": []}
                    for cat in ("pokemon", "trainer", "energy"):
                        for item in msg.get(cat, []):
                            dl[cat].append({"count": item.get("count",0), "name": item.get("name",""),
                                           "set": item.get("set",""), "number": item.get("number","")})
                    return dl
            except Exception: pass
    dl = {"pokemon": [], "trainer": [], "energy": []}
    container = soup.find("div", class_="decklist") or soup.find("body")
    lines = [l.strip() for l in container.get_text("\n").split("\n") if l.strip()]
    cur = None
    for i, line in enumerate(lines):
        if "Pokemon" in line or "Pok" in line: cur = "pokemon"
        elif "Trainer" in line: cur = "trainer"
        elif "Energy" in line: cur = "energy"
        elif cur and re.match(r"^\d+$", line) and i+1 < len(lines):
            dl[cur].append({"count": int(line), "name": lines[i+1]})
    return dl

def sync_limitless(dry_run=False):
    log("=== LIMITLESS TCG SYNC START ===")
    stats = {"tournaments_checked": 0, "tournaments_new": 0, "standings_scraped": 0,
             "decklists_downloaded": 0, "decklists_imported": 0, "cards_imported": 0, "cards_missing": 0}

    tourneys = scrape_tournament_list()
    stats["tournaments_checked"] = len(tourneys)
    if not tourneys:
        log("No tournaments found")
        return stats

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    existing = {r[0] for r in cursor.execute("SELECT id FROM tournaments").fetchall()}
    new_tourneys = [t for t in tourneys if f"limitless-{t['id']}" not in existing]
    stats["tournaments_new"] = len(new_tourneys)
    log(f"New tournaments: {len(new_tourneys)} / {len(tourneys)}")

    if not new_tourneys:
        conn.close()
        log("No new tournaments to sync")
        return stats

    if dry_run:
        conn.close()
        for t in new_tourneys:
            log(f"  WOULD SYNC: {t['id']}: {t['name']} ({t['date']})")
        return stats

    card_index = CardIndex(cursor)

    for i, t in enumerate(new_tourneys):
        tid = t["id"]
        log(f"  [{i+1}/{len(new_tourneys)}] {tid}: {t['name']}")
        cursor.execute(
            "INSERT INTO tournaments (id, external_id, name, date, format, location, created_at) "
            "VALUES (?,?,?,?,'Standard',?,CURRENT_TIMESTAMP) "
            "ON CONFLICT(id) DO UPDATE SET name=excluded.name, date=excluded.date, location=excluded.location",
            (f"limitless-{tid}", tid, t["name"], t["date"], t.get("players", "")))
        standings = scrape_standings(tid, limit=32)
        stats["standings_scraped"] += len(standings)
        log(f"    Standings: {len(standings)}")

        for s in standings:
            decklist = None
            if s["list_url"]:
                decklist = scrape_decklist(s["list_url"])
                time.sleep(0.15)
                if decklist: stats["decklists_downloaded"] += 1
            if not decklist: continue

            rank = str(s.get("rank", "0"))
            player = s.get("player", "Unknown")
            archetype = s.get("deck_name", "Unknown")
            deck_id = f"tourney-{tid}-{rank}"
            deck_name = f"{archetype} ({player}) - {t['name']}"

            cursor.execute(
                "INSERT INTO decks (id, name, archetype, description, format, tournament_count, updated_at) "
                "VALUES (?,?,?,?,'Standard',1,CURRENT_TIMESTAMP) "
                "ON CONFLICT(id) DO UPDATE SET name=excluded.name, archetype=excluded.archetype, "
                "description=excluded.description, updated_at=CURRENT_TIMESTAMP",
                (deck_id, deck_name, archetype, f"Rank {rank} at {t['name']} by {player}"))
            stats["decklists_imported"] += 1

            list_id = f"list-{deck_id}"
            cursor.execute(
                "INSERT INTO decklists (id, deck_id, name, player_name, tournament_id, placement, created_at) "
                "VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP) "
                "ON CONFLICT(id) DO UPDATE SET name=excluded.name, player_name=excluded.player_name, "
                "tournament_id=excluded.tournament_id, placement=excluded.placement",
                (list_id, deck_id, f"Official List - Rank {rank}", player, f"limitless-{tid}", to_int(rank)))
            cursor.execute("DELETE FROM deck_cards WHERE deck_id = ?", (list_id,))

            for cat in ("pokemon", "trainer", "energy"):
                for cd in decklist.get(cat, []) or []:
                    cn = cd.get("name", "")
                    cnt = to_int(cd.get("count"))
                    if not cn or cnt <= 0: continue
                    cid, dbcat = card_index.find(cn)
                    if cid:
                        cursor.execute("INSERT INTO deck_cards (deck_id, card_id, count, is_pokemon) VALUES (?,?,?,?)",
                                       (list_id, cid, cnt, dbcat == "Pokemon"))
                        stats["cards_imported"] += cnt
                    else:
                        stats["cards_missing"] += 1
        time.sleep(0.3)

    conn.commit()
    conn.close()
    log(f"LimitlessTCG sync done: {stats['tournaments_new']} new, {stats['decklists_imported']} decklists")
    return stats


# ===================================================================
# Main
# ===================================================================

def main():
    import argparse
    parser = argparse.ArgumentParser(description="Pokemon TCG Indonesia - Auto-Sync")
    parser.add_argument("--cards-only", action="store_true", help="Only sync Pokepedia cards + images")
    parser.add_argument("--tournaments-only", action="store_true", help="Only sync LimitlessTCG tournaments")
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
        result["limitless"] = sync_limitless(dry_run=args.dry_run)

    log("=" * 60)
    log("SYNC COMPLETE")
    log(json.dumps(result, indent=2, default=str))
    log("=" * 60)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
