# PokeLab - Pokemon TCG Indonesia

PokeLab adalah research lab untuk Pokemon TCG Indonesia. Fokus project ini adalah database kartu, inventory collection, rekomendasi deck meta berdasarkan kartu yang dimiliki user, deck gap analysis, anti-meta advisor, meta prediction, deck builder, dan AI explanation via OpenRouter.

Project ini terdiri dari:

- `frontend-astro/`: Astro + React + Tailwind CSS.
- `backend-go/`: Go API + SQLite.
- `data/`: seed data kartu, deck, tournament, dan price source.
- `scripts/`: scraper dan sync data.
- `docs/`: dokumentasi tambahan.

Catatan branding: project ini fan-made dan tidak berafiliasi dengan The Pokemon Company, Nintendo, Creatures, atau Game Freak.

## Fitur Utama

- PokeLab dashboard untuk meta radar dan inventory readiness.
- Rekomendasi deck meta berdasarkan `collections` user.
- Deck analysis detail: statistik deck, statistik per kartu, role kartu, ownership status, missing card, upgrade cost, dan tactical profile.
- Anti-meta matrix untuk memilih target deck dan melihat counter plan.
- Meta prediction board untuk Pokemon, Trainer, Supporter, Item, Stadium, dan Energy.
- AI advisor via OpenRouter sebagai penjelasan saja. Ranking dan scoring tetap dihitung deterministik di backend.

## Prasyarat

Install tool berikut:

- Node.js 18 atau lebih baru.
- npm 9 atau lebih baru.
- Go 1.25 untuk menjalankan backend lokal tanpa Docker.
- Docker Desktop, jika ingin menjalankan stack deploy lokal.
- Git, opsional tapi disarankan.

Project memakai SQLite embedded melalui `modernc.org/sqlite`, jadi untuk development lokal tidak perlu install server database.

## Struktur Project

```text
.
+-- backend-go/
|   +-- cmd/api/main.go          # API server
|   +-- cmd/import/main.go       # import data
|   +-- internal/                # handlers, services, models, database
|   +-- .env                     # env backend
|   +-- pokemon_tcg.db           # SQLite dev database
+-- frontend-astro/
|   +-- src/
|   +-- .env                     # env frontend
|   +-- package.json
+-- data/
+-- scripts/
+-- docs/
+-- DESIGN.md
+-- AGENTS.md
```

## Environment

### Backend `.env`

Buat atau cek file `backend-go/.env`:

```env
PORT=8080
GIN_MODE=release

DB_PATH=pokemon_tcg.db

JWT_SECRET=change-this-secret-in-production

REDIS_URL=

OPENROUTER_API_KEY=
OPENROUTER_MODEL=meta-llama/llama-3.3-70b-instruct:free

EXCHANGE_RATE=16400
DATA_DIR=../data
ENV=development
```

Keterangan:

- `DB_PATH`: lokasi SQLite database relatif dari folder `backend-go`.
- `JWT_SECRET`: wajib diganti untuk production.
- `OPENROUTER_API_KEY`: boleh kosong. Jika kosong, AI advisor akan fallback dan fitur scoring tetap jalan.
- `OPENROUTER_MODEL`: model OpenRouter yang dipakai untuk explanation.
- `REDIS_URL`: opsional. Kosongkan untuk development biasa.

### Frontend `.env`

Buat atau cek file `frontend-astro/.env`:

```env
PUBLIC_API_URL=http://localhost:8080/api/v1
```

`PUBLIC_API_URL` harus mengarah ke backend API. Untuk production, ganti ke domain API production.

## Menjalankan Backend Lokal

Dari root project:

```bash
cd backend-go
go mod download
go run cmd/api/main.go
```

Backend akan jalan di:

```text
http://localhost:8080
```

Cek health:

```bash
curl http://localhost:8080/api/v1/health
```

Response sukses kira-kira:

```json
{
  "status": "ok",
  "service": "pokemon-tcg-indonesia",
  "version": "1.0.0",
  "cache": false
}
```

## Menjalankan Frontend Lokal

