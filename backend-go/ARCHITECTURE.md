# Arsitektur Pokemon TCG Indonesia API

## Overview

Arsitektur yang digunakan adalah **Monolithic Layered Architecture** dengan **Clean Architecture** principles. Cocok untuk aplikasi dengan 13,000+ kartu dan fitur AI integration.

## 🏗️ Arsitektur Layers

```
┌─────────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                        │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐   │
│  │   HTTP      │ │   JSON      │ │  Error Handling     │   │
│  │   Router    │ │   Response  │ │  Middleware         │   │
│  └─────────────┘ └─────────────┘ └─────────────────────┘   │
│                           │                                  │
│  Handlers: card_handler, deck_handler, battle_handler, etc  │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│                   BUSINESS LAYER                             │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐   │
│  │   Card      │ │   Deck      │ │   Battle            │   │
│  │   Service   │ │   Service   │ │   Service           │   │
│  └─────────────┘ └─────────────┘ └─────────────────────┘   │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐   │
│  │   Price     │ │ Collection  │ │   AI Service        │   │
│  │   Service   │ │   Service   │ │   (OpenRouter)      │   │
│  └─────────────┘ └─────────────┘ └─────────────────────┘   │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│                     DATA LAYER                               │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐   │
│  │   SQLite    │ │   Queries   │ │   Repository        │   │
│  │   Database  │ │   (SQL)     │ │   Pattern           │   │
│  └─────────────┘ └─────────────┘ └─────────────────────┘   │
│                           │                                  │
│  Tables: cards, expansions, decks, tournaments, prices      │
└─────────────────────────────────────────────────────────────┘
```

## 📁 Project Structure (Clean Architecture)

```
backend-go/
│
├── cmd/                          # Entry points
│   ├── api/main.go              # HTTP server
│   └── import/main.go           # Data import tool
│
├── internal/                     # Private code
│   ├── config/                  # Configuration
│   │   └── config.go           # Env vars, settings
│   │
│   ├── handlers/                # Presentation Layer
│   │   ├── card_handler.go     # Card endpoints
│   │   ├── deck_handler.go     # Deck endpoints
│   │   ├── battle_handler.go   # Battle simulator
│   │   ├── price_handler.go    # Price analysis
│   │   ├── collection_handler.go
│   │   └── meta_handler.go     # Meta analysis
│   │
│   ├── services/                # Business Layer
│   │   ├── card_service.go     # Card business logic
│   │   ├── deck_service.go     # Deck building AI
│   │   ├── battle_service.go   # Battle simulation
│   │   ├── price_service.go    # Price arbitrage
│   │   ├── collection_service.go
│   │   └── ai_service.go       # OpenRouter integration
│   │
│   ├── models/                  # Domain Models
│   │   ├── card.go             # Card entity
│   │   ├── deck.go             # Deck entity
│   │   ├── battle.go           # Battle models
│   │   ├── collection.go       # Collection models
│   │   └── expansion.go        # Expansion models
│   │
│   ├── database/                # Data Layer
│   │   ├── init.go            # Schema creation
│   │   └── queries.go         # SQL queries
│   │
│   └── importer/                # Data Import
│       └── importer.go         # JSON to SQLite
│
├── api/                         # Public API Client
│   ├── client.go               # API client example
│   ├── types.go                # Shared types
│   └── errors.go               # Error definitions
│
├── build/                       # Compiled binaries
├── pokemon_tcg.db              # SQLite database
└── README.md                   # Documentation
```

## 🔑 Key Design Patterns

### 1. Repository Pattern
```go
// Database abstraction
type DB struct {
    *sql.DB
}

// Queries organized by entity
func (db *DB) SearchCards(filter CardFilter) ([]Card, error)
func (db *DB) GetCardByID(id string) (*Card, error)
func (db *DB) GetPriceArbitrage(threshold float64) ([]PriceComparison, error)
```

**Benefits:**
- Easy to switch database (SQLite → PostgreSQL)
- Testable dengan mock repository
- SQL terpusat di satu tempat

### 2. Service Pattern
```go
// Business logic encapsulation
type CardService struct {
    db        *sql.DB
    aiService *AIService
}

func (s *CardService) SearchCards(ctx context.Context, req SearchRequest) (*SearchResponse, error)
func (s *CardService) ExplainCard(ctx context.Context, cardID uuid.UUID) (string, error)
```

**Benefits:**
- Reusable business logic
- Easy to unit test
- Decoupled dari HTTP layer

