#!/usr/bin/env python3
"""
Import card data + images from the official Indonesian Pokemon TCG site
(asia.pokemon-card.com) into the PokeLab database.

The site exposes a server-rendered card search:
  POST /id/card-search/list/            (keyword / expansionCodes / cardType / regulation)
  GET  /id/card-search/list/?pageNo=N   (pagination)
  GET  /id/card-search/detail/{id}/     (full card details)

This script:
  1. Paginates the card search for each requested expansion code.
  2. Fetches every card detail page and parses all fields.
  3. Downloads the card image (PNG) and converts it to WebP via Pillow.
  4. Inserts/updates rows in the `cards` table and refreshes
     `expansions.total_cards`.

Usage:
  python scripts/sync/import_official_cards.py --db backend-go/pokemon_tcg.db --expansions MA6
  python scripts/sync/import_official_cards.py --expansions MA6 MA5 --dry-run
  python scripts/sync/import_official_cards.py --expansions MA6 --skip-images
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
from typing import Any
from urllib.parse import urljoin

import requests

import os

ROOT_DIR = Path(__file__).resolve().parents[2]
BASE_URL = "https://asia.pokemon-card.com"
SEARCH_LIST_URL = f"{BASE_URL}/id/card-search/list/"
DETAIL_URL = f"{BASE_URL}/id/card-search/detail/{{card_id}}/"
# In Docker the sync container mounts card-images at /app/card-images
# (IMAGE_DIR); locally it lives in the repo tree.
IMG_DIR = Path(os.environ.get("IMAGE_DIR") or (ROOT_DIR / "frontend-astro" / "public" / "card-images"))

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
    ),
    "Accept-Language": "id-ID,id;q=0.9",
}

ENERGY_MAP = {
    "Grass": "Grass", "Fire": "Fire", "Water": "Water", "Lightning": "Lightning",
    "Psychic": "Psychic", "Fighting": "Fighting", "Darkness": "Darkness",
    "Metal": "Metal", "Dragon": "Dragon", "Colorless": "Colorless",
}

TRAINER_STAGE_MAP = {
    "supporter": "Supporter", "item": "Item", "stadium": "Stadium",
    "pokemon tool": "Pokemon Tool", "ace spec": "ACE SPEC",
    "technical machine": "Technical Machine",
}


def strip_ws(text: str | None) -> str:
    if not text:
        return ""
    return re.sub(r"\s+", " ", text).strip()


def energy_from_img(src: str | None) -> str | None:
    if not src:
        return None
    m = re.search(r"energy/([A-Za-z]+)\.png", src)
    if not m:
        return None
    return ENERGY_MAP.get(m.group(1), m.group(1))


def create_session() -> requests.Session:
    s = requests.Session()
    s.headers.update(HEADERS)
    return s


def collect_card_ids(session: requests.Session, expansion: str, max_pages: int = 50) -> list[str]:
    """Paginate the card search and return detail-page IDs in site order."""
    ids: list[str] = []
    for page in range(1, max_pages + 1):
        resp = session.get(
            SEARCH_LIST_URL,
            params={"pageNo": page, "keyword": "", "expansionCodes": expansion, "cardType": "all", "regulation": "all"},
            timeout=30,
        )
        if resp.status_code != 200:
            print(f"  ! list page {page} returned HTTP {resp.status_code}, stopping", file=sys.stderr)
            break
        found = re.findall(r"/id/card-search/detail/(\d+)/", resp.text)
        page_ids: list[str] = []
        for cid in found:
            if cid not in page_ids:
                page_ids.append(cid)
        if not page_ids:
            break
        # Stop when the page repeats the first page (pageNo ignored).
        if page > 1 and page_ids == ids[: len(page_ids)] and len(page_ids) < 5:
            break
        if page > 1 and page_ids[0] == ids[0]:
            break
        ids.extend(page_ids)
        print(f"  list page {page}: {len(page_ids)} cards (total {len(ids)})")
        time.sleep(0.4)
    # de-dup while keeping order
    seen: set[str] = set()
    unique = [i for i in ids if not (i in seen or seen.add(i))]
    return unique


def parse_detail(html: str) -> dict[str, Any] | None:
    """Parse one card detail page into a DB-ready dict."""
    card: dict[str, Any] = {}

    # --- name + stage marker -------------------------------------------
    h1 = re.search(
        r'<h1 class="pageHeader cardDetail">(.*?)</h1>', html, re.S
    )
    if not h1:
        return None
    h1_inner = h1.group(1)
    marker = re.search(r'<span class="evolveMarker">(.*?)</span>', h1_inner, re.S)
    card["stage_marker"] = strip_ws(marker.group(1)) if marker else ""
    inner = h1_inner.replace(marker.group(0), "") if marker else h1_inner
    card["name"] = strip_ws(re.sub(r"<[^>]+>", "", inner))

    # --- image ----------------------------------------------------------
    img = re.search(r'<section class="imageColumn">.*?<img src="([^"]+)"', html, re.S)
    card["image_remote"] = urljoin(BASE_URL, img.group(1)) if img else None

    # --- main info: HP + type -------------------------------------------
    main_info = re.search(r'<p class="mainInfomation">(.*?)</p>', html, re.S)
    card["hp"] = None
    card["card_type"] = None
    if main_info:
        block = main_info.group(1)
        hp = re.search(r'<span class="number">(\d+)</span>', block)
        if hp:
            card["hp"] = int(hp.group(1))
        ttype = re.search(r'<img src="([^"]*energy/[A-Za-z]+\.png)"', block)
        if ttype:
            card["card_type"] = energy_from_img(ttype.group(1))

    # --- skills (attacks + abilities) ------------------------------------
    card["attacks"] = []
    card["abilities"] = []
    skill_section = re.search(r'<div class="skillInformation">(.*?)</section>', html, re.S)
    if skill_section:
        section_html = skill_section.group(1)
        # split by header blocks: each h3.commonHeader announces a group
        headers = re.split(r'<h3 class="commonHeader">(.*?)</h3>', section_html, flags=re.S)
        # headers -> [before, title1, body1, title2, body2, ...]
        for i in range(1, len(headers) - 1, 2):
            title = strip_ws(re.sub(r"<[^>]+>", "", headers[i]))
            body = headers[i + 1]
            skills = re.findall(r'<div class="skill(?: ex Ability| ability|") ?">(.*?)</div>', body, re.S)
            if not skills:
                skills = re.findall(r'<div class="skill[^"]*">(.*?)</div>', body, re.S)
            for skill_html in skills:
                parsed = parse_skill(skill_html)
                if not parsed:
                    continue
                is_ability = parsed.pop("is_ability", False) or (
                    "ability" in title.lower() or "kemampuan" in title.lower()
                )
                if is_ability:
                    card["abilities"].append(parsed)
                else:
                    card["attacks"].append(parsed)

    # --- weakness / resistance / retreat ---------------------------------
    card["weakness"] = None
    card["resistance"] = None
    card["retreat_cost"] = None
    weak = re.search(r'<td class="weakpoint">(.*?)</td>', html, re.S)
    if weak:
        wtype = energy_from_img((re.search(r'src="([^"]+)"', weak.group(1)) or [None, None])[1] if re.search(r'src="([^"]+)"', weak.group(1)) else None)
        wmod = re.search(r"(×\d+|x\d+|\d+)", weak.group(1))
        if wtype:
            card["weakness"] = json.dumps(
                {"type": wtype, "modifier": wmod.group(1) if wmod else "×2"},
                ensure_ascii=False,
            )
    resist = re.search(r'<td class="resist">(.*?)</td>', html, re.S)
    if resist:
        rtxt = strip_ws(re.sub(r"<[^>]+>", "", resist.group(1)))
        rtype = energy_from_img((re.search(r'src="([^"]+)"', resist.group(1)) or [None, None])[1] if re.search(r'src="([^"]+)"', resist.group(1)) else None)
        rmod = re.search(r"(-?\d+)", rtxt)
        if rtype:
            card["resistance"] = json.dumps(
                {"type": rtype, "modifier": rmod.group(1) if rmod else "-20"},
                ensure_ascii=False,
            )
    escape = re.search(r'<td class="escape">(.*?)</td>', html, re.S)
    if escape:
        card["retreat_cost"] = len(re.findall(r"<img", escape.group(1)))

    # --- regulation mark + collector number ------------------------------
    alpha = re.search(r'<span class="alpha">\s*([A-Z])\s*</span>', html)
    card["regulation_mark"] = alpha.group(1) if alpha else None
    number = re.search(r'<span class="collectorNumber">\s*([^<]+?)\s*</span>', html)
    card["collector_number"] = strip_ws(number.group(1)) if number else None

    # --- illustrator ------------------------------------------------------
    illustrator = re.search(r'<div class="illustrator">.*?<a[^>]*>(.*?)</a>', html, re.S)
    card["illustrator"] = strip_ws(re.sub(r"<[^>]+>", "", illustrator.group(1))) if illustrator else None

    # --- pokedex / flavor --------------------------------------------------
    extra = re.search(r'<div class="extraInformation">\s*<h3>(.*?)</h3>(.*?)</div>', html, re.S)
    card["pokedex"] = None
    if extra:
        head = strip_ws(re.sub(r"<[^>]+>", "", extra.group(1)))
        body = extra.group(2)
        size = re.search(r'Tinggi<span class="value">([^<]+)</span>', body)
        weight = re.search(r'Berat<span class="value">([^<]+)</span>', body)
        number_m = re.match(r"No\.(\d+)", head)
        species = re.sub(r"^No\.\d+\s*", "", head)
        card["pokedex"] = json.dumps(
            {
                "number": int(number_m.group(1)) if number_m else None,
                "species": species,
                "height": size.group(1).rstrip("m") if size else None,
                "weight": weight.group(1).rstrip("kg") if weight else None,
            },
            ensure_ascii=False,
        )

    # --- category inference -------------------------------------------------
    name_l = card["name"].lower()
    if card["hp"] is not None:
        card["category"] = "Pokemon"
        stage = card["stage_marker"].lower()
        card["evolution_stage"] = {
            "basic": "Basic", "stage 1": "Stage 1", "stage 2": "Stage 2",
            "vmax": "VMAX", "vstar": "VSTAR", "lainnya": "",
        }.get(stage, card["stage_marker"] or None)
        card["evolves_from"] = None
        card["chain"] = [
            strip_ws(n)
            for n in re.findall(r'<li class="step[^"]*"><a[^>]*>([^<]+)</a></li>', html)
        ]
        # First guess: entry immediately before this card. A stage-aware
        # repair pass fixes families where same-stage relatives sit adjacent
        # (e.g. Gastly/Haunter/Gengar/Gengar ex).
        try:
            idx = next(i for i, n in enumerate(card["chain"]) if n == card["name"])
            if idx > 0:
                card["evolves_from"] = card["chain"][idx - 1]
        except StopIteration:
            pass
    elif name_l.startswith("energi") or "energi dasar" in name_l:
        card["category"] = "Energy"
        card["evolution_stage"] = None
        card["evolves_from"] = None
        # basic energies have no attacks
        if not card["attacks"]:
            card["attacks"] = []
        # infer energy type from the Indonesian name token
        if not card["card_type"]:
            energy_names = {
                "daun": "Grass", "api": "Fire", "air": "Water",
                "listrik": "Lightning", "psychic": "Psychic",
                "petarung": "Fighting", "kegelapan": "Darkness", "logam": "Metal",
                "naga": "Dragon",
            }
            for token, etype in energy_names.items():
                if token in name_l:
                    card["card_type"] = etype
                    break
    else:
        card["category"] = "Trainer"
        stage = card["stage_marker"].lower()
        card["evolution_stage"] = TRAINER_STAGE_MAP.get(stage, card["stage_marker"] or None)
        card["evolves_from"] = None

    return card


def parse_skill(skill_html: str) -> dict[str, Any] | None:
    name_m = re.search(r'<span class="skillName">(.*?)</span>', skill_html, re.S)
    dmg_m = re.search(r'<span class="skillDamage">(.*?)</span>', skill_html, re.S)
    effect_p = re.search(r'<p class="skillEffect">(.*?)</p>', skill_html, re.S)
    cost_imgs = re.findall(r'src="[^"]*energy/([A-Za-z]+)\.png"', skill_html)
    name = strip_ws(re.sub(r"<[^>]+>", "", name_m.group(1))) if name_m else ""
    dmg = strip_ws(re.sub(r"<[^>]+>", "", dmg_m.group(1))) if dmg_m else ""
    effect = strip_ws(re.sub(r"<[^>]+>", "", effect_p.group(1))) if effect_p else None
    if not name and not dmg and not effect and not cost_imgs:
        return None
    # The official site renders abilities inside the attack list with an
    # "[Ability]" prefix on the skill name. Detect and normalize it.
    is_ability = False
    m_ab = re.match(r"^\[(Ability|Kemampuan|Ability)\]\s*(.*)$", name)
    if m_ab:
        is_ability = True
        name = m_ab.group(2).strip()
    return {
        "name": name or None,
        "damage": dmg or None,
        "description": effect,
        "energy_cost": [ENERGY_MAP.get(c, c) for c in cost_imgs],
        "is_ability": is_ability,
    }


def download_image_as_webp(session: requests.Session, remote: str, dest: Path, quality: int = 85) -> bool:
    try:
        from PIL import Image
    except ImportError:
        return False
    try:
        resp = session.get(remote, timeout=30)
        if resp.status_code != 200:
            return False
        im = Image.open(io.BytesIO(resp.content)).convert("RGB")
        dest.parent.mkdir(parents=True, exist_ok=True)
        im.save(dest, "WEBP", quality=quality, method=4)
        return True
    except Exception as exc:  # noqa: BLE001
        print(f"    ! image failed ({remote}): {exc}", file=sys.stderr)
        return False


def rarity_lookup(expansion: str) -> dict[str, str]:
    """Best-effort rarity map from the official special page chunk (ma6)."""
    path = Path("/tmp/kilo") / "ma6_cards_idn.json"
    if not path.exists() or expansion != "MA6":
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return {}
    mapping: dict[str, str] = {}
    for c in data:
        no = c.get("no", "")
        # LEGEND double numbers like 182183 -> 182
        no = re.sub(r"(\d{3})\d{3}", r"\1", no)
        mapping[no] = c.get("rarity") or ""
    return mapping


STAGE_INDEX = {"Basic": 0, "Stage 1": 1, "Stage 2": 2, "VMAX": 2, "VSTAR": 2}


def repair_evolution_stages(cur: sqlite3.Cursor) -> int:
    """Fix evolves_from rows whose stage does not fit the card's own stage.

    The official family chain lists relatives adjacently (Gastly, Haunter,
    Gengar, Gengar ex), so the naive previous-entry guess sometimes points at a
    same-stage sibling. For each mismatch we walk the (stage-ordered) chain of
    that card via its evolution family and select the nearest previous entry
    whose own evolution_stage is exactly one step below.
    """
    fixed = 0
    cur.execute(
        """SELECT id, name_id, evolution_stage, evolves_from, collector_number
           FROM cards
           WHERE category = 'Pokemon' AND evolves_from IS NOT NULL
             AND expansion_code IN (
               SELECT code FROM expansions
               WHERE total_cards > 0 AND released_at >= '2025-01-01'
             )"""
    )
    rows = cur.fetchall()
    stage_by_name: dict[str, int] = {}
    cur.execute("SELECT name_id, evolution_stage FROM cards WHERE category='Pokemon'")
    for name, stage in cur.fetchall():
        if stage in STAGE_INDEX:
            stage_by_name.setdefault(name, STAGE_INDEX[stage])
    for card_id, name, stage, evolves_from, number in rows:
        my_idx = STAGE_INDEX.get(stage)
        if my_idx is None or not my_idx:
            continue
        parent_idx = stage_by_name.get(evolves_from)
        if parent_idx is not None and parent_idx == my_idx - 1:
            continue  # already correct
        # Build the family chain from DB stage order: cards that share the
        # family via evolves_from closure starting from the family Basic.
        family = family_chain(cur, name)
        try:
            pos = next(i for i, n in enumerate(family) if n == name)
        except StopIteration:
            continue
        for j in range(pos - 1, -1, -1):
            cand = family[j]
            if stage_by_name.get(cand) == my_idx - 1:
                cur.execute(
                    "UPDATE cards SET evolves_from = ? WHERE id = ?",
                    (cand, card_id),
                )
                fixed += 1
                break
    return fixed


def family_chain(cur: sqlite3.Cursor, name: str) -> list[str]:
    """Return the evolution family of `name` in stage order."""
    # walk up from the card itself
    chain = [name]
    seen = {name}
    current = name
    for _ in range(6):
        row = cur.execute(
            "SELECT evolves_from FROM cards WHERE name_id = ? AND category='Pokemon' "
            "AND evolves_from IS NOT NULL LIMIT 1",
            (current,),
        ).fetchone()
        if not row or not row[0] or row[0] in seen:
            break
        chain.append(row[0])
        seen.add(row[0])
        current = row[0]
    chain.reverse()
    # extend downward: everything that (transitively) evolves from the root
    root = chain[0]
    out = [root]
    frontier = [root]
    seen2 = {root}
    for _ in range(6):
        nxt = []
        placeholders = ",".join("?" for _ in frontier)
        for (child,) in cur.execute(
            f"SELECT DISTINCT name_id FROM cards WHERE category='Pokemon' "
            f"AND evolves_from IN ({placeholders})", frontier
        ).fetchall():
            if child not in seen2:
                seen2.add(child)
                out.append(child)
                nxt.append(child)
        if not nxt:
            break
        frontier = nxt
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", default=str(ROOT_DIR / "backend-go" / "pokemon_tcg.db"))
    parser.add_argument("--expansions", nargs="+",
                        default=os.environ.get("OFFICIAL_EXPANSIONS", "MA6 MA5").split())
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--skip-images", action="store_true")
    parser.add_argument("--sleep", type=float, default=0.35, help="Delay between requests (s)")
    args = parser.parse_args()

    session = create_session()
    conn = sqlite3.connect(args.db)
    cur = conn.cursor()

    for expansion in args.expansions:
        print(f"\n=== {expansion} ===")
        card_ids = collect_card_ids(session, expansion)
        print(f"  collected {len(card_ids)} card detail ids")

        # existing rows for id reuse
        cur.execute(
            "SELECT id, collector_number FROM cards WHERE expansion_code = ?", (expansion,)
        )
        existing_by_number = {row[1]: row[0] for row in cur.fetchall() if row[1]}
        cur.execute("SELECT MAX(CAST(id AS INTEGER)) FROM cards")
        next_id = (cur.fetchone()[0] or 0) + 1

        rarities = rarity_lookup(expansion)
        imported = updated = failed = 0

        for idx, card_id in enumerate(card_ids, 1):
            url = DETAIL_URL.format(card_id=card_id)
            try:
                resp = session.get(url, timeout=30)
            except requests.RequestException as exc:
                print(f"  ! {card_id}: {exc}", file=sys.stderr)
                failed += 1
                continue
            if resp.status_code != 200:
                print(f"  ! {card_id}: HTTP {resp.status_code}", file=sys.stderr)
                failed += 1
                continue
            card = parse_detail(resp.text)
            if not card or not card.get("name"):
                print(f"  ! {card_id}: could not parse", file=sys.stderr)
                failed += 1
                continue

            number = card.get("collector_number") or ""
            no_key = number.split("/")[0].lstrip("0") or "0"
            no3 = number.split("/")[0]
            rarity = rarities.get(no3) or rarities.get(no3.zfill(3)) or rarities.get(no_key) or None

            db_id = existing_by_number.get(number)
            is_new = db_id is None
            if is_new:
                db_id = str(next_id)
                next_id += 1

            image_rel = f"/card-images/{expansion}/{db_id}.webp"
            if not args.skip_images and card["image_remote"]:
                dest = IMG_DIR / expansion / f"{db_id}.webp"
                if not args.dry_run and not dest.exists():
                    download_image_as_webp(session, card["image_remote"], dest)
                    time.sleep(0.15)

            if args.dry_run:
                print(f"  [{idx}/{len(card_ids)}] {number or '???'} {card['name']} ({card['category']})"
                      f" {'INSERT' if is_new else 'UPDATE'}")
                continue

            row = {
                "id": db_id,
                "external_id": int(db_id),
                "name_id": card["name"],
                "name_en": card["name"],
                "category": card["category"],
                "expansion_code": expansion,
                "collector_number": number or None,
                "regulation_mark": card["regulation_mark"],
                "rarity": rarity,
                "illustrator": card["illustrator"],
                "image_url": image_rel,
                "hp": card["hp"],
                "card_type": card["card_type"],
                "evolution_stage": card["evolution_stage"] or None,
                "evolves_from": card["evolves_from"],
                "retreat_cost": card["retreat_cost"],
                "attacks": json.dumps(card["attacks"], ensure_ascii=False) if card["attacks"] else None,
                "abilities": json.dumps(card["abilities"], ensure_ascii=False) if card["abilities"] else None,
                "weakness": card["weakness"],
                "resistance": card["resistance"],
                "pokedex": card["pokedex"],
            }

            if is_new:
                cur.execute(
                    """INSERT INTO cards (id, external_id, name_id, name_en, category,
                       expansion_code, collector_number, regulation_mark, rarity, illustrator,
                       image_url, hp, card_type, evolution_stage, evolves_from, retreat_cost,
                       attacks, abilities, weakness, resistance, pokedex)
                       VALUES (:id, :external_id, :name_id, :name_en, :category,
                       :expansion_code, :collector_number, :regulation_mark, :rarity, :illustrator,
                       :image_url, :hp, :card_type, :evolution_stage, :evolves_from, :retreat_cost,
                       :attacks, :abilities, :weakness, :resistance, :pokedex)""",
                    row,
                )
                imported += 1
            else:
                cur.execute(
                    """UPDATE cards SET name_id=:name_id, name_en=:name_en, category=:category,
                       regulation_mark=:regulation_mark, rarity=COALESCE(:rarity, rarity),
                       illustrator=:illustrator, image_url=:image_url, hp=:hp, card_type=:card_type,
                       evolution_stage=:evolution_stage, evolves_from=:evolves_from,
                       retreat_cost=:retreat_cost, attacks=:attacks, abilities=:abilities,
                       weakness=:weakness, resistance=:resistance, pokedex=:pokedex,
                       updated_at=CURRENT_TIMESTAMP
                       WHERE id=:id""",
                    row,
                )
                updated += 1

            if idx % 20 == 0:
                print(f"  ... {idx}/{len(card_ids)} processed")
                conn.commit()
            time.sleep(args.sleep)

        if not args.dry_run:
            conn.commit()
            cur.execute(
                "UPDATE expansions SET total_cards = "
                "(SELECT COUNT(*) FROM cards WHERE expansion_code = ?) WHERE code = ?",
                (expansion, expansion),
            )
            conn.commit()
            repaired = repair_evolution_stages(cur)
            conn.commit()
            print(f"  {expansion}: inserted {imported}, updated {updated}, failed {failed}")
            print(f"  expansions.total_cards refreshed, evolves_from repaired: {repaired}")

    conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
