#!/usr/bin/env python3
"""
Backfill Pokemon card detail fields from data/data_card_indo/all_data.json into SQLite.

This script updates the cards table with nested details (hp, card_type,
attacks, abilities, weakness, resistance, pokedex, evolution fields) and can
also populate an empty database from the same source file.

Usage:
  python scripts/sync/backfill_card_details.py --db pokemon_tcg.db
  python scripts/sync/backfill_card_details.py --db data/pokemon_tcg.db --db backend-go/pokemon_tcg.db
"""

from __future__ import annotations

import argparse
import json
import re
import sqlite3
from pathlib import Path
from typing import Any


ROOT_DIR = Path(__file__).resolve().parents[2]
DEFAULT_DATA_FILE = ROOT_DIR / "data" / "data_card_indo" / "all_data.json"
DEFAULT_DB_PATHS = [ROOT_DIR / "pokemon_tcg.db", ROOT_DIR / "data" / "pokemon_tcg.db"]


def load_data(data_file: Path) -> dict[str, Any]:
    with data_file.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict) or "data" not in data:
        raise ValueError(f"Unexpected data format: {data_file}")
    return data


def slugify(value: str) -> str:
    value = value.lower().strip()
    value = value.replace("'", "").replace(".", "")
    value = re.sub(r"\s+", "_", value)
    value = re.sub(r"[^a-z0-9_\-]", "", value)
    value = re.sub(r"_+", "_", value)
    return value.strip("_")


def generate_card_id(expansion_code: str, collector_number: str, name_id: str) -> str:
    normalized_number = collector_number.replace("/", "-")
    card_id = f"{expansion_code}-{normalized_number}-{slugify(name_id)}"
    if len(card_id) > 100:
        return f"{expansion_code}-{normalized_number}"
    return card_id


def to_json(value: Any) -> str | None:
    if value is None:
        return None
    if value == [] or value == {}:
        return json.dumps(value, ensure_ascii=False)
    return json.dumps(value, ensure_ascii=False)