Buka terminal kedua dari root project:

```bash
cd frontend-astro
npm install
npm run dev
```

Frontend akan jalan di salah satu URL berikut:

```text
http://localhost:3000
http://127.0.0.1:3000
```

Jika port `3000` terpakai, Astro biasanya menawarkan port lain. Ikuti URL yang muncul di terminal.

## Menjalankan Full Stack dengan Docker

Docker adalah opsi paling rapi untuk testing deploy lokal karena Go, Nginx frontend, backend, Redis, dan volume SQLite berjalan dengan konfigurasi yang sama.

1. Siapkan env deploy:

```powershell
Copy-Item .env.deploy.example .env.deploy
```

2. Edit `.env.deploy` dan ganti minimal:

```env
JWT_SECRET=isi-dengan-secret-panjang
OPENROUTER_API_KEY=
OPENROUTER_MODEL=meta-llama/llama-3.3-70b-instruct:free
```

3. Build dan jalankan:

```powershell
docker compose --env-file .env.deploy up -d --build
```

4. Buka:

```text
Frontend: http://localhost:3000
Backend:  http://localhost:8080/api/v1/health
Redis:    redis:6379 di network Docker
```

5. Lihat status container:

```powershell
docker compose --env-file .env.deploy ps
```

6. Matikan stack:

```powershell
docker compose --env-file .env.deploy down
```

### Arsitektur Docker

```text
Browser
  |
  v
frontend nginx :3000
  |-- static Astro files
  |-- /api/v1/* reverse proxy
  |-- /card-images/* mounted dari frontend-astro/public/card-images
  v
backend Go API :8080
  |-- SQLite file: backend-go/pokemon_tcg.db mounted to /app/data/pokemon_tcg.db
  |-- Redis cache: redis:6379
  |-- OpenRouter: explain/advisor/build when API key is available
```

Redis sudah disiapkan sebagai service cache untuk backend. Saat ini SQLite tetap menjadi database utama v1, disimpan lewat bind mount agar data tidak hilang saat container diganti.

Card image lokal tidak dimasukkan ke Docker image frontend supaya build context tetap kecil. Folder ini di-mount oleh Compose:

```text
./frontend-astro/public/card-images -> /usr/share/nginx/html/card-images
```

Jika deploy ke VPS, pastikan folder `card-images` ikut tersedia di host atau pindahkan asset gambar ke object storage/CDN dan update `image_url` di database.

## Alur Development Harian

1. Jalankan backend:

```bash
cd backend-go
go run cmd/api/main.go
```

2. Jalankan frontend:

```bash
cd frontend-astro
npm run dev
```

3. Buka frontend:

```text
http://localhost:3000
```

4. Register atau login user.

5. Buat collection di `/collections`.

6. Buka PokeLab:

```text
/lab
/lab/recommendations
/lab/deck-analysis
/lab/anti-meta
/lab/predictions
```

## Import Data

### 1. Full Import (dari folder `data/`)

Jika database belum ada atau ingin reimport data lengkap (kartu, deck, turnamen, harga):

```bash
cd backend-go
go run cmd/import/main.go
```

Dengan path data custom:

```bash
cd backend-go
go run cmd/import/main.go ../data
```

Database SQLite default akan dibuat di:

```text
backend-go/pokemon_tcg.db
```

### 2. Auto-Sync (Pokepedia + LimitlessTCG)

Script `scripts/sync/sync_all.py` menyinkronkan data terbaru dari sumber online:

- **Pokepedia** (kartu + gambar): butuh `POKEPEDIA_API_KEY` (Supabase publishable/secret key)
- **LimitlessTCG** (turnamen + decklist): tidak butuh API key

```bash
# Sync semua (kartu + turnamen)
python scripts/sync/sync_all.py

# Hanya kartu + gambar Pokepedia
python scripts/sync/sync_all.py --cards-only

# Hanya turnamen + decklist LimitlessTCG
python scripts/sync/sync_all.py --tournaments-only

# Dry run (lihat apa yang akan disinkronkan)
python scripts/sync/sync_all.py --dry-run
```

