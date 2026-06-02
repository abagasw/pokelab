# Import Data ke Database

Panduan untuk mengimpor data dari berbagai sumber ke database SQLite.

## Data Source

Data tersimpan di folder `../data/` dengan struktur:

```
data/
├── data_card_indo/
│   └── all_data.json              # 13,439 kartu dari Pokepedia
├── data_deck_limitlesstcg/
│   └── limitlesstcg_complete_all.json  # 46 deck, 132 decklists
├── price_indo_cardtell/
│   └── cardtell_batch_*.json      # Harga IDR dari Cardtell
└── pricecharting/
    └── pricecharting_batch_*.json # Harga USD dari PriceCharting
```

## Cara Import

### 1. Build Import Tool

```bash
cd backend-go
go build -o build/import-data ./cmd/import
```

### 2. Jalankan Import

```bash
# Import dari ../data ke pokemon_tcg.db
./build/import-data

# Atau dengan path custom
./build/import-data /path/to/data /path/to/output.db
```

## Hasil Import

Output terakhir:
```
--- Import Summary ---
Expansions: 91
Cards: 13,439
Tournaments: 1
Decks: 46
Prices: 593
  - IDR prices: 593
  - USD prices: 0
```

## Verifikasi Database

```bash
# Cek tabel
sqlite3 pokemon_tcg.db ".tables"

# Cek jumlah data
sqlite3 pokemon_tcg.db "SELECT COUNT(*) FROM cards;"
sqlite3 pokemon_tcg.db "SELECT COUNT(*) FROM expansions;"
sqlite3 pokemon_tcg.db "SELECT COUNT(*) FROM card_prices;"

# Lihat sample data
sqlite3 pokemon_tcg.db "SELECT name_id, name_en, expansion_code FROM cards LIMIT 5;"

# Cek harga kartu
sqlite3 pokemon_tcg.db "SELECT c.name_id, cp.price_idr, cp.source FROM cards c JOIN card_prices cp ON c.id = cp.card_id LIMIT 10;"
```

## Troubleshooting

### Error: "no such table"
- Schema belum dibuat. Jalankan ulang import.

### Error: "foreign key constraint failed"
- Data expansion belum diimport. Pastikan all_data.json ada.

### Harga tidak masuk
- Periksa format JSON di folder pricecharting/cardtell
- Nama kartu mungkin tidak cocok (fuzzy matching digunakan)

## Struktur Database

### Tabel: expansions
- id, code, name_id, name_en, series_id, total_cards, released_at

### Tabel: cards
- id, external_id, name_id, name_en, category, expansion_code, collector_number
- regulation_mark, rarity, hp, card_type, attacks, abilities, weakness

### Tabel: card_prices
- card_id, source (Cardtell/PriceCharting), price_idr, price_usd, condition

### Tabel: decks
- id, name, format, category, tournament_count

### Tabel: tournaments
- id, name, date, format, location, player_count
