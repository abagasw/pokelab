#!/usr/bin/env python3
"""
Import card data from limitlesstcg.com card database.

Supports both international sets (/cards/MEG) and Japanese sets (/cards/jp/M6).
Parses set grid pages (numbers + images + rarity from filename) and card
detail pages (name, HP, type, stage, attacks, abilities, regulation mark,
weakness, retreat, illustrator, rarity).

Usage:
  python import_limitless_cards.py --sets MEG MEE ASC DRI 30C
  python import_limitless_cards.py --jp-sets M6
  python import_limitless_cards.py --sets MEG --dry-run --skip-images
"""

from __future__ import annotations

import argparse
import io
import json
import re
import sqlite3
import sys
import time
from pathlib import Path

import requests

ROOT_DIR = Path(__file__).resolve().parents[2]
BASE = "https://limitlesstcg.com"
DB_PATH = Path(__file__).resolve().parents[2] / "backend-go" / "pokemon_tcg.db"
IMG_DIR = Path("/home/garuda-sentra/projects/pokelab/frontend-astro/public/card-images")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
}

ENERGY_LETTERS = {
    "G": "Grass", "R": "Fire", "W": "Water", "L": "Lightning", "P": "Psychic",
    "F": "Fighting", "D": "Darkness", "M": "Metal", "C": "Colorless", "N": "Dragon",
}

TYPE_WORDS = {
    "Grass": "Grass", "Fire": "Fire", "Water": "Water", "Lightning": "Lightning",
    "Psychic": "Psychic", "Fighting": "Fighting", "Darkness": "Darkness",
    "Metal": "Metal", "Dragon": "Dragon", "Colorless": "Colorless",
}

RARITY_WORDS = {
    "Common": "C", "Uncommon": "U", "Rare": "R", "Double Rare": "RR",
    "Ultra Rare": "UR", "Illustration Rare": "AR", "Special IR": "SIR",
    "Hyper Rare": "HR", "ACE": "ACE", "ACE SPEC": "ACE",
}


def strip_ws(text: str | None) -> str:
    if not text:
        return ""
    return re.sub(r"\s+", " ", text).strip()


def get(session: requests.Session, url: str, retries: int = 4) -> str | None:
    for attempt in range(retries):
        try:
            resp = session.get(url, timeout=30)
            if resp.status_code == 429 and attempt < retries - 1:
                wait = 15 * (attempt + 1)
                print(f"    429 rate limited, wait {wait}s", flush=True)
                time.sleep(wait)
                continue
            if resp.status_code != 200:
                print(f"    ! HTTP {resp.status_code} {url}", file=sys.stderr)
                return None
            return resp.text
        except requests.RequestException as exc:
            print(f"    ! {url}: {exc}", file=sys.stderr)
            return None
    return None


def parse_set_page(html: str) -> dict | None:
    """Extract set metadata + card grid (number -> image url)."""
    m = re.search(
        r'<div class="infobox-heading sm">\s*<img[^>]*alt="([^"]*)"[^>]*>\s*(.+?)\s*\(([^)]+)\)\s*</div>',
        html, re.S,
    )
    if not m:
        return None
    date_m = re.search(r'infobox-line">\s*(\d+)\w{0,2}\s+(\w+)\s+(\d{4})', html)
    count_m = re.search(r'(\d+)\s+Cards', html)
    cards = {}
    for num, img in re.findall(r'<a href="/cards/(?:jp/)?[A-Za-z0-9]+/(\d+)"><img[^>]*src="([^"]+)"', html):
        cards[int(num)] = img
    release = ""
    if date_m:
        months = {"January": "01", "February": "02", "March": "03", "April": "04",
                  "May": "05", "June": "06", "July": "07", "August": "08",
                  "September": "09", "October": "10", "November": "11", "December": "12"}
        release = f"{date_m.group(3)}-{months.get(date_m.group(2), '01')}-{int(date_m.group(1)):02d}"
    return {
        "name": strip_ws(m.group(2)),
        "code": m.group(3),
        "release": release,
        "total": int(count_m.group(1)) if count_m else len(cards),
        "cards": cards,
    }