### 3. Dependency Injection
```go
// Constructor injection
func NewCardService(db *sql.DB, aiService *AIService) *CardService {
    return &CardService{db: db, aiService: aiService}
}

func NewCardHandler(cardService *CardService) *CardHandler {
    return &CardHandler{cardService: cardService}
}
```

**Benefits:**
- Loose coupling
- Testable (mock dependencies)
- Clear dependency graph

### 4. Handler Pattern (MVC Controller)
```go
// HTTP request handling
type CardHandler struct {
    cardService *CardService
}

func (h *CardHandler) GetCardByID(c *gin.Context) {
    id := c.Param("id")
    card, err := h.cardService.GetCardByID(c.Request.Context(), id)
    // ... handle response
}
```

## 🔄 Data Flow

```
HTTP Request
     │
     ▼
┌─────────────┐
│   Router    │ (Gin)
│  (main.go)  │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Handler   │ (Input validation, HTTP response)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Service   │ (Business logic, AI calls)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Repository │ (SQL queries)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   SQLite    │ (Database)
└─────────────┘
```

## 🧠 AI Integration Architecture

```
┌─────────────────────────────────────┐
│          AI Service Layer           │
│     (internal/services/ai_service)  │
└───────────────┬─────────────────────┘
                │
    ┌───────────┼───────────┐
    │           │           │
    ▼           ▼           ▼
┌───────┐  ┌───────┐  ┌───────────┐
│ Open  │  │ Fallback│  │  Cache    │
│Router │  │Response │  │  (future) │
│  API  │  │         │  │           │
└───────┘  └───────┘  └───────────┘
```

**Rate Limiting Strategy:**
- OpenRouter free tier: 20-60 req/min
- Fallback ke local response jika limit tercapai
- Cache AI responses (future improvement)

## 🗄️ Database Architecture

### SQLite (Embedded)
**Why SQLite?**
- ✅ Zero configuration
- ✅ Single file (mudah backup/transfer)
- ✅ Cukup untuk 13k+ kartu
- ✅ No separate database server
- ✅ Good performance for read-heavy workload

**Schema Design:**
```sql
-- Normalized structure
expansions (1) ───< cards (N) ───< card_prices (N)

decks (1) ───< deck_cards (N) ───> cards (N)

tournaments (1) ───< tournament_standings (N) ───> decklists (N)
```

### Migration Strategy
```go
// Schema versioning (future)
func (db *DB) Migrate() error {
    // v1: Initial schema
    // v2: Add indexes
    // v3: Add new columns
}
```

## 🚀 Deployment Architecture

### Option 1: Single Binary (Recommended)
```
┌─────────────────────────────────┐
│         VPS / Cloud             │
│  ┌───────────────────────────┐  │
│  │  Pokemon TCG API Binary   │  │
│  │  (Go + SQLite + Static)   │  │
│  │                           │  │
│  │  Port: 8080               │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

**Pros:**
- Simple deployment
- Single executable
- Easy to scale horizontally (multiple instances with shared DB)

### Option 2: Docker Container
```yaml
# docker-compose.yml
version: '3.8'
services:
  api:
    build: .
    ports:
      - "8080:8080"
    volumes:
      - ./data:/app/data
    environment:
      - DB_PATH=/app/data/pokemon_tcg.db
```

### Option 3: Serverless (Future)
```
┌─────────────────────────────────────┐
│         AWS Lambda / Cloud Run      │
│  ┌─────────┐ ┌─────────┐ ┌────────┐│
│  │  API    │ │  API    │ │  API   ││
│  │Instance1│ │Instance2│ │Instance││
│  └────┬────┘ └────┬────┘ └───┬────┘│
│       └───────────┴──────────┘      │
│                   │                 │
│       ┌───────────▼───────────┐     │
│       │    RDS / Cloud SQL    │     │
│       │    (PostgreSQL)       │     │
│       └───────────────────────┘     │
└─────────────────────────────────────┘
```

## 📊 Scalability Considerations

### Current Capacity
- **Data:** 13,439 cards, 91 expansions
- **Database Size:** ~5 MB SQLite
- **Memory Usage:** ~50-100 MB
- **Concurrent Users:** 100+ (Gin default)

### Scale Up Strategies

#### 1. Database Scaling (When >100k cards)
```
SQLite → PostgreSQL
```
- Change `database.NewDB()` to use PostgreSQL driver
- Update queries (minimal changes needed)
- Use connection pooling

#### 2. Caching Layer
```
┌─────────┐     ┌─────────┐     ┌─────────┐
│  Client │────▶│  Redis  │────▶│   API   │
└─────────┘     │  Cache  │     └─────────┘
                └─────────┘
