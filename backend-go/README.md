# Pokemon TCG Indonesia API

RESTful API for Pokemon TCG Indonesia Master Database with AI-powered features.

## Features

- **Master Database**: 13,439+ cards with dual language support (ID/EN)
- **AI-Powered Deck Builder**: Budget-based recommendations with regulation mark compatibility
- **Price Arbitrage Scanner**: Compare Indonesian (IDR) vs US (USD) prices
- **Meta Analysis**: Value-for-money deck rankings from tournament data
- **Battle Simulator**: Predict winners based on game mechanics
- **Collection Manager**: Track portfolio value and set price alerts

## Tech Stack

- **Language**: Go 1.21+
- **Framework**: Gin
- **Database**: SQLite (embedded)
- **AI**: OpenRouter (free tier support)

## Quick Start

### Prerequisites

- Go 1.21 or higher
- SQLite3

### Installation

```bash
# Clone the repository
cd backend-go

# Install dependencies
make deps

# Import data (one-time)
make import

# Run the server
make dev
```

The API will be available at `http://localhost:8080`

## API Endpoints

### Cards

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/cards/search` | Search cards with filters |
| GET | `/api/v1/cards/:id` | Get card by ID |
| GET | `/api/v1/cards/:id/prices` | Get card prices |
| GET | `/api/v1/cards/:id/explain` | AI explanation of card |
| GET | `/api/v1/expansions` | List all expansions |
| GET | `/api/v1/expansions/:code` | Get expansion details |
| GET | `/api/v1/expansions/:code/cards` | Get cards in expansion |

### Decks

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/decks` | List deck archetypes |
| GET | `/api/v1/decks/:id` | Get deck details |
| POST | `/api/v1/decks/build` | AI deck builder |
| POST | `/api/v1/decks/analyze` | Analyze deck |
| POST | `/api/v1/decks/suggest` | Get deck suggestions |

### Meta

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/meta/overview` | Meta overview |
| GET | `/api/v1/meta/popularity` | Deck popularity |
| GET | `/api/v1/meta/value` | Value analysis |
| GET | `/api/v1/meta/tournaments` | Tournament list |
| GET | `/api/v1/meta/tournaments/:id` | Tournament details |

### Prices

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/prices/arbitrage` | Arbitrage opportunities |
| GET | `/api/v1/prices/cards/:id` | Price comparison |
| GET | `/api/v1/prices/cards/:id/history` | Price history |
| GET | `/api/v1/prices/summary` | Market summary |
| POST | `/api/v1/prices/collection-value` | Calculate collection value |

### Battle

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/battle/simulate` | Simulate card battle |
| POST | `/api/v1/battle/type-advantage` | Calculate type advantage |
| POST | `/api/v1/battle/deck-matchup` | Calculate deck matchup |

### Collection

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/collections/:id` | Get collection |
| POST | `/api/v1/collections/:id/add` | Add card to collection |
| DELETE | `/api/v1/collections/:id/remove` | Remove card |
| POST | `/api/v1/collections/:id/condition` | Update condition |
| GET | `/api/v1/collections/:id/stats` | Collection stats |
| POST | `/api/v1/alerts` | Create price alert |
| GET | `/api/v1/alerts` | List alerts |
| DELETE | `/api/v1/alerts/:id` | Delete alert |

### AI

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/ai/ask` | Ask AI question |

## Example Requests

### Search Cards

```bash
curl "http://localhost:8080/api/v1/cards/search?name=Pikachu&expansion=SV1S"
```

### Build Deck

```bash
curl -X POST "http://localhost:8080/api/v1/decks/build" \
  -H "Content-Type: application/json" \
  -d '{
    "budget_idr": 500000,
    "regulation_mark": "J",
    "preferred_type": "Fire",
    "play_style": "Aggro"
  }'
```

### Get Arbitrage Opportunities

```bash
curl "http://localhost:8080/api/v1/prices/arbitrage?min_margin=0.3&limit=10"
```

### Simulate Battle

```bash
curl -X POST "http://localhost:8080/api/v1/battle/simulate" \
  -H "Content-Type: application/json" \
  -d '{
    "card1_id": "SV1S-1-charizard",
    "card2_id": "SV1S-2-blastoise"
  }'
```

## Data Sources

- **Pokepedia**: 13,439 cards (Indonesian expansion data)
- **Cardtell**: 679 products with IDR prices
- **PriceCharting**: 395 cards with USD prices + PSA grading
- **LimitlessTCG**: 46 deck archetypes, 132 decklists, 24 tournaments, 5,584 standings
- **data_card_indo**: 91 expansions with detailed card data

## Environment Variables

```bash
# Server
PORT=8080
GIN_MODE=release

# AI (optional - enables AI features)
OPENROUTER_API_KEY=your_api_key_here
OPENROUTER_MODEL=meta-llama/llama-3.3-70b-instruct:free

# Database
DB_PATH=pokemon_tcg.db
```

## Project Structure

```
backend-go/
├── cmd/
│   ├── api/          # API server entry point
│   └── import/       # Data import tool
├── internal/
│   ├── handlers/     # HTTP handlers
│   ├── models/       # Data models
│   ├── services/     # Business logic
│   ├── database/     # Database layer
│   └── importer/     # Data import logic
├── build/            # Build artifacts
├── go.mod
├── go.sum
├── Makefile
└── README.md
```

## License

MIT