def parse_card_page(html: str) -> dict | None:
    """Parse a card detail page into DB-ready fields.

    Structure (from limitlesstcg.com card pages):
      <p class="card-text-title"><span class="card-text-name"><a>Name</a></span> - Grass - 130 HP
      <p class="card-text-type">Pokemon - Basic
      <div class="card-text-attack">
        <p class="card-text-attack-info"><span class="ptcg-symbol">GGC</span> Name 130
        <p class="card-text-attack-effect">text
      <p class="card-text-wrr">Weakness: Fire <br> Resistance: none <br> Retreat: 3
      <div class="card-text-artist">Illustrated by <a>Artist
      <div class="regulation-mark">J Regulation Mark
      <title>Name - Set (CODE) #N - Limitless
    """
    body = re.sub(r"<script.*?</script>", "", html, flags=re.S)

    m = re.search(r'<span class="card-text-name"><a[^>]*>([^<]+)</a></span>\s*(?:-\s*([A-Za-z]+)\s*-\s*(\d+)\s*HP)?', body)
    if not m:
        return None
    card = {
        "name": strip_ws(m.group(1)),
        "card_type": TYPE_WORDS.get(m.group(2), m.group(2)) if m.group(2) else None,
        "hp": int(m.group(3)) if m.group(3) else None,
    }

    # category + stage
    tm = re.search(r'<p class="card-text-type">\s*(Pokémon|Trainer|Energy|Pokemon)\s*(?:-\s*([A-Za-z0-9 &]+?))?\s*</p>', body, re.S)
    category, stage = None, None
    if tm:
        cat = strip_ws(tm.group(1))
        category = "Pokemon" if cat.startswith("Pok") else cat
        stage = strip_ws(tm.group(2)) if tm.group(2) else None
    if category is None:
        # infer: no HP + no Pokemon stage -> Trainer or Energy by name/type hints
        if card["hp"] is None:
            if re.search(r'Energy', body[:body.find("card-legality")], re.I):
                category = "Energy"
            else:
                category = "Trainer"
        else:
            category = "Pokemon"
    if category == "Trainer" and stage in ("Basic", "Special Energy"):
        stage = None
    if category == "Energy" and stage == "Special Energy":
        stage = "Special"
    card["category"] = category
    card["stage"] = stage

    # attacks: cost symbols + "name damage" + effect
    attacks = []
    for am in re.finditer(
        r'<div class="card-text-attack">\s*<p class="card-text-attack-info">\s*(.*?)</p>\s*(?:<p class="card-text-attack-effect">\s*(.*?)</p>)?\s*</div>',
        body, re.S,
    ):
        info = am.group(1)
        effect = strip_ws(re.sub(r"<[^>]+>", "", am.group(2) or ""))
        cost_letters = re.findall(r'<span class="ptcg-symbol">([GRWLPFDMCN]+)</span>', info)
        cost = []
        for letters in cost_letters:
            cost.extend(ENERGY_LETTERS.get(ch, ch) for ch in letters)
        # strip the cost symbols BEFORE extracting the attack name
        info_no_cost = re.sub(r'<span class="ptcg-symbol">[^<]*</span>', ' ', info)
        info_text = strip_ws(re.sub(r"<[^>]+>", " ", info_no_cost))
        # "Attack Name 130" -> split trailing damage
        nm = re.match(r"^(.*?)\s*(\d+)?$", info_text)
        aname = nm.group(1).strip() if nm else info_text
        dmg = nm.group(2) if nm and nm.group(2) else None
        if aname and not aname.isdigit():
            attacks.append({
                "name": aname,
                "damage": dmg,
                "description": effect or None,
                "energy_cost": cost,
            })
    card["attacks"] = attacks

    # abilities: attack blocks without damage/cost, or named ability blocks
    abilities = []
    for abm in re.finditer(
        r'<div class="card-text-ability">\s*<p class="card-text-ability-name">\s*(?:Ability:)?\s*([^<]+?)\s*</p>\s*(?:<p class="card-text-ability-effect">\s*(.*?)</p>)?',
        body, re.S,
    ):
        abilities.append({
            "name": strip_ws(abm.group(1)),
            "description": strip_ws(re.sub(r"<[^>]+>", "", abm.group(2) or "")) or None,
        })
    # older layout: "Ability" label + h4-style name
    if not abilities:
        for abm in re.finditer(
            r'<p class="card-text-attack-info">\s*(?:<span[^>]*>Ability</span>\s*|Ability\s*)([^<]+?)\s*</p>\s*(?:<p class="card-text-attack-effect">\s*(.*?)</p>)?',
            body, re.S,
        ):
            aname = strip_ws(abm.group(1))
            if aname and aname.lower() != "ability":
                abilities.append({
                    "name": aname,
                    "description": strip_ws(re.sub(r"<[^>]+>", "", abm.group(2) or "")) or None,
                })
    card["abilities"] = abilities

    # weakness / resistance / retreat
    wrr = re.search(r'<p class="card-text-wrr">\s*Weakness:\s*([A-Za-z]+|none)\s*<br>\s*Resistance:\s*([^<]*?)\s*<br>\s*Retreat:\s*(\d+)', body, re.S)
    if wrr:
        w = wrr.group(1)
        card["weakness"] = json.dumps({"type": TYPE_WORDS.get(w, w), "modifier": "×2"}, ensure_ascii=False) if w and w != "none" else None
        r_txt = strip_ws(wrr.group(2))
        rm = re.match(r"([A-Za-z]+)\s*(-?\d+)", r_txt)
        card["resistance"] = json.dumps({"type": TYPE_WORDS.get(rm.group(1), rm.group(1)), "modifier": rm.group(2)}, ensure_ascii=False) if rm else None
        card["retreat_cost"] = int(wrr.group(3))
    else:
        card["weakness"] = card["resistance"] = None
        card["retreat_cost"] = None

    # regulation mark
    reg = re.search(r'<div class="regulation-mark">\s*(\w)\s*Regulation Mark', body)
    card["regulation_mark"] = reg.group(1) if reg else None

    # illustrator
    ill = re.search(r'card-text-artist">\s*Illustrated by\s*<a[^>]*>\s*([^<]+?)\s*</a>', body, re.S)
    card["illustrator"] = strip_ws(ill.group(1)) if ill else None

    # number + rarity from title/prints: "#12 · Rare" or title "#12"
    numr = re.search(r'#(\d+)\s*(?:·|&middot;|•)\s*([A-Za-z][A-Za-z ]+?)\s*<', body)
    if not numr:
        numr = re.search(r'<title>[^#]* #(\d+)', body)
        card["number"] = int(numr.group(1)) if numr else None
        card["rarity_word"] = None
    else:
        card["number"] = int(numr.group(1))
        card["rarity_word"] = strip_ws(numr.group(2))

    # evolves from (if any)
    evo = re.search(r'Evolves from\s*<[^>]*>\s*([^<]+)', body)
    card["evolves_from"] = strip_ws(evo.group(1)) if evo else None

    return card