```
- Cache card searches (TTL: 1 hour)
- Cache price data (TTL: 15 minutes)
- Cache AI responses (TTL: 24 hours)

#### 3. Read Replicas
```
┌─────────┐     ┌─────────────┐
│   API   │────▶│  Primary DB │
│  Server │     │   (Write)   │
└────┬────┘     └─────────────┘
     │
     └──────────▶┌─────────────┐
                 │  Replica DB │
                 │   (Read)    │
                 └─────────────┘
```

## 🔒 Security Architecture

### Current
```
┌─────────────┐
│   HTTPS     │ (via reverse proxy nginx/traefik)
├─────────────┤
│   CORS      │ (configured in main.go)
├─────────────┤
│   Rate      │ (Gin middleware - future)
│   Limiting  │
├─────────────┤
│   Input     │ (Gin binding validation)
│ Validation  │
└─────────────┘
```

### Future: Authentication
```
┌─────────────┐
│   JWT       │
│   Auth      │
├─────────────┤
│   API       │
│   Key       │
├─────────────┤
│   Role      │
│   Based     │
│   Access    │
└─────────────┘
```

## 🧪 Testing Strategy

```
┌─────────────────────────────────────┐
│           Test Pyramid              │
├─────────────────────────────────────┤
│  E2E Tests (few)                    │
│  └─ API integration tests           │
├─────────────────────────────────────┤
│  Integration Tests (some)           │
│  └─ Service + Repository tests      │
├─────────────────────────────────────┤
│  Unit Tests (many)                  │
│  └─ Service logic, utilities        │
└─────────────────────────────────────┘
```

### Test Structure
```
internal/
├── handlers/
│   └── card_handler_test.go    # HTTP tests
├── services/
│   └── card_service_test.go    # Business logic tests
└── database/
    └── queries_test.go         # Repository tests
```

## 🛠️ Technology Stack

| Layer | Technology | Reason |
|-------|------------|--------|
| **Language** | Go 1.21 | Performance, simplicity |
| **Framework** | Gin | Fast, popular, middleware support |
| **Database** | SQLite | Zero-config, embedded |
| **AI** | OpenRouter | Multiple LLM options, free tier |
| **JSON** | encoding/json | Standard library |
| **UUID** | google/uuid | Standard UUID generation |
| **Config** | godotenv | Environment variables |

## 📈 Performance Benchmarks

### Expected Performance
| Operation | Latency | Throughput |
|-----------|---------|------------|
| Card Search | ~10ms | 1000 req/s |
| Get Card by ID | ~5ms | 2000 req/s |
| AI Deck Build | ~2s | 30 req/min |
| Battle Simulate | ~20ms | 500 req/s |

### Optimization Strategies
1. **Database Indexes** ✅ (sudah dibuat)
2. **Connection Pooling** (default SQLite)
3. **JSONB for complex data** (attacks, abilities)
4. **Lazy loading** (relations loaded on demand)

## 🔄 CI/CD Pipeline (Future)

```yaml
# .github/workflows/ci.yml
name: CI/CD
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-go@v4
      - run: go test ./...
      - run: go build -o api ./cmd/api
      
  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - run: scp api user@server:/app/
      - run: ssh user@server "systemctl restart pokemon-api"
```

## ✅ Architecture Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| **Architecture** | Monolithic | Simple, data size manageable |
| **Database** | SQLite | Zero-config, portable |
| **API Style** | REST | Simple, widely supported |
| **AI Provider** | OpenRouter | Free tier, multiple models |
| **Auth** | None (current) | Public API, no sensitive data |
| **Caching** | None (current) | Data size small, read fast enough |

## 🎯 Future Improvements

1. **Redis Caching** - Cache popular searches
2. **PostgreSQL** - When data grows >100k records
3. **GraphQL** - Flexible queries for mobile apps
4. **WebSocket** - Real-time price updates
5. **Kubernetes** - Auto-scaling untuk high traffic

## 📚 Referensi

- [Clean Architecture - Uncle Bob](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- [Go Project Layout](https://github.com/golang-standards/project-layout)
- [Gin Framework Best Practices](https://gin-gonic.com/docs/)
