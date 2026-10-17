#!/usr/bin/env python3
"""
Import inventory_kartu_saya.md into pokelab collections.

Parses the markdown inventory file and matches cards against the database
by Indonesian name (name_id). Creates a new collection for user 'abagasw'
named 'Koleksi Kartu Saya' with the matched items.

Usage:
  python scripts/import_inventory.py
"""

import re
import sqlite3
import sys
from pathlib import Path
from collections import defaultdict
from datetime import datetime, timezone
import uuid

ROOT = Path(__file__).resolve().parents[1]
INV_FILE = ROOT / "inventory_kartu_saya.md"
DB_PATH = ROOT / "backend-go" / "pokemon_tcg.db"

# User abagasw
USER_ID = "6ec70de4-e190-4b3d-8254-3396c0da396a"
COLLECTION_NAME = "Koleksi Kartu Saya"

# Known name mappings for unmatched items
NAME_MAPPINGS = {
    # Energy - Indonesian basic energy names
    "Energi Dark": "Energi Dasar [Kegelapan]",
    "Energi Physic": "Energi Dasar [Psikis]",
    "Energi Recycle": "Energi Daur Ulang",
    "Energi Tim Rocket": "Energi Tim Roket",
    
    # Trainer - name corrections
    "Perintah Boss": "Perintah Bos [Giovanni]",
    "Sisik Sangat Tabal": "Sisik Sangat Tebal",
    "Wonder Parch SR": "Wonder Patch",
    "Siklon Pengangkat ACE": "Siklon Pengangkat Pokémon",
    "Bola Pokémon": "Bola Pokémon",  # exact
    "Bola Ultra": "Bola Ultra",  # exact
    
    # ACE SPEC - mapped to Trainer in DB
    "Neutral Center": "Neutral Center",
    "Perfect Mixer": "Perfect Mixer",
    "Scramble Switch": "Scramble Switch",
}

# Normalization for fuzzy matching
def normalize(name: str) -> str:
    """Normalize name for fuzzy matching."""
    # Replace common variations
    name = name.replace("Daffin", "Dafin").replace("Roket", "Rocket").replace("Lilie", "Lillie")
    name = name.replace("Fleetchinder", "Fletchinder")
    name = name.replace("Fosing", "Fosil").replace("Using", "Usang")
    name = name.replace("Daffin", "Dafin")
    # Lowercase, remove punctuation except hyphens and apostrophes
    name = name.lower()
    name = re.sub(r"[^\w\s\-']+", " ", name)
    name = re.sub(r"\s+", " ", name).strip()
    return name

def parse_inventory(filepath: Path) -> list[tuple[int, str, str]]:
    """Parse inventory markdown into (qty, name, category) tuples."""
    text = filepath.read_text(encoding="utf-8")
    items = []
    current_cat = ""
    
    cat_map = {
        "ex / Mega": "ex",
        "Pokémon Normal": "pokemon",
        "Trainer": "trainer",
        "Energy": "energy",
        "ACE SPEC": "ace",
    }
    
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith(">") or line.startswith("#"):
            if line.startswith("##"):
                cat = line[2:].strip()
                current_cat = cat_map.get(cat, cat.lower())
            continue
        
        # Match pattern: - [Nx] Name
        m = re.match(r"^-\s*\[(\d+)x\]\s+(.+)$", line)
        if m:
            qty = int(m.group(1))
            name = m.group(2).strip()
            items.append((qty, name, current_cat))
    
    return items

def build_card_index(cursor) -> dict[str, list[tuple[str, str]]]:
    """Build name_id -> list of (card_id, category) index."""
    idx = defaultdict(list)
    norm_idx = defaultdict(list)
    cursor.execute("SELECT id, name_id, category FROM cards")
    for card_id, name_id, category in cursor.fetchall():
        if not name_id:
            continue
        idx[name_id].append((card_id, category or "Unknown"))
        norm_idx[normalize(name_id)].append((card_id, category or "Unknown"))
    return idx, norm_idx