Sync terjadwal (ofelia) juga otomatis menjalankan `import_official_cards.py`
setelah full sync harian (idempotent — kartu existing di-update, gambar existing
di-skip). Mode `--tournaments-only` berjalan tanpa `POKEPEDIA_API_KEY`.

**Environment variables untuk sync:**
| Variable | Required | Default | Keterangan |
|----------|----------|---------|------------|
| `DB_PATH` | Tidak | `backend-go/pokemon_tcg.db` | Path database SQLite |
| `IMAGE_DIR` | Tidak | `frontend-astro/public/card-images` | Folder gambar kartu |
| `POKEPEDIA_API_KEY` | **Ya (cards-only)** | - | Supabase publishable (`sb_publishable_*`) atau secret (`sb_secret_*`) key. **Legacy anon key DISABLED sejak 2026-06-13.** |
| `POKEPEDIA_SUPABASE_URL` | Tidak | `https://tlauakxyrxpwnwgdywum.supabase.co/rest/v1` | Supabase REST endpoint |
| `SYNC_WORKERS` | Tidak | `8` | Worker download gambar paralel |
| `SYNC_TIMEOUT` | Tidak | `20` | Timeout request (detik) |

> ⚠️ **Penting:** Pokepedia Supabase legacy anon key telah dinonaktifkan (2026-06-13). Untuk sync kartu, Anda **harus** menyediakan `POKEPEDIA_API_KEY` berformat baru (publishable/secret key) dari dashboard Supabase pokepedia.id. Tanpa key ini, sync kartu akan gagal dengan pesan jelas.

### 3. Import Kartu dari Situs Resmi (asia.pokemon-card.com)

Script `scripts/sync/import_official_cards.py` mengimpor kartu + gambar langsung dari
situs resmi Pokemon TCG Indonesia (alternatif saat Pokepedia tidak tersedia):

```bash
# Import satu expansion (contoh: MA6 "30th Celebration")
python scripts/sync/import_official_cards.py --expansions MA6

# Import beberapa expansion sekaligus
python scripts/sync/import_official_cards.py --expansions MA6 MA5

# Dry run (tanpa menulis DB / download gambar)
python scripts/sync/import_official_cards.py --expansions MA6 --dry-run

# Hanya update data DB, skip download gambar
python scripts/sync/import_official_cards.py --expansions MA6 --skip-images
```

Fitur:
- Paginasi otomatis via card search resmi (`/id/card-search/list/`)
- Parse detail lengkap: HP, tipe, serangan + biaya energi, ability, weakness, resistansi, retreat, regulation mark, illustrator, Pokedex
- Kategori otomatis (Pokemon / Trainer / Energy) + rarity dari halaman special set
- Download gambar PNG resmi lalu konversi ke WebP (butuh `pip install --user --break-system-packages pillow`)
- Idempotent: kartu yang sudah ada (match `expansion_code` + `collector_number`) di-update, bukan diduplikasi
- Refresh `expansions.total_cards` otomatis

> Catatan: direktori `frontend-astro/public/card-images/<SET>` harus writable oleh user
> yang menjalankan script. Jika dimiliki root, pindahkan dulu (contoh:
> `sudo chown -R $USER card-images/MA6`).

### 4. Engine Deck Builder (build-around)

Fitur `/lab/ml` dan tombol di halaman detail kartu: bangun deck 60-kartu legal
di sekitar SATU kartu engine unik (Mew ex, Gengar ex, Bronzong, Alolan Exeggutor, dst).

Cara kerja (deterministik, tanpa AI generative):
1. **Deteksi pattern** dari teks ability/serangan kartu (data situs resmi):
   - `bench_attacker` — ability memakai serangan Pokémon Cadangan (Mew ex "Spiral Ingatan")
   - `energy_stacker` — scale dengan jumlah Energi (Alolan Exeggutor "Scale Up")
   - `damage_counter` — manipulasi Token Kerusakan (Gengar ex "Vonis Mati" / "Chaos Pain")
   - `punish_engine` — balas KO (coin flip revenge)
   - `draw_engine` — draw support (Bronzong "Triple Draw")
   - `mega_engine` / `big_hitter` — fallback
