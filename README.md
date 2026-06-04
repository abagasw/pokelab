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

Jika database belum ada atau ingin reimport data:

```bash
cd backend-go
go run cmd/import/main.go
```

Jika import command membutuhkan path data di environment tertentu, gunakan:

```bash
cd backend-go
go run cmd/import/main.go ../data
```

Database SQLite default akan dibuat di:

```text
backend-go/pokemon_tcg.db
```

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