def match_card(name: str, cat: str, idx: dict, norm_idx: dict) -> tuple[str | None, str | None, str]:
    """Match inventory item to card. Returns (card_id, db_category, match_type)."""
    # 1. Check explicit mappings first
    mapped_name = NAME_MAPPINGS.get(name, name)
    if mapped_name != name:
        # Try mapped name
        if mapped_name in idx:
            matches = idx[mapped_name]
            if len(matches) == 1:
                return matches[0][0], matches[0][1], "mapped_exact"
            for cid, dbcat in matches:
                if cat in dbcat.lower() or dbcat.lower() in cat:
                    return cid, dbcat, "mapped_cat"
            return matches[0][0], matches[0][1], "mapped_multi"
        
        nname = normalize(mapped_name)
        if nname in norm_idx:
            matches = norm_idx[nname]
            if len(matches) == 1:
                return matches[0][0], matches[0][1], "mapped_norm"
            for cid, dbcat in matches:
                if cat in dbcat.lower() or dbcat.lower() in cat:
                    return cid, dbcat, "mapped_norm_cat"
            return matches[0][0], matches[0][1], "mapped_norm_multi"
    
    # 2. Exact match
    if name in idx:
        matches = idx[name]
        if len(matches) == 1:
            return matches[0][0], matches[0][1], "exact"
        # Multiple exact matches - prefer matching category
        for cid, dbcat in matches:
            if cat in dbcat.lower() or dbcat.lower() in cat:
                return cid, dbcat, "exact_cat"
        return matches[0][0], matches[0][1], "exact_multi"
    
    # 3. Normalized match
    nname = normalize(name)
    if nname in norm_idx:
        matches = norm_idx[nname]
        if len(matches) == 1:
            return matches[0][0], matches[0][1], "norm"
        for cid, dbcat in matches:
            if cat in dbcat.lower() or dbcat.lower() in cat:
                return cid, dbcat, "norm_cat"
        return matches[0][0], matches[0][1], "norm_multi"
    
    # 4. Partial match (name contains or contained in normalized key)
    for nkey, matches in norm_idx.items():
        if nname in nkey or nkey in nname:
            if matches:
                return matches[0][0], matches[0][1], f"partial:{nkey}"
    
    return None, None, "no_match"

def main():
    if not INV_FILE.exists():
        print(f"Inventory file not found: {INV_FILE}")
        sys.exit(1)
    if not DB_PATH.exists():
        print(f"Database not found: {DB_PATH}")
        sys.exit(1)
    
    # Parse inventory
    items = parse_inventory(INV_FILE)
    print(f"Parsed {len(items)} inventory entries")
    
    # Build card index
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    idx, norm_idx = build_card_index(cursor)
    print(f"Database has {len(idx)} unique name_id entries")
    
    # Match items
    matched = []
    unmatched = []
    ambiguous = []
    
    for qty, name, cat in items:
        card_id, dbcat, mtype = match_card(name, cat, idx, norm_idx)
        if card_id:
            matched.append((card_id, qty, name, cat, mtype, dbcat))
            if "multi" in mtype:
                candidates = idx[name] if name in idx else norm_idx[normalize(name)]
                ambiguous.append((name, cat, len(candidates)))
        else:
            unmatched.append((qty, name, cat))
    
    print(f"\nMatched: {len(matched)}")
    print(f"Unmatched: {len(unmatched)}")
    if ambiguous:
        print(f"Ambiguous matches (multiple cards with same name): {len(ambiguous)}")
    
    # Show unmatched
    if unmatched:
        print("\n=== UNMATCHED ITEMS ===")
        for qty, name, cat in unmatched:
            print(f"  [{qty}x] {name} ({cat})")
    
    # Show ambiguous
    if ambiguous:
        print("\n=== AMBIGUOUS MATCHES (first match used) ===")
        for name, cat, count in ambiguous[:20]:
            print(f"  {name} ({cat}) -> {count} candidates")
    
    # Create/update collection
    collection_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    cursor.execute(
        "INSERT INTO collections (id, user_id, name, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        (collection_id, USER_ID, COLLECTION_NAME, 0, now, now)
    )
    print(f"\nCreated collection '{COLLECTION_NAME}' (id={collection_id})")
    
    # Insert collection items
    inserted = 0
    for card_id, qty, name, cat, mtype, dbcat in matched:
        cursor.execute(
            """INSERT INTO collection_items (collection_id, card_id, quantity, condition, created_at, updated_at)
               VALUES (?, ?, ?, 'NM', ?, ?)""",
            (collection_id, card_id, qty, now, now)
        )
        inserted += 1
    
    conn.commit()
    conn.close()
    
    print(f"Inserted {inserted} items into collection")
    print(f"\nDone! Collection '{COLLECTION_NAME}' created for user abagasw.")
    print(f"Collection ID: {collection_id}")

if __name__ == "__main__":
    main()
