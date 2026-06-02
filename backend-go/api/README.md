# Pokemon TCG Indonesia API

RESTful API untuk Pokemon TCG Indonesia Master Database dengan fitur AI-powered.

## Daftar Endpoint

### Cards
- `GET /api/v1/cards` - Cari kartu
- `GET /api/v1/cards/:id` - Detail kartu
- `GET /api/v1/cards/:id/prices` - Harga kartu
- `GET /api/v1/cards/:id/battle-ready` - Info battle kartu

### Expansions
- `GET /api/v1/expansions` - Daftar expansion
- `GET /api/v1/expansions/:code` - Detail expansion
- `GET /api/v1/expansions/:code/cards` - Kartu dalam expansion

### Decks
- `GET /api/v1/decks` - Daftar deck archetype
- `GET /api/v1/decks/:id` - Detail deck
- `POST /api/v1/decks/build` - AI Deck Builder
- `POST /api/v1/decks/analyze` - Analisis deck

### Tournaments
- `GET /api/v1/tournaments` - Daftar turnamen
- `GET /api/v1/tournaments/:id` - Detail turnamen
- `GET /api/v1/tournaments/:id/standings` - Klasemen turnamen

### Battle Simulator
- `POST /api/v1/battle/simulate` - Simulasi pertarungan
- `GET /api/v1/battle/type-chart` - Type chart
- `POST /api/v1/battle/analyze-matchup` - Analisis matchup

### Prices
- `GET /api/v1/prices/compare` - Bandingkan harga
- `GET /api/v1/prices/arbitrage` - Peluang arbitrage
- `GET /api/v1/prices/trends` - Tren harga
- `GET /api/v1/prices/best-deals` - Deal terbaik

### Meta Analysis
- `GET /api/v1/meta/overview` - Overview meta
- `GET /api/v1/meta/deck-popularity` - Popularitas deck
- `GET /api/v1/meta/value-analysis` - Analisis nilai
- `POST /api/v1/meta/ask` - Tanya AI tentang meta

### Collections
- `GET /api/v1/collections` - Daftar koleksi
- `POST /api/v1/collections` - Buat koleksi
- `GET /api/v1/collections/:id` - Detail koleksi
- `POST /api/v1/collections/:id/items` - Tambah kartu
- `DELETE /api/v1/collections/:id/items/:itemId` - Hapus kartu
- `GET /api/v1/collections/:id/summary` - Ringkasan koleksi

### Alerts
- `GET /api/v1/alerts` - Daftar alert
- `POST /api/v1/alerts` - Buat alert
- `DELETE /api/v1/alerts/:id` - Hapus alert

### AI Assistant
- `POST /api/v1/ai/ask` - Tanya AI
- `POST /api/v1/ai/explain-card` - Jelaskan kartu
- `POST /api/v1/ai/suggest-decks` - Saran deck

## Health Check
- `GET /api/v1/health` - Status API
