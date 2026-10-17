#!/usr/bin/env python3
"""
Sync Japanese City League tournaments from limitlesstcg.com/tournaments/jp.

Flow: listing (paginated, 25/page) -> tournament detail (players + decklist
links) -> decklist pages (cards via data-set/data-number + counts).

Decklists are matched to our cards table by (expansion_code, number) first,
falling back to English name matching via the same CardIndex used elsewhere.
Tournament rows carry the winner archetype; players without a decklist link
are recorded as plain standing rows.

Usage:
  python sync_jp_tournaments.py                 # incremental (new IDs only)
  python sync_jp_tournaments.py --pages 10      # limit listing pages
  python sync_jp_tournaments.py --dry-run
"""

from __future__ import annotations

import argparse
import json
import re
import sqlite3
import sys
import time
from pathlib import Path

import requests

ROOT_DIR = Path(__file__).resolve().parents[2]
DB_PATH = ROOT_DIR / "backend-go" / "pokemon_tcg.db"
BASE = "https://limitlesstcg.com"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
}


def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def get(session: requests.Session, url: str, retries: int = 4) -> str | None:
    for attempt in range(retries):
        try:
            resp = session.get(url, timeout=30)
            if resp.status_code == 429 and attempt < retries - 1:
                wait = 15 * (attempt + 1)
                log(f"  429, wait {wait}s")
                time.sleep(wait)
                continue
            if resp.status_code != 200:
                return None
            return resp.text
        except requests.RequestException:
            return None
    return None


def strip_ws(text: str | None) -> str:
    if not text:
        return ""
    return re.sub(r"\s+", " ", text).strip()


def parse_listing(html: str) -> list[dict]:
    """One row per tournament: id, date, prefecture, shop, winner archetype."""
    rows = []
    for m in re.finditer(
        r'<tr data-date="([^"]*)" data-city="([^"]*)" data-shop="([^"]*)" data-winner="([^"]*)">\s*'
        r'<td><a href="https://limitlesstcg.com/tournaments/jp/(\d+)">',
        html,
    ):
        rows.append({
            "date": normalize_date(m.group(1)),
            "city": strip_ws(m.group(2)),
            "shop": strip_ws(m.group(3)),
            "winner": strip_ws(m.group(4)),
            "id": m.group(5),
        })
    return rows


def normalize_date(value: str) -> str:
    if not value:
        return ""
    value = value.strip()
    if len(value) >= 10 and value[4] == "-" and value[7] == "-":
        return value[:10]
    try:
        from datetime import datetime
        return datetime.strptime(value, "%d %b %y").strftime("%Y-%m-%d")
    except ValueError:
        return value


def parse_tournament_detail(html: str) -> list[dict]:
    """Rows of the standings table: rank, player, decklist link, archetype.

    Row shape:
      <tr><td>1</td><td><a href="/players/...">NAME</a></td>
      <td><a href=".../decks/list/jp/74740"><img alt="lucario-mega">...</a></td>
      <td> <a href=".../decks/list/jp/74740">...</a></td></tr>
    """
    entries = []
    # isolate the standings table
    tbl = re.search(r'<table class="data-table striped">(.*?)</table>', html, re.S)
    if not tbl:
        return entries
    for rm in re.finditer(r'<tr>(.*?)</tr>', tbl.group(1), re.S):
        row = rm.group(1)
        cells = re.findall(r'<td[^>]*>(.*?)</td>', row, re.S)
        if len(cells) < 2 or not cells[0].strip().isdigit():
            continue
        rank = int(cells[0].strip())
        pm = re.search(r'>([^<>]+)</a>', cells[1]) or re.match(r'\s*([^<]+?)\s*$', cells[1])
        player = strip_ws(pm.group(1)) if pm else ""
        lm = re.search(r'/decks/list/jp/(\d+)', row)
        list_id = lm.group(1) if lm else None
        alts = re.findall(r'<img class="pokemon"[^>]*alt="([^"]+)"', row)
        archetype = " ".join(alts).replace("-", " ").strip()
        if rank and player:
            entries.append({
                "rank": rank, "player": player,
                "list_id": list_id, "archetype": archetype or "Unknown",
            })
    return entries


