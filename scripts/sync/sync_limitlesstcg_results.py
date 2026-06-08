#!/usr/bin/env python3
"""
Sync LimitlessTCG tournament/decklist scrape results into SQLite.

Default input is the newest MASTER/full Limitless JSON under:
  data/data_deck_limitlesstcg/**
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import sys
from pathlib import Path
from typing import Any

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

ROOT_DIR = Path(__file__).resolve().parents[2]
DEFAULT_DB_PATH = ROOT_DIR / "backend-go" / "pokemon_tcg.db"
DEFAULT_LIMITLESS_DIR = ROOT_DIR / "data" / "data_deck_limitlesstcg"


def find_default_limitless_file() -> Path | None:
    patterns = [
        "**/MASTER_full_update_*.json",
        "**/MASTER_deep_scrape_*.json",
        "**/limitlesstcg_full_update_*.json",
        "**/limitlesstcg_deep_*.json",
        "**/limitlesstcg_complete_all.json",
    ]
    candidates: list[Path] = []
    for pattern in patterns:
        candidates.extend(DEFAULT_LIMITLESS_DIR.glob(pattern))
    if not candidates:
        return None
    return max(candidates, key=lambda path: path.stat().st_mtime)


def normalize_name(value: str) -> str:
    value = value.lower()
    value = re.sub(r"\b(ex|vstar|vmax|gx|radiant)\b", "", value)
    value = re.sub(r"[^a-z0-9\s'’-]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


class CardIndex:
    def __init__(self, cursor: sqlite3.Cursor):
        self.by_name: dict[str, tuple[str, str]] = {}
        self.by_clean_name: dict[str, tuple[str, str]] = {}
        self.search_rows: list[tuple[str, str, str]] = []

        cursor.execute(
            """
            SELECT id, COALESCE(name_en, ''), COALESCE(name_id, ''), COALESCE(category, '')
            FROM cards
            ORDER BY (expansion_code IS NOT NULL) DESC, updated_at DESC
            """
        )
        for card_id, name_en, name_id, category in cursor.fetchall():
            value = (str(card_id), category)
            for name in {name_en, name_id}:
                if not name:
                    continue
                lowered = name.lower()
                cleaned = normalize_name(name)
                self.by_name.setdefault(lowered, value)
                if cleaned:
                    self.by_clean_name.setdefault(cleaned, value)
                    self.search_rows.append((cleaned, value[0], value[1]))

    def find(self, name: str) -> tuple[str | None, str | None]:
        lowered = name.lower()
        if lowered in self.by_name:
            return self.by_name[lowered]

        cleaned = normalize_name(name)
        if cleaned in self.by_clean_name:
            return self.by_clean_name[cleaned]

        # Last resort: bounded in-memory contains search. This is intentionally
        # less exact, but far faster than running LIKE scans per deck card.
        if len(cleaned) >= 4:
            for indexed_name, card_id, category in self.search_rows:
                if cleaned in indexed_name or indexed_name in cleaned:
                    return card_id, category

        return None, None


def to_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def iter_standings(data: dict[str, Any]):
    for tournament in data.get("tournaments", []) or []:
        for standing in tournament.get("standings", []) or []:
            yield tournament, standing


def sync_results(json_file: Path, db_path: Path) -> dict[str, int]:
    if not json_file.exists():
        raise FileNotFoundError(f"Limitless file not found: {json_file}")

    with json_file.open("r", encoding="utf-8") as handle:
        data = json.load(handle)

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    card_index = CardIndex(cursor)

    tournaments = data.get("tournaments", []) or []
    stats = {
        "tournaments": len(tournaments),
        "standings": 0,
        "decks": 0,
        "decklists": 0,
        "cards": 0,
        "missing_cards": 0,
    }

    print(f"🔄 Sync LimitlessTCG dari {json_file}")
    print(f"📊 Processing {len(tournaments)} tournaments...")

    for tournament, standing in iter_standings(data):
        stats["standings"] += 1
        decklist = standing.get("decklist")
        if not decklist:
            continue

        tournament_id = str(tournament.get("id") or "")
        tournament_name = tournament.get("name") or "Unknown Tournament"
        player = standing.get("player") or "Unknown"
        rank = str(standing.get("rank") or "0")
        deck_archetype = standing.get("deck_name") or "Unknown"

        cursor.execute(
            """
            INSERT INTO tournaments (id, external_id, name, date, format, location, created_at)
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
                external_id = excluded.external_id,
                name = excluded.name,
                date = excluded.date,
                format = excluded.format,
                location = excluded.location
            """,
            (
                f"limitless-{tournament_id}" if tournament_id else tournament_name,
                tournament_id,
                tournament_name,
                tournament.get("date"),
                "Standard",
                tournament.get("players") or "",
            ),
        )

        deck_id = f"tourney-{tournament_id}-{rank}"
        deck_name = f"{deck_archetype} ({player}) - {tournament_name}"

        cursor.execute(
            """
            INSERT INTO decks (id, name, archetype, description, format, tournament_count, updated_at)
            VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                archetype = excluded.archetype,
                description = excluded.description,
                format = excluded.format,
                tournament_count = excluded.tournament_count,
                updated_at = CURRENT_TIMESTAMP
            """,
            (deck_id, deck_name, deck_archetype, f"Rank {rank} at {tournament_name} by {player}", "Standard"),
        )
        stats["decks"] += 1

        list_id = f"list-{deck_id}"
        cursor.execute(
            """
            INSERT INTO decklists (id, deck_id, name, player_name, tournament_id, placement, created_at)
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                player_name = excluded.player_name,
                tournament_id = excluded.tournament_id,
                placement = excluded.placement
            """,
            (list_id, deck_id, f"Official List - Rank {rank}", player, f"limitless-{tournament_id}", to_int(rank)),
        )
        stats["decklists"] += 1

        cursor.execute("DELETE FROM deck_cards WHERE deck_id = ?", (deck_id,))

        total_cards = 0
        for category in ["pokemon", "trainer", "energy"]:
            for card_data in decklist.get(category, []) or []:
                card_name = card_data.get("name") or ""
                count = to_int(card_data.get("count"), 0)
                if not card_name or count <= 0:
                    continue

                card_id, db_category = card_index.find(card_name)
                if card_id:
                    cursor.execute(
                        """
                        INSERT INTO deck_cards (deck_id, card_id, count, is_pokemon)
                        VALUES (?, ?, ?, ?)
                        """,
                        (list_id, card_id, count, db_category == "Pokemon"),
                    )
                    total_cards += count
                    stats["cards"] += count
                else:
                    stats["missing_cards"] += 1

        print(f"   ✅ {deck_id}: imported {total_cards} cards")

    conn.commit()
    conn.close()

    print("\n🎉 Sinkronisasi LimitlessTCG selesai!")
    for key, value in stats.items():
        print(f"   {key}: {value}")
    print(f"   DB: {db_path}")
    return stats


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Sync LimitlessTCG scrape data into SQLite.")
    parser.add_argument("json_file", nargs="?", help="Limitless JSON file. Defaults to newest file in data directory.")
    parser.add_argument("--db", default=os.environ.get("DB_PATH") or str(DEFAULT_DB_PATH), help="SQLite DB path")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    json_file = Path(args.json_file) if args.json_file else find_default_limitless_file()
    if not json_file:
        print("No LimitlessTCG update files found.")
        return 1

    db_path = Path(args.db)
    if not db_path.is_absolute():
        db_path = ROOT_DIR / "backend-go" / db_path

    sync_results(json_file, db_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