def rarity_code(word: str | None) -> str | None:
    if not word:
        return None
    return RARITY_WORDS.get(word, word[:2].upper() if word else None)


def download_webp(session: requests.Session, url: str, dest: Path, quality: int = 85) -> bool:
    try:
        from PIL import Image
    except ImportError:
        return False
    try:
        resp = session.get(url, timeout=30)
        if resp.status_code != 200:
            return False
        im = Image.open(io.BytesIO(resp.content)).convert("RGB")
        dest.parent.mkdir(parents=True, exist_ok=True)
        im.save(dest, "WEBP", quality=quality, method=4)
        return True
    except Exception as exc:  # noqa: BLE001
        print(f"    ! image {url}: {exc}", file=sys.stderr)
        return False


def import_set(cur: sqlite3.Cursor, session: requests.Session, code: str, jp: bool,
               dry_run: bool, skip_images: bool) -> dict:
    path = f"/cards/{'jp/' + code if jp else code}"
    html = get(session, BASE + path)
    if not html:
        return {"error": f"set page failed for {code}"}
    meta = parse_set_page(html)
    if not meta:
        return {"error": f"set page parse failed for {code}"}
    print(f"{code}: {meta['name']} ({meta['release']}, {meta['total']} kartu, grid {len(meta['cards'])})")

    # expansions row
    if not dry_run:
        cur.execute(
            "INSERT INTO expansions (code, name_en, name_id, released_at, total_cards) "
            "VALUES (?,?,?,?,?) ON CONFLICT(code) DO UPDATE SET "
            "name_en=excluded.name_en, released_at=excluded.released_at, total_cards=excluded.total_cards",
            (code, meta["name"], meta["name"], meta["release"] or "2026-01-01", meta["total"]),
        )

    # existing cards by number
    cur.execute("SELECT collector_number FROM cards WHERE expansion_code = ?", (code,))
    existing = set()
    total_denom = meta["total"]
    for (cn,) in cur.fetchall():
        m = re.match(r"(\d+)", cn or "")
        if m:
            existing.add(int(m.group(1)))
    cur.execute("SELECT MAX(CAST(id AS INTEGER)) FROM cards")
    next_id = (cur.fetchone()[0] or 0) + 1

    stats = {"imported": 0, "updated": 0, "failed": 0, "images": 0}
    for num in sorted(meta["cards"]):
        img_url = meta["cards"][num]
        page = get(session, f"{BASE}{path}/{num}")
        if not page:
            stats["failed"] += 1
            continue
        card = parse_card_page(page)
        if not card or not card.get("name"):
            print(f"    ! parse failed {code} #{num}", file=sys.stderr)
            stats["failed"] += 1
            continue
        collector = f"{num:03d}/{total_denom}"
        is_new = num not in existing

        if dry_run:
            print(f"    [{num}/{total_denom}] {card['name']} ({card['category']}"
                  f"{'/' + str(card['stage']) if card['stage'] else ''}) "
                  f"{'INSERT' if is_new else 'UPDATE'}")
            continue

        db_id = str(next_id) if is_new else None
        if is_new:
            cur.execute("SELECT id FROM cards WHERE expansion_code=? AND collector_number=?", (code, collector))
            row = cur.fetchone()
            if row:
                db_id = row[0]
                is_new = False
            else:
                next_id += 1
        if not db_id:
            cur.execute("SELECT id FROM cards WHERE expansion_code=? AND collector_number=?", (code, collector))
            row = cur.fetchone()
            db_id = row[0] if row else str(next_id)
            if not row:
                next_id += 1

        image_rel = f"/card-images/{code}/{db_id}.webp"
        if not skip_images:
            dest = IMG_DIR / code / f"{db_id}.webp"
            if not dest.exists() and download_webp(session, img_url, dest):
                stats["images"] += 1
            time.sleep(0.15)

        row = {
            "id": db_id, "external_id": int(db_id),
            "name_id": card["name"], "name_en": card["name"],
            "category": card["category"], "expansion_code": code,
            "collector_number": collector,
            "regulation_mark": card["regulation_mark"],
            "rarity": rarity_code(card["rarity_word"]),
            "illustrator": card["illustrator"], "image_url": image_rel,
            "hp": card["hp"], "card_type": card["card_type"],
            "evolution_stage": card["stage"], "evolves_from": card["evolves_from"],
            "retreat_cost": card["retreat_cost"],
            "attacks": json.dumps(card["attacks"], ensure_ascii=False) if card["attacks"] else None,
            "abilities": json.dumps(card["abilities"], ensure_ascii=False) if card["abilities"] else None,
            "weakness": card["weakness"], "resistance": card["resistance"],
        }
        if is_new:
            cur.execute(
                """INSERT INTO cards (id, external_id, name_id, name_en, category,
                   expansion_code, collector_number, regulation_mark, rarity, illustrator,
                   image_url, hp, card_type, evolution_stage, evolves_from, retreat_cost,
                   attacks, abilities, weakness, resistance)
                   VALUES (:id, :external_id, :name_id, :name_en, :category,
                   :expansion_code, :collector_number, :regulation_mark, :rarity, :illustrator,
                   :image_url, :hp, :card_type, :evolution_stage, :evolves_from, :retreat_cost,
                   :attacks, :abilities, :weakness, :resistance)""", row)
            stats["imported"] += 1
        else:
            cur.execute(
                """UPDATE cards SET name_id=:name_id, name_en=:name_en, category=:category,
                   regulation_mark=:regulation_mark, rarity=COALESCE(:rarity, rarity),
                   illustrator=:illustrator, image_url=:image_url, hp=:hp, card_type=:card_type,
                   evolution_stage=:evolution_stage, evolves_from=:evolves_from,
                   retreat_cost=:retreat_cost, attacks=:attacks, abilities=:abilities,
                   weakness=:weakness, resistance=:resistance, updated_at=CURRENT_TIMESTAMP
                   WHERE id=:id""", row)
            stats["updated"] += 1
        time.sleep(0.35)
    return stats