def parse_decklist(html: str) -> list[dict]:
    """Cards with exact identity: data-set + data-number + count + name."""
    cards = []
    for m in re.finditer(
        r'<div class="decklist-card" data-set="([^"]*)" data-number="([^"]*)"[^>]*>.*?'
        r'<span class="card-count">(\d+)</span>\s*<span class="card-name">([^<]*)</span>',
        html, re.S,
    ):
        cards.append({
            "set": m.group(1), "number": m.group(2),
            "count": int(m.group(3)), "name": strip_ws(m.group(4)),
        })
    return cards


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pages", type=int, default=40, help="Listing pages to scan (25/page)")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--skip-done", action="store_true", help="Skip decklists that already have deck_cards")
    parser.add_argument("--rematch", action="store_true",
                        help="Re-fetch existing JP decklists and rebuild deck_cards "
                             "(recovers cards unmatched before new sets were imported)")
    args = parser.parse_args()

    session = requests.Session()
    session.headers.update(HEADERS)

    conn = sqlite3.connect(DB_PATH, timeout=60)
    cur = conn.cursor()

    # card identity index: (set, padded number) -> id, and name -> id
    cur.execute("SELECT id, expansion_code, collector_number, name_id, name_en FROM cards")
    by_setnum: dict[tuple[str, str], str] = {}
    by_name: dict[str, str] = {}
    for cid, exp, cn, name_id, name_en in cur.fetchall():
        if exp and cn:
            m = re.match(r"(\d+)", cn)
            if m:
                by_setnum[(exp, m.group(1))] = cid
        for n in (name_id, name_en):
            if n:
                by_name.setdefault(n.lower(), cid)

    stats = {"tournaments": 0, "decklists": 0, "cards": 0, "unmatched": 0}

    if args.rematch:
        if args.skip_done:
            # opt-in resume mode: only decklists without any deck_cards yet
            cur.execute(
                "SELECT d.id FROM decks d WHERE d.id LIKE 'jpdeck-%' AND NOT EXISTS "
                "(SELECT 1 FROM deck_cards dc WHERE dc.deck_id = 'list-' || d.id)"
            )
        else:
            cur.execute("SELECT id FROM decks WHERE id LIKE 'jpdeck-%'")
        deck_ids = [r[0] for r in cur.fetchall()]
        log(f"rematch: {len(deck_ids)} decklist JP")
        # refresh identity indexes with the newly imported sets
        cur.execute("SELECT id, expansion_code, collector_number, name_id, name_en FROM cards")
        for cid, exp, cn, name_id, name_en in cur.fetchall():
            if exp and cn:
                m = re.match(r"(\d+)", cn)
                if m:
                    by_setnum[(exp, m.group(1))] = cid
            for n in (name_id, name_en):
                if n:
                    by_name.setdefault(n.lower(), cid)
        for i, deck_id in enumerate(deck_ids, 1):
            list_id = f"list-{deck_id}"
            ext = deck_id.replace("jpdeck-", "")
            dl_html = get(session, f"{BASE}/decks/list/jp/{ext}")
            time.sleep(0.35)
            if not dl_html:
                continue
            cards = parse_decklist(dl_html)
            if not cards:
                continue
            cur.execute("DELETE FROM deck_cards WHERE deck_id = ?", (list_id,))
            matched = 0
            for c in cards:
                cid = by_setnum.get((c["set"], c["number"])) or by_name.get(c["name"].lower())
                if cid:
                    cur.execute(
                        "INSERT INTO deck_cards (deck_id, card_id, count, is_pokemon) VALUES (?,?,?,?)",
                        (list_id, cid, c["count"], None),
                    )
                    matched += c["count"]
                else:
                    stats["unmatched"] += 1
            stats["decklists"] += 1
            stats["cards"] += matched
            if i % 25 == 0:
                conn.commit()
                log(f"  rematch {i}/{len(deck_ids)}: {stats}")
        conn.commit()
        conn.close()
        log(f"REMATCH DONE: {json.dumps(stats)}")
        return 0

    for page in range(1, args.pages + 1):
        html = get(session, f"{BASE}/tournaments/jp?page={page}")
        if not html:
            log(f"listing page {page} failed, stopping")
            break
        rows = parse_listing(html)
        if not rows:
            break
        log(f"page {page}: {len(rows)} turnamen")
        for row in rows:
            tid = row["id"]
            tdb_id = f"jpleague-{tid}"
            cur.execute("SELECT 1 FROM tournaments WHERE id = ?", (tdb_id,))
            if cur.fetchone():
                continue  # already synced
            detail = get(session, f"{BASE}/tournaments/jp/{tid}")
            time.sleep(0.4)
            if not detail:
                continue
            entries = parse_tournament_detail(detail)
            if args.dry_run:
                log(f"  WOULD SYNC {tid}: {row['shop'][:30]} ({len(entries)} pemain)")
                stats["tournaments"] += 1
                continue

            cur.execute(
                "INSERT OR IGNORE INTO tournaments (id, external_id, name, date, format, location, created_at) "
                "VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)",
                (tdb_id, tid, f"City League {row['city']} {row['shop']}"[:120], row["date"],
                 "Standard JP", f"{row['city']}, JP"),
            )
            stats["tournaments"] += 1

            for e in entries:
                if not e["list_id"]:
                    continue  # no published list
                dl_html = get(session, f"{BASE}/decks/list/jp/{e['list_id']}")
                time.sleep(0.4)
                if not dl_html:
                    continue
                cards = parse_decklist(dl_html)
                if not cards:
                    continue
                archetype = e["archetype"].replace("-", " ").title() or "Unknown"
                deck_id = f"jpdeck-{e['list_id']}"
                deck_name = f"{archetype} ({e['player']}) - City League {row['city']}"
                cur.execute(
                    "INSERT OR IGNORE INTO decks (id, name, archetype, description, format, tournament_count, updated_at) "
                    "VALUES (?,?,?,?,?,1,CURRENT_TIMESTAMP)",
                    (deck_id, deck_name[:180], archetype, f"Rank {e['rank']} at City League {row['city']} ({row['shop']})"[:200], "Standard JP"),
                )
                list_id = f"list-{deck_id}"
                cur.execute(
                    "INSERT OR IGNORE INTO decklists (id, deck_id, name, player_name, tournament_id, placement, created_at) "
                    "VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)",
                    (list_id, deck_id, f"City League List Rank {e['rank']}", e["player"], tdb_id, e["rank"]),
                )
                cur.execute("DELETE FROM deck_cards WHERE deck_id = ?", (list_id,))
                matched = 0
                for c in cards:
                    cid = by_setnum.get((c["set"], c["number"])) or by_name.get(c["name"].lower())
                    if cid:
                        cur.execute(
                            "INSERT INTO deck_cards (deck_id, card_id, count, is_pokemon) VALUES (?,?,?,?)",
                            (list_id, cid, c["count"], None),
                        )
                        matched += c["count"]
                    else:
                        stats["unmatched"] += 1
                stats["decklists"] += 1
                stats["cards"] += matched
            if stats["tournaments"] % 20 == 0:
                conn.commit()
        if page % 5 == 0:
            conn.commit()
            log(f"checkpoint: {stats}")
    conn.commit()
    conn.close()
    log(f"DONE: {json.dumps(stats)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
