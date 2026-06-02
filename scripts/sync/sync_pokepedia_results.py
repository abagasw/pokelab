#!/usr/bin/env python3
"""
Sync Pokepedia card data into the local SQLite database.

Optional image download stores card art under:
  frontend-astro/public/card-images/<expansion>/<card-id>.<ext>

When an image is successfully downloaded, cards.image_url is stored as a local
public path such as /card-images/MA4/73130.webp so the frontend no longer
depends on the remote CDN at runtime.
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
import shutil
import sqlite3
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import requests
import urllib3

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

ROOT_DIR = Path(__file__).resolve().parents[2]
DEFAULT_DB_PATH = ROOT_DIR / "backend-go" / "pokemon_tcg.db"
DEFAULT_DATA_FILE = ROOT_DIR / "data" / "data_card_indo" / "all_data.json"
DEFAULT_IMAGE_DIR = ROOT_DIR / "frontend-astro" / "public" / "card-images"

IMAGE_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/125.0 Safari/537.36",
    "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
}


@dataclass
class ImageResult:
    card_id: str
    remote_url: str
    local_url: str | None
    status: str
    reason: str = ""


def load_master_data(data_file: Path) -> dict[str, Any]:
    if not data_file.exists():
        raise FileNotFoundError(f"Data file not found: {data_file}")

    with data_file.open("r", encoding="utf-8") as handle:
        data = json.load(handle)

    if not isinstance(data, dict) or "data" not in data:
        raise ValueError(f"Unexpected Pokepedia data format: {data_file}")

    return data


def iter_cards(master_data: dict[str, Any]):
    for entry in master_data.get("data", []):
        expansion = entry.get("expansion", {}) or {}
        exp_code = expansion.get("code") or ""
        for card in entry.get("cards", []) or []:
            yield exp_code, card


def safe_ext(remote_url: str, content_type: str = "") -> str:
    parsed_ext = Path(urlparse(remote_url).path).suffix.lower()
    if parsed_ext in {".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"}:
        return parsed_ext

    guessed = mimetypes.guess_extension(content_type.split(";")[0].strip())
    if guessed in {".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"}:
        return guessed

    return ".webp"


def local_image_path(image_dir: Path, exp_code: str, card_id: str, remote_url: str, content_type: str = "") -> tuple[Path, str]:
    ext = safe_ext(remote_url, content_type)
    exp_folder = exp_code or "unknown"
    path = image_dir / exp_folder / f"{card_id}{ext}"
    public_url = f"/card-images/{exp_folder}/{card_id}{ext}"
    return path, public_url


def resolve_host_ips(host: str) -> list[str]:
    try:
        response = requests.get(
            "https://cloudflare-dns.com/dns-query",
            headers={"accept": "application/dns-json"},
            params={"name": host, "type": "A"},
            timeout=10,
        )
        data = response.json()
        return [answer["data"] for answer in data.get("Answer", []) if answer.get("type") == 1 and answer.get("data")]
    except Exception:
        return []


def fetch_with_curl_resolve(remote_url: str, target: Path, host_ip: str, timeout: int) -> tuple[bool, str]:
    curl = shutil.which("curl.exe") or shutil.which("curl")
    if not curl:
        return False, "curl not found"

    host = urlparse(remote_url).hostname or ""
    tmp_target = target.with_suffix(target.suffix + ".tmp")
    command = [
        curl,
        "-k",
        "-L",
        "--fail",
        "--silent",
        "--show-error",
        "--connect-timeout",
        str(timeout),
        "--max-time",
        str(max(timeout * 3, 45)),
        "--resolve",
        f"{host}:443:{host_ip}",
        "-A",
        IMAGE_HEADERS["User-Agent"],
        "-H",
        IMAGE_HEADERS["Accept"],
        "-o",
        str(tmp_target),
        "-w",
        "%{content_type}",
        remote_url,
    ]
    try:
        completed = subprocess.run(command, capture_output=True, text=True, timeout=max(timeout * 4, 60))
        content_type = (completed.stdout or "").strip()
        if completed.returncode != 0:
            if tmp_target.exists():
                tmp_target.unlink(missing_ok=True)
            return False, (completed.stderr or f"curl exit {completed.returncode}").strip()
        if not content_type.startswith("image/"):
            if tmp_target.exists():
                tmp_target.unlink(missing_ok=True)
            return False, f"not image via curl: {content_type or 'unknown'}"
        if not tmp_target.exists() or tmp_target.stat().st_size == 0:
            return False, "empty image"
        tmp_target.replace(target)
        return True, content_type
    except Exception as exc:
        if tmp_target.exists():
            tmp_target.unlink(missing_ok=True)
        return False, str(exc)


def fetch_one_image(
    image_dir: Path,
    exp_code: str,
    card: dict[str, Any],
    timeout: int,
    resolve_ips: dict[str, str],
) -> ImageResult:
    card_id = str(card.get("id") or "")
    remote_url = card.get("image_url") or ""
    if not card_id or not remote_url:
        return ImageResult(card_id=card_id, remote_url=remote_url, local_url=None, status="skipped", reason="missing image_url")

    target, public_url = local_image_path(image_dir, exp_code, card_id, remote_url)
    if target.exists() and target.stat().st_size > 0:
        return ImageResult(card_id=card_id, remote_url=remote_url, local_url=public_url, status="exists")

    try:
        response = requests.get(remote_url, headers=IMAGE_HEADERS, timeout=timeout, stream=True, verify=False)
        content_type = response.headers.get("content-type", "")
        if response.status_code >= 400:
            return ImageResult(card_id, remote_url, None, "failed", f"http {response.status_code}")
        if not content_type.startswith("image/"):
            host = urlparse(remote_url).hostname or ""
            host_ip = resolve_ips.get(host)
            if host_ip:
                target, public_url = local_image_path(image_dir, exp_code, card_id, remote_url)
                target.parent.mkdir(parents=True, exist_ok=True)
                ok, reason = fetch_with_curl_resolve(remote_url, target, host_ip, timeout)
                if ok:
                    return ImageResult(card_id, remote_url, public_url, "downloaded")
                return ImageResult(card_id, remote_url, None, "failed", reason)
            return ImageResult(card_id, remote_url, None, "failed", f"not image: {content_type or 'unknown'}")

        target, public_url = local_image_path(image_dir, exp_code, card_id, remote_url, content_type)
        target.parent.mkdir(parents=True, exist_ok=True)
        tmp_target = target.with_suffix(target.suffix + ".tmp")
        with tmp_target.open("wb") as handle:
            for chunk in response.iter_content(chunk_size=64 * 1024):
                if chunk:
                    handle.write(chunk)
        tmp_target.replace(target)
        return ImageResult(card_id, remote_url, public_url, "downloaded")
    except Exception as exc:
        return ImageResult(card_id, remote_url, None, "failed", str(exc))


def preflight_image_hosts(cards: list[tuple[str, dict[str, Any]]], timeout: int) -> tuple[set[str], dict[str, str]]:
    sample_by_host: dict[str, str] = {}
    for _, card in cards:
        remote_url = card.get("image_url") or ""
        host = urlparse(remote_url).hostname or ""
        if host and host not in sample_by_host:
            sample_by_host[host] = remote_url

    blocked_hosts: set[str] = set()
    resolve_ips: dict[str, str] = {}
    for host, remote_url in sample_by_host.items():
        try:
            response = requests.get(remote_url, headers=IMAGE_HEADERS, timeout=timeout, stream=True, verify=False)
            content_type = response.headers.get("content-type", "")
            if response.status_code >= 400 or not content_type.startswith("image/"):
                ips = resolve_host_ips(host)
                if ips:
                    parsed = urlparse(remote_url)
                    test_target = Path(os.environ.get("TEMP", ".")) / f"pokepedia-preflight-{host}.img"
                    ok, reason = fetch_with_curl_resolve(remote_url, test_target, ips[0], timeout)
                    test_target.unlink(missing_ok=True)
                    if ok:
                        resolve_ips[host] = ips[0]
                        print(f"   ✅ Host image {host} butuh DNS bypass; pakai {ips[0]} untuk download.")
                        continue
                    print(f"   ⚠️  DNS bypass {host} gagal: {reason}")
                blocked_hosts.add(host)
                print(f"   ⚠️  Host image {host} tidak mengembalikan image ({response.status_code}, {content_type or 'unknown'}).")
        except Exception as exc:
            blocked_hosts.add(host)
            print(f"   ⚠️  Host image {host} gagal diakses: {exc}")
    return blocked_hosts, resolve_ips


def download_images(master_data: dict[str, Any], image_dir: Path, workers: int, timeout: int) -> dict[str, str]:
    cards = [(exp_code, card) for exp_code, card in iter_cards(master_data) if card.get("image_url")]
    print(f"🖼️  Menyiapkan download image untuk {len(cards)} kartu...")

    image_map: dict[str, str] = {}
    status_count = {"downloaded": 0, "exists": 0, "failed": 0, "skipped": 0}
    blocked_hosts, resolve_ips = preflight_image_hosts(cards, timeout)
    failed_examples: list[str] = []

    with ThreadPoolExecutor(max_workers=max(1, workers)) as executor:
        futures = {}
        for exp_code, card in cards:
            card_id = str(card.get("id") or "")
            remote_url = card.get("image_url") or ""
            existing_path, existing_url = local_image_path(image_dir, exp_code, card_id, remote_url)
            if existing_path.exists() and existing_path.stat().st_size > 0:
                image_map[card_id] = existing_url
                status_count["exists"] += 1
                continue

            host = urlparse(card.get("image_url") or "").hostname or ""
            if host in blocked_hosts:
                status_count["skipped"] += 1
                continue
            future = executor.submit(fetch_one_image, image_dir, exp_code, card, timeout, resolve_ips)
            futures[future] = (exp_code, card)

        for index, future in enumerate(as_completed(futures), 1):
            result = future.result()
            status_count[result.status] = status_count.get(result.status, 0) + 1
            if result.local_url:
                image_map[result.card_id] = result.local_url
            elif result.status == "failed":
                host = urlparse(result.remote_url).hostname or ""
                if result.reason.startswith("not image: text/html") and host:
                    blocked_hosts.add(host)
                if len(failed_examples) < 8:
                    failed_examples.append(f"{result.card_id}: {result.reason}")

            if index % 500 == 0:
                print(
                    "   ... image progress "
                    f"{index}/{len(futures)} downloaded={status_count['downloaded']} "
                    f"exists={status_count['exists']} failed={status_count['failed']}"
                )

    print("🖼️  Image download selesai:")
    print(f"   downloaded: {status_count['downloaded']}")
    print(f"   exists:     {status_count['exists']}")
    print(f"   failed:     {status_count['failed']}")
    print(f"   skipped:    {status_count['skipped']}")
    if blocked_hosts:
        print(f"   blocked/non-image hosts detected: {', '.join(sorted(blocked_hosts))}")
    if failed_examples:
        print("   contoh gagal:")
        for example in failed_examples:
            print(f"   - {example}")

    return image_map


def existing_image_map(master_data: dict[str, Any], image_dir: Path) -> dict[str, str]:
    image_map: dict[str, str] = {}
    for exp_code, card in iter_cards(master_data):
        card_id = str(card.get("id") or "")
        remote_url = card.get("image_url") or ""
        if not card_id or not remote_url:
            continue
        target, public_url = local_image_path(image_dir, exp_code, card_id, remote_url)
        if target.exists() and target.stat().st_size > 0:
            image_map[card_id] = public_url
    return image_map


def to_json(value: Any) -> str | None:
    if value is None:
        return None
    return json.dumps(value, ensure_ascii=False)


def sync_pokepedia(db_path: Path, data_file: Path, image_map: dict[str, str] | None = None) -> tuple[int, int]:
    master_data = load_master_data(data_file)
    image_map = image_map or {}

    print(f"🔄 Membaca data dari {data_file}...")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    print("📊 Sinkronisasi ekspansi...")
    all_expansions = []
    for entry in master_data.get("data", []):
        exp = entry.get("expansion", {}) or {}
        if exp:
            all_expansions.append(exp)

    for exp in all_expansions:
        cursor.execute(
            """
            INSERT INTO expansions (code, name_id, name_en, released_at, total_cards, pack_image_url, set_symbol_url, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(code) DO UPDATE SET
                name_id = excluded.name_id,
                name_en = excluded.name_en,
                total_cards = excluded.total_cards,
                released_at = excluded.released_at,
                pack_image_url = excluded.pack_image_url,
                set_symbol_url = excluded.set_symbol_url
            """,
            (
                exp.get("code"),
                exp.get("name_id"),
                exp.get("name_en"),
                exp.get("released_at"),
                exp.get("total_cards"),
                exp.get("pack_image_url"),
                exp.get("set_symbol_url"),
            ),
        )

    print("🃏 Sinkronisasi kartu...")
    total_synced = 0

    for exp_code, card in iter_cards(master_data):
        details = card.get("details") or {}
        card_id = str(card.get("id"))
        image_url = image_map.get(card_id) or card.get("image_url")

        cursor.execute(
            """
            INSERT INTO cards (
                id, external_id, expansion_code, collector_number,
                name_id, name_en, category,
                rarity, image_url, updated_at,
                regulation_mark, illustrator, hp, card_type,
                evolution_stage, evolves_from, retreat_cost,
                attacks, abilities, weakness, resistance, pokedex
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                external_id = excluded.external_id,
                expansion_code = excluded.expansion_code,
                collector_number = excluded.collector_number,
                name_id = excluded.name_id,
                name_en = excluded.name_en,
                category = excluded.category,
                rarity = excluded.rarity,
                image_url = excluded.image_url,
                updated_at = CURRENT_TIMESTAMP,
                regulation_mark = excluded.regulation_mark,
                illustrator = excluded.illustrator,
                hp = excluded.hp,
                card_type = excluded.card_type,
                evolution_stage = excluded.evolution_stage,
                evolves_from = excluded.evolves_from,
                retreat_cost = excluded.retreat_cost,
                attacks = excluded.attacks,
                abilities = excluded.abilities,
                weakness = excluded.weakness,
                resistance = excluded.resistance,
                pokedex = excluded.pokedex
            """,
            (
                card_id,
                card.get("id"),
                exp_code or card.get("expansion_code"),
                card.get("collector_number"),
                card.get("name_id"),
                card.get("name_en") or card.get("name_id"),
                card.get("category") or "Unknown",
                card.get("rarity"),
                image_url,
                card.get("regulation_mark"),
                card.get("illustrator"),
                details.get("hp"),
                details.get("card_type"),
                details.get("evolution_stage"),
                details.get("evolves_from"),
                details.get("retreat_cost"),
                to_json(card.get("attacks") or details.get("attacks")),
                to_json(card.get("abilities") if card.get("abilities") is not None else details.get("abilities")),
                to_json(card.get("weakness") or details.get("weakness")),
                to_json(card.get("resistance") if card.get("resistance") is not None else details.get("resistance")),
                to_json(card.get("pokedex") or details.get("pokedex")),
            ),
        )
        if image_map.get(card_id):
            cursor.execute(
                """
                UPDATE cards
                SET image_url = ?, updated_at = CURRENT_TIMESTAMP
                WHERE external_id = ?
                """,
                (image_map[card_id], card.get("id")),
            )
        total_synced += 1

        if total_synced % 1000 == 0:
            print(f"   ... {total_synced} kartu disinkronkan")

    conn.commit()
    conn.close()
    print("\n🎉 Sinkronisasi Pokepedia selesai!")
    print(f"   Total ekspansi: {len(all_expansions)}")
    print(f"   Total kartu:    {total_synced}")
    print(f"   DB:             {db_path}")
    return len(all_expansions), total_synced


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Sync Pokepedia data and optionally download card images.")
    parser.add_argument("--db", default=os.environ.get("DB_PATH") or str(DEFAULT_DB_PATH), help="SQLite DB path")
    parser.add_argument("--data", default=str(DEFAULT_DATA_FILE), help="Pokepedia all_data.json path")
    parser.add_argument("--download-images", action="store_true", help="Download all card images before syncing")
    parser.add_argument("--image-dir", default=str(DEFAULT_IMAGE_DIR), help="Frontend public image directory")
    parser.add_argument("--workers", type=int, default=12, help="Concurrent image download workers")
    parser.add_argument("--timeout", type=int, default=20, help="Image request timeout in seconds")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    db_path = Path(args.db)
    if not db_path.is_absolute():
        db_path = ROOT_DIR / "backend-go" / db_path
    data_file = Path(args.data)
    image_dir = Path(args.image_dir)

    master_data = load_master_data(data_file)
    image_map: dict[str, str] = {}
    if args.download_images:
        image_map = download_images(master_data, image_dir, args.workers, args.timeout)
    else:
        image_map = existing_image_map(master_data, image_dir)
        if image_map:
            print(f"🖼️  Memakai {len(image_map)} image lokal yang sudah ada.")

    sync_pokepedia(db_path, data_file, image_map)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