def translate_jp_set(cur: sqlite3.Cursor, session: requests.Session, code: str, total: int) -> int:
    """Fetch English translations from limitlesstcg and update JP set card names.

    Indonesian TCG keeps English Pokemon names, so name_id = English name
    matches the database convention.
    """
    import urllib.parse

    mapping: dict[str, str] = {}
    for page in range(1, 6):
        q = urllib.parse.quote(f"!set:{code} is:unreleased")
        url = f"{BASE}/cards/jp?translate=en&q={q}&display=text&page={page}"
        html = get(session, url)
        if not html:
            break
        rows = re.findall(rf'/cards/jp/{code}/(\d+)[^>]*>([^<]*)<', html)
        added = 0
        for num, name in rows:
            name = strip_ws(name)
            if num not in mapping and name and not name.isdigit():
                mapping[num] = name
                added += 1
        if added == 0:
            break
        time.sleep(0.4)
    # second pass: full English card text (attacks + abilities) from display=full
    full = fetch_full_text(session, code)
    updated = 0
    for num, name in mapping.items():
        collector = f"{int(num):03d}/{total}"
        texts = full.get(num)
        if texts and (texts.get("attacks") or texts.get("abilities")):
            import json as _json

            attacks = _json.dumps(texts["attacks"], ensure_ascii=False) if texts.get("attacks") else None
            abilities = _json.dumps(texts["abilities"], ensure_ascii=False) if texts.get("abilities") else None
            cur.execute(
                "UPDATE cards SET name_id = ?, name_en = ?, "
                "attacks = COALESCE(?, attacks), abilities = COALESCE(?, abilities) "
                "WHERE expansion_code = ? AND collector_number = ?",
                (name, name, attacks, abilities, code, collector),
            )
        else:
            cur.execute(
                "UPDATE cards SET name_id = ?, name_en = ? WHERE expansion_code = ? AND collector_number = ?",
                (name, name, code, collector),
            )
        updated += cur.rowcount
    return updated