2. **Partner scoring**: co-occurrence dari 4.500+ decklist turnamen (bobot 3) +
   kecocokan pattern (damage/cost/ability, bobot 2) + kompatibilitas tipe energi
3. **Rantai evolusi otomatis**: backward (Gastly→Haunter→Gengar ex), forward
   (Exeggcute→Alolan Exeggutor bila user pilih basic), dan Mega evolution
4. **Trainer core** dari decklist yang menyertai engine (Bola Ultra, Mistika, dst)
5. **Energi** dari agregat biaya serangan engine + partner (prioritas Energi Dasar)
6. **Explainability**: setiap pilihan punya alasan (pattern, co-occurrence count, dll)

```bash
# Endpoint
curl -X POST http://localhost:8080/api/v1/decks/build-around \
  -H "Content-Type: application/json" -d '{"card_id":"73466"}'
```

Validasi: selalu tepat 60 kartu, max 4 copy per nama, pool regulation H/I/J.

### 5. User Flow & Navigasi

Struktur menu mengikuti perjalanan user awam (novice-first IA):

```
Landing (/)
  └─ CTA utama: "Lihat Meta Deck Sekarang"
Nav utama (4 item, tanpa jargon):
  1. Meta Deck  (/decks)   → tabel meta + pilihan ML + radar kartu unik
  2. Kartu      (/cards)   → database kartu + shortcut kartu unik
  3. Koleksi    (/collections) → koleksi pribadi → rekomendasi beli
  4. Riset      (/lab)     → launcher 5 alat riset berorientasi tugas
```

Alur lintas fitur (cross-feature flows):

| Dari | Ke | Mekanisme |
|---|---|---|
| Radar kartu unik | Bangun Deck | `?engine=` auto-build |
| Detail kartu | Bangun Deck | CTA "Bangun deck di sekitar kartu ini" |
| Tabel meta | Detail archetype | klik baris (deck browser berfilter) |
| Detail archetype | Detail deck | klik decklist |
| Anti-meta | Detail deck | kartu counter deck |
| Koleksi | Rekomendasi beli | login + collection aktif |
| `/lab/ml` (lama) | `/decks?tab=builder` | redirect yang mempertahankan `?engine=` |

Konsolidasi: Engine Builder hanya di `/decks?tab=builder` (tab kedua);
`/lab` menjadi launcher tugas, bukan dashboard padat. Halaman statistik chart
pindah ke tab ketiga `/decks?tab=statistik`.

### 7. Prediksi Meta dari Jepang (Sinyal dari Jepang)

Board prediksi berbasis turnamen JP (`GET /api/v1/research/jp-forecast`),
tampil di atas halaman Prediksi Meta (`/lab/predictions`):

- **Sinyal breakout**: archetype dengan momentum tinggi di City League JP
  namun belum muncul di meta internasional (rilis JP memimpin 3-6 bulan)
- **Skor**: `jpShare*8 + topCutRate*0.8 + recentShare*0.3 + 15 jika global < 1%`
- **Verdict**: Kandidat meta global / Mulai muncul / Sudah meta global / Pantau
- Metrik per archetype: jumlah deck JP, share JP, top-cut rate, aktivitas 30 hari,
  share global (pencocokan token fuzzy antar nama archetype)
- Metodologi transparan di UI (panel "Cara hitung")

Kartu set JP otomatis diterjemahkan ke nama Latin/Inggris via halaman
translations limitlesstcg (konvensi nama IDN = nama Inggris), plus mapping
manual untuk trainer/energi spesial. Nama tersimpan di `name_id` + `name_en`.

### 8. Data Kartu Jepang + City League (limitlesstcg.com)

**Import set kartu JP/internasional** dari database limitlesstcg.com:

```bash
# Set Jepang (mis. M6 "Storm Emeralda", rilis lebih awal dari global)
python scripts/sync/import_limitless_cards.py --jp-sets M6

# Set internasional yang belum ada di DB (MEG, MEE, ASC, DRI, 30C)
python scripts/sync/import_limitless_cards.py --sets MEG MEE ASC DRI 30C
```

Parser mendukung Pokemon/Trainer/Energy (termasuk special energy), biaya energi
per serangan (simbol G/R/W/L/P/F/D/M/C/N), ability, regulation mark, weakness,
retreat, illustrator, rarity, dan download gambar webp.

**Sinkronisasi turnamen City League Jepang** (listing berpaginasi -> detail ->
decklist via `data-set`/`data-number` eksak, fallback nama Inggris):

```bash
python scripts/sync/sync_jp_tournaments.py --pages 40   # ~1000 turnamen
```

Tanpa rekor W-L-T (City League tidak mempublikasikannya), tapi placement
(top cut) dan archetype per pemain terekam. Data JP memperkaya prediksi meta
awal: set JP rilis 3-6 bulan sebelum internasional.

### 9. Data Turnamen Skala Penuh (via Limitless API)

Sinkronisasi penuh `--full` menarik seluruh turnamen Standard dari Limitless API
(15 halaman, 750 turnamen) termasuk standings dengan rekor match W-L-T per pemain:

```bash
# Full sync + backfill rekor match (idempotent, resume otomatis)
python scripts/sync/sync_all.py --tournaments-only --full
```

Skala data: **750 turnamen · 48.275 decklist · ~150.000 match W-L-T tercatat**
(paritas dengan play.limitlesstcg.com/decks: 693 turnamen, 50.495 pemain).

Fitur sync:
- Commit berkala tiap 20 turnamen (proses terputus tidak kehilangan progres)
- Backoff otomatis saat rate limit 429 (20s/40s/60s, 5 percobaan)
- Smart resume: turnamen yang sudah punya rekor W-L-T otomatis di-skip
- Kolom `decklists.win_count/loss_count/tie_count/points` terisi dari standings

Model forecast v2 (`v2-match-records`) menghitung skor dari data match nyata:
`skor = share×4.5 + max(0, win%−30)×1.1 + depth×0.35 + momentum×0.1`

### 10. PokeLab Hub (/decks)

Halaman riset utama terinspirasi play.limitlesstcg.com/decks, dipadukan statistik ML:

- **Stats bar**: jumlah archetype, decklist, partisipasi turnamen, kemenangan (data nyata DB)
- **Pilihan ML**: 3 archetype dengan skor prediksi menang tertinggi (min. 3 turnamen)
- **Radar kartu unik**: 14 kartu unik terbaru (sort=newest, dari expansion terbaru) dengan badge pattern
- **Tabel meta ala Limitless**: rank, ikon kartu kunci (3 Pokemon teratas decklist representatif),
  jumlah deck, meta share, win %, skor ML, momentum & keyakinan (bar), rekor W/T8, tren naik-turun.
  Semua kolom bisa diklik untuk sorting. Klik baris masuk ke detail archetype (browser decklist berfilter).
- Endpoint pendukung: `key_cards` di `/research/meta-forecast`, `sort=newest` di `/cards/unique-engines`

### 11. Detektor Kartu Unik (/cards/unique)

Pemindai otomatis seluruh pool regulation H/I/J yang mengklasifikasi kartu
berdasarkan pola ability & serangan (pencocokan kata kunci Indonesia dari data
situs resmi):

| Pattern | Contoh | Deteksi |
|---|---|---|
| `bench_attacker` | Mew ex "Spiral Ingatan" | "menggunakan semua serangan Pokémon Cadangan" |
| `energy_manip` | Alolan Exeggutor "Scale Up" | biaya energi berkurang / HP scale dengan energi |
| `energy_accel` | Bellibolt "Streamer Elektrik" | "tambahkan/pasang Energi" |
| `damage_counter` | Gengar ex "Vonis Mati" | "Token Kerusakan" |
| `punish` | Pikachu ex "Hati Pejuang" | efek balasan saat KO (word-boundary `\bKO\b`) |
| `draw_engine` | Bronzong "Triple Draw" | "ambil N kartu" |
| `disruption` | Jellicent ex "Kutukan Laut" | "lawan tidak dapat" / kocok / buang kartu lawan |
| `protection` | Empoleon ex "Kuda-kuda Kaisar" | "tidak menerima kerusakan/efek" |
| `healing` | — | "pulihkan HP" |
| `multi_attack` | Seaking "Orkes Festival" | "serangan 2 kali" |
| `efficiency` | — | outlier damage/energi (≥140 dmg @≤2 energi, dst.) |