def parse_int(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        value = value.strip()
        if not value:
            return None
        match = re.search(r"-?\d+", value)
        if match:
            return int(match.group(0))
    return None


def first_non_empty(*values: Any) -> Any:
    for value in values:
        if value is None:
            continue
        if isinstance(value, str) and not value.strip():
            continue
        return value
    return None


def ensure_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS expansions (
            id INTEGER PRIMARY KEY,
            code TEXT UNIQUE NOT NULL,
            name_id TEXT,
            name_en TEXT,
            series_id INTEGER,
            series_name_en TEXT,
            series_name_id TEXT,
            product_type TEXT,
            total_cards INTEGER,
            released_at DATE,
            pack_image_url TEXT,
            set_symbol_url TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS cards (
            id TEXT PRIMARY KEY,
            external_id INTEGER,
            name_id TEXT NOT NULL,
            name_en TEXT,
            category TEXT NOT NULL,
            expansion_code TEXT,
            collector_number TEXT,
            regulation_mark TEXT,
            rarity TEXT,
            illustrator TEXT,
            image_url TEXT,
            hp INTEGER,
            card_type TEXT,
            evolution_stage TEXT,
            evolves_from TEXT,
            retreat_cost INTEGER,
            attacks TEXT,
            abilities TEXT,
            weakness TEXT,
            resistance TEXT,
            pokedex TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS card_attacks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            card_id TEXT NOT NULL,
            name TEXT NOT NULL,
            damage TEXT,
            description TEXT,
            energy_cost TEXT,
            FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS card_abilities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            card_id TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            ability_type TEXT,
            FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
        );
        """
    )


def backfill_database(db_path: Path, master_data: dict[str, Any]) -> tuple[int, int]:
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")
    ensure_schema(conn)

    expansion_sql = """
        INSERT INTO expansions (
            id, code, name_id, name_en, series_id, series_name_en, series_name_id,
            product_type, total_cards, released_at, pack_image_url, set_symbol_url, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(code) DO UPDATE SET
            name_id = excluded.name_id,
            name_en = excluded.name_en,
            series_id = excluded.series_id,
            series_name_en = excluded.series_name_en,
            series_name_id = excluded.series_name_id,
            product_type = excluded.product_type,
            total_cards = excluded.total_cards,
            released_at = excluded.released_at,
            pack_image_url = excluded.pack_image_url,
            set_symbol_url = excluded.set_symbol_url
    """

    card_sql = """
        INSERT INTO cards (
            id, external_id, name_id, name_en, category, expansion_code,
            collector_number, regulation_mark, rarity, illustrator, image_url,
            hp, card_type, evolution_stage, evolves_from, retreat_cost,
            attacks, abilities, weakness, resistance, pokedex, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
            external_id = excluded.external_id,
            name_id = excluded.name_id,
            name_en = excluded.name_en,
            category = excluded.category,
            expansion_code = excluded.expansion_code,
            collector_number = excluded.collector_number,
            regulation_mark = excluded.regulation_mark,
            rarity = excluded.rarity,
            illustrator = excluded.illustrator,
            image_url = excluded.image_url,
            hp = excluded.hp,
            card_type = excluded.card_type,
            evolution_stage = excluded.evolution_stage,
            evolves_from = excluded.evolves_from,
            retreat_cost = excluded.retreat_cost,
            attacks = excluded.attacks,
            abilities = excluded.abilities,
            weakness = excluded.weakness,
            resistance = excluded.resistance,
            pokedex = excluded.pokedex,
            updated_at = CURRENT_TIMESTAMP
    """

    attack_sql = """
        INSERT INTO card_attacks (card_id, name, damage, description, energy_cost)
        VALUES (?, ?, ?, ?, ?)
    """

    ability_sql = """
        INSERT INTO card_abilities (card_id, name, description, ability_type)
        VALUES (?, ?, ?, ?)
    """

    expansion_count = 0
    card_count = 0

    with conn:
        for entry in master_data.get("data", []):
            expansion = entry.get("expansion", {}) or {}
            exp_code = expansion.get("code") or ""
            if not exp_code:
                continue

            conn.execute(
                expansion_sql,
                (
                    expansion.get("id"),
                    exp_code,
                    expansion.get("name_id"),
                    expansion.get("name_en"),
                    expansion.get("series_id"),
                    (expansion.get("series") or {}).get("name_en"),
                    (expansion.get("series") or {}).get("name_id"),
                    expansion.get("product_type"),
                    expansion.get("total_cards"),
                    expansion.get("released_at"),
                    expansion.get("pack_image_url"),
                    expansion.get("set_symbol_url"),
                ),
            )
            expansion_count += 1

            for card in entry.get("cards", []) or []:
                collector_number = card.get("collector_number") or ""
                name_id = card.get("name_id") or card.get("name_en") or ""
                if not collector_number or not name_id:
                    continue

                details = card.get("details") or {}
                hp = first_non_empty(card.get("hp"), details.get("hp"))
                card_type = first_non_empty(card.get("card_type"), details.get("card_type"))
                evolution_stage = first_non_empty(card.get("evolution_stage"), details.get("evolution_stage"))
                evolves_from = first_non_empty(card.get("evolves_from"), details.get("evolves_from"))
                retreat_cost = first_non_empty(card.get("retreat_cost"), details.get("retreat_cost"))

                attacks = first_non_empty(card.get("attacks"), details.get("attacks"))
                abilities = first_non_empty(card.get("abilities"), details.get("abilities"))
                weakness = first_non_empty(card.get("weakness"), details.get("weakness"))
                resistance = first_non_empty(card.get("resistance"), details.get("resistance"))
                pokedex = first_non_empty(card.get("pokedex"), details.get("pokedex"))

                card_id = generate_card_id(exp_code, collector_number, name_id)
                name_en = first_non_empty(card.get("name_en"), card.get("name_id"), name_id)
                category = first_non_empty(card.get("category"), "Pokemon")
                conn.execute(
                    card_sql,
                    (
                        card_id,
                        card.get("id"),
                        card.get("name_id"),
                        name_en,
                        category,
                        card.get("expansion_code") or exp_code,
                        collector_number,
                        card.get("regulation_mark"),
                        card.get("rarity"),
                        card.get("illustrator"),
                        card.get("image_url"),
                        parse_int(hp),
                        card_type,
                        evolution_stage,
                        evolves_from,
                        parse_int(retreat_cost),
                        to_json(attacks),
                        to_json(abilities),
                        to_json(weakness),
                        to_json(resistance),
                        to_json(pokedex),
                    ),
                )

                conn.execute("DELETE FROM card_attacks WHERE card_id = ?", (card_id,))
                conn.execute("DELETE FROM card_abilities WHERE card_id = ?", (card_id,))

                if isinstance(attacks, list):
                    for attack in attacks:
                        if not isinstance(attack, dict):
                            continue
                        energy_cost = attack.get("energy_cost")
                        conn.execute(
                            attack_sql,
                            (
                                card_id,
                                attack.get("name") or "",
                                attack.get("damage"),
                                attack.get("description"),
                                to_json(energy_cost),
                            ),
                        )

                if isinstance(abilities, list):
                    for ability in abilities:
                        if not isinstance(ability, dict):
                            continue
                        conn.execute(
                            ability_sql,
                            (
                                card_id,
                                ability.get("name") or "",
                                ability.get("description"),
                                ability.get("type"),
                            ),
                        )

                card_count += 1

    conn.close()
    return expansion_count, card_count


def main() -> int:
    parser = argparse.ArgumentParser(description="Backfill card details into SQLite databases.")
    parser.add_argument("--data", type=Path, default=DEFAULT_DATA_FILE, help="Path to all_data.json")
    parser.add_argument(
        "--db",
        type=Path,
        action="append",
        help="SQLite database path to update. Can be provided multiple times.",
    )
    args = parser.parse_args()

    data_file = args.data
    if not data_file.exists():
        raise SystemExit(f"Data file not found: {data_file}")

    db_paths = args.db or DEFAULT_DB_PATHS
    master_data = load_data(data_file)

    for db_path in db_paths:
        db_path.parent.mkdir(parents=True, exist_ok=True)
        expansions, cards = backfill_database(db_path, master_data)
        print(f"Updated {db_path}: {expansions} expansions, {cards} cards")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())