def fetch_full_text(session: requests.Session, code: str) -> dict:
    """Fetch English attack/ability text for a JP set (display=full view, 20/page)."""
    import urllib.parse

    result: dict[str, dict] = {}
    q = urllib.parse.quote(f"!set:{code} is:unreleased")
    for page in range(1, 12):
        url = f"{BASE}/cards/jp?translate=en&q={q}&display=full&page={page}"
        html = get(session, url)
        if not html:
            break
        added = 0
        for m in re.finditer(
            rf'<span class="card-text-name"><a href="/cards/jp/{code}/(\d+)\?translate=en">[^<]*</a></span>(.*?)(?=<span class="card-text-name">|$)',
            html, re.S,
        ):
            num, block = m.group(1), m.group(2)
            attacks = []
            for am in re.finditer(
                r'<div class="card-text-attack">\s*<p class="card-text-attack-info">\s*(.*?)</p>\s*(?:<p class="card-text-attack-effect">\s*(.*?)</p>)?\s*</div>',
                block, re.S,
            ):
                info = am.group(1)
                effect = strip_ws(re.sub(r"<[^>]+>", "", am.group(2) or ""))
                cost = []
                for letters in re.findall(r'<span class="ptcg-symbol">([GRWLPFDMCN]+)</span>', info):
                    cost.extend(ENERGY_LETTERS.get(ch, ch) for ch in letters)
                info_nc = re.sub(r'<span class="ptcg-symbol">[^<]*</span>', " ", info)
                text = strip_ws(re.sub(r"<[^>]+>", " ", info_nc))
                nm = re.match(r"^(.*?)\s*(\d+)?$", text)
                attacks.append({
                    "name": (nm.group(1).strip() if nm else text),
                    "damage": (nm.group(2) if nm and nm.group(2) else None),
                    "description": effect or None, "energy_cost": cost,
                })
            abilities = []
            for abm in re.finditer(
                r'<div class="card-text-ability">\s*<p class="card-text-ability-info">\s*Ability:\s*([^<]+?)\s*</p>\s*(?:<p class="card-text-ability-effect">\s*(.*?)</p>)?',
                block, re.S,
            ):
                abilities.append({
                    "name": abm.group(1).strip(),
                    "description": strip_ws(re.sub(r"<[^>]+>", "", abm.group(2) or "")) or None,
                })
            if num not in result and (attacks or abilities):
                result[num] = {"attacks": attacks, "abilities": abilities}
                added += 1
        if added == 0:
            break
        time.sleep(0.4)
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sets", nargs="*", default=[], help="International set codes (e.g. MEG MEE ASC)")
    parser.add_argument("--jp-sets", nargs="*", default=[], help="Japanese set codes (e.g. M6)")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--skip-images", action="store_true")
    args = parser.parse_args()

    if not args.sets and not args.jp_sets:
        parser.error("berikan --sets atau --jp-sets")

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    session = requests.Session()
    session.headers.update(HEADERS)

    jobs = [(c, False) for c in args.sets] + [(c, True) for c in args.jp_sets]
    for code, jp in jobs:
        result = import_set(cur, session, code, jp, args.dry_run, args.skip_images)
        print(f"  -> {result}")
        if jp and not args.dry_run and isinstance(result, dict) and result.get("imported", 0) + result.get("updated", 0) > 0:
            cur.execute("SELECT total_cards FROM expansions WHERE code = ?", (code,))
            row = cur.fetchone()
            total = row[0] if row else 0
            if total:
                translated = translate_jp_set(cur, session, code, total)
                print(f"  translated {translated} names to English/Latin")
        conn.commit()
    conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