Fitur: skor uniqueness per kartu (bisa multi-pattern), dedupe per nama kartu
(printing terbaik), filter + pencarian + pagination, cache in-memory 10 menit,
dan tombol **Build Deck** langsung ke Engine Deck Builder.

```bash
curl "http://localhost:8080/api/v1/cards/unique-engines?pattern=bench_attacker&limit=10"
```

### 12. Import Koleksi Pribadi (inventory_kartu_saya.md)

Script `scripts/import_inventory.py` mengimpor inventaris kartu fisik dari `inventory_kartu_saya.md` ke koleksi user `abagasw`:

```bash
python scripts/import_inventory.py
```

Ini akan membuat koleksi bernama **"Koleksi Kartu Saya"** untuk user `abagasw` dengan 319 item (884 total quantity). Item yang tidak cocok (2 item: Qia, Seila) dilaporkan karena belum ada di database Pokepedia.

## Test dan Build

### Backend test

```bash
cd backend-go
go test ./...
```

### Frontend build

```bash
cd frontend-astro
npm run build
```

Output build frontend ada di:

```text
frontend-astro/dist/
```

### E2E runtime check

Setelah frontend dan backend hidup, jalankan:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/e2e/pokelab-e2e.ps1
```

Script ini mengetes health, frontend route aktif, route `/prices` sudah nonaktif, negative auth, register/login, detail kartu, asset image kartu, detail deck, decklists, AI deck builder fallback, deck analyze, collections, ownership protection, research recommendations, deck-analysis, anti-meta, predictions, advisor, dan AI suggest decks.

### Preview frontend production build

```bash
cd frontend-astro
npm run preview
```

## Endpoint Penting

Base URL:

```text
http://localhost:8080/api/v1
```

Public:

- `GET /health`
- `GET /cards`
- `GET /cards/:id`
- `GET /decks`
- `POST /auth/register`
- `POST /auth/login`

Protected, butuh JWT:

- `GET /collections`
- `POST /collections`
- `GET /research/recommendations?collection_id=...`
- `GET /research/deck-gap?collection_id=...&deck_id=...`
- `GET /research/deck-analysis?collection_id=...&deck_id=...`
- `POST /research/anti-meta`
- `GET /research/predictions`
- `POST /research/advisor`

Frontend otomatis mengirim header:

```text
Authorization: Bearer <access_token>
```

setelah user login.

## Troubleshooting

### Frontend tidak bisa konek backend

Cek `frontend-astro/.env`:

```env
PUBLIC_API_URL=http://localhost:8080/api/v1
```

Cek backend hidup:

```bash
curl http://localhost:8080/api/v1/health
```

### Research endpoint return unauthorized

Login ulang di frontend. Endpoint research protected karena rekomendasi memakai inventory user.

### Rekomendasi kosong

Pastikan:

- User sudah login.
- User punya collection.
- Database punya data deck dan deck card.
- `collection_id` yang dikirim adalah collection milik user tersebut.

### AI advisor tidak menjawab

Pastikan `OPENROUTER_API_KEY` sudah diisi. Jika kosong atau OpenRouter gagal, fitur scoring tetap jalan dan UI tetap menampilkan hasil deterministik.

### Port 8080 atau 3000 sudah dipakai

Windows PowerShell:

```powershell
Get-NetTCPConnection -LocalPort 8080
Get-NetTCPConnection -LocalPort 3000
```

Lalu hentikan proses yang memakai port tersebut jika memang tidak diperlukan.

## Rekomendasi Deploy

Jawaban singkat:

- Development lokal: tidak perlu Docker.
- Production sederhana/VPS: gunakan Docker Compose full stack atau backend Docker + frontend static hosting, dan simpan SQLite di persistent volume.
- Jangan deploy "database saja di Docker" untuk kondisi project sekarang, karena database saat ini adalah SQLite file, bukan database server.
- Untuk production serius multi-user: migrasi database ke PostgreSQL, lalu deploy PostgreSQL sebagai managed database atau container terpisah.

### Kenapa database saja di Docker belum cocok?

Backend saat ini memakai SQLite:

```text
DB_PATH=pokemon_tcg.db
```

SQLite adalah file database yang dibuka langsung oleh proses backend. Tidak ada service database yang bisa dipisah seperti `postgres:5432` atau `mysql:3306`. Jadi kalau hanya "database di Docker", backend lokal tidak otomatis berbicara ke container database. Yang benar untuk SQLite adalah:

- backend membaca file `.db`;
- file `.db` disimpan di disk atau volume;
- backup file `.db` secara rutin.

### Opsi Deploy yang Disarankan

#### Opsi A: Paling mudah untuk v1

Frontend:

- Deploy `frontend-astro` ke Vercel, Netlify, Cloudflare Pages, atau static hosting lain.
- Set env:

```env
PUBLIC_API_URL=https://api-domain-kamu.com/api/v1
```

Backend:

- Deploy backend Go di VPS atau service container.
- Pakai SQLite file di persistent disk/volume.
- Backup `pokemon_tcg.db` secara rutin.

Cocok untuk:

- MVP.
- Demo.
- User belum terlalu banyak.
- Operasional ingin simpel.

#### Opsi B: Full Docker di VPS

Jalankan frontend, backend, Redis, dan SQLite bind mount lewat Docker Compose.

Contoh konsep:

```text
container frontend -> nginx static + /api/v1 proxy
container backend  -> /app/data/pokemon_tcg.db
container redis    -> redis:6379
host database      -> ./backend-go/pokemon_tcg.db
```

Cocok untuk:

- VPS sendiri.
- Ingin backend mudah restart/update.
- Tetap ingin SQLite.
- Ingin Redis siap untuk cache tanpa install manual.

Catatan: pastikan volume database persisten. Jangan simpan database hanya di layer container, karena data bisa hilang saat container diganti.

#### Opsi C: Production lebih serius

Migrasi SQLite ke PostgreSQL.

Deployment:

- Frontend static: Vercel/Netlify/Cloudflare Pages.
- Backend: Docker/container service.
- Database: managed PostgreSQL seperti Supabase, Neon, Railway, Render, Fly Postgres, atau RDS.
- Redis: opsional untuk cache.

Cocok untuk:

- Banyak user.
- Butuh backup otomatis.
- Butuh observability dan scaling.
- Butuh query concurrent lebih aman.

## Rekomendasi Final

Untuk kondisi project sekarang, pilih:

1. Development: jalankan frontend dan backend langsung tanpa Docker.
2. MVP production: frontend static hosting, backend Docker di VPS, SQLite di persistent volume.
3. Setelah user aktif bertambah: migrasi ke PostgreSQL managed, bukan "database SQLite saja di Docker".

Jangan mulai dari "database saja di Docker" karena tidak memberi banyak manfaat pada arsitektur SQLite sekarang. Docker lebih berguna untuk menjalankan backend dan dependency seperti Redis. Database baru masuk akal dipisah di Docker kalau sudah memakai PostgreSQL atau MySQL.

## Command Cepat

Backend:

```bash
cd backend-go
go run cmd/api/main.go
```

Frontend:

```bash
cd frontend-astro
npm install
npm run dev
```

Test:

```bash
cd backend-go
go test ./...

cd ../frontend-astro
npm run build

powershell -ExecutionPolicy Bypass -File ../scripts/e2e/pokelab-e2e.ps1
```

Health:

```bash
curl http://localhost:8080/api/v1/health
```
