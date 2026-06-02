# Script Pokémon TCG - Struktur Direktori

Koleksi script untuk scraping data LimitlessTCG, Cardtell, dan sinkronisasi database.

## Struktur Direktori

- **`/scrapers/`**: Berisi semua script pengambil data (scraper).
    - **`limitless/`**: Script khusus LimitlessTCG. 
        - *Master Utama*: `limitlesstcg_deep_scraper.py` (Gunakan ini untuk meta 2026).
    - **`cardtell/`**: Berisi berbagai versi scraper untuk Cardtell.
    - **`price/`**: Scraper harga dari TCGPlayer, Pricecharting, Tokopedia, dan Pokepedia.
- **`/sync/`**: Script untuk memasukkan/sinkronisasi data dari file JSON/CSV ke database SQLite.
    - *Master Utama*: `sync_limitlesstcg_results.py`.
- **`/tests/`**: Script testing kecil untuk memverifikasi koneksi, HTML, atau API.
- **`/archives/`**: Versi lama, script update sekali pakai, dan backup.

## Script Utama (Workflow 2026)

1.  **Scraping**: `python3 scrapers/limitless/limitlesstcg_deep_scraper.py`
2.  **Sync**: `python3 sync/sync_limitlesstcg_results.py`
3.  **Runner**: `./run_all_batches.sh` (Untuk Cardtell)
