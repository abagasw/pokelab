# Ringkasan Arsitektur Pokemon TCG Indonesia API

## 🎯 Arsitektur yang Digunakan

### **Monolithic Layered Architecture** dengan **Clean Architecture Principles**

```
┌─────────────────────────────────────────────────────────────┐
│                    CURRENT ARCHITECTURE                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │    HTTP      │  │    JSON      │  │   REST API   │     │
│  │   (Gin)      │  │  Response    │  │   (Gin)      │     │
│  └──────┬───────┘  └──────────────┘  └──────────────┘     │
│         │                                                   │
│  ┌──────▼───────────────────────────────────────────┐      │
│  │              PRESENTATION LAYER                   │      │
│  │     card_handler.go, deck_handler.go, etc       │      │
│  └──────┬───────────────────────────────────────────┘      │
│         │                                                   │
│  ┌──────▼───────────────────────────────────────────┐      │
│  │              BUSINESS LAYER                       │      │
│  │   card_service.go, ai_service.go, etc           │      │
│  │   • Business Logic                               │      │
│  │   • AI Integration (OpenRouter)                  │      │
│  │   • Price Calculation                            │      │
│  └──────┬───────────────────────────────────────────┘      │
│         │                                                   │
│  ┌──────▼───────────────────────────────────────────┐      │
│  │              DATA LAYER                           │      │
│  │     queries.go, init.go                          │      │
│  │   • SQL Queries                                  │      │
│  │   • Repository Pattern                           │      │
│  └──────┬───────────────────────────────────────────┘      │
│         │                                                   │
│  ┌──────▼───────────────────────────────────────────┐      │
│  │           INFRASTRUCTURE                          │      │
│  │     SQLite Database (pokemon_tcg.db)             │      │
│  │     13,439 Cards | 91 Expansions | 593 Prices    │      │
│  └───────────────────────────────────────────────────┘      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 📊 Perbandingan Arsitektur

| Aspek | Pilihan | Alternatif | Alasan Pilihan |
|-------|---------|------------|----------------|
| **Pattern** | Monolithic | Microservices | Data kecil (13k cards), simple deploy |
| **Database** | SQLite | PostgreSQL | Zero config, portable, cukup untuk data size |
| **API** | REST | GraphQL | Simple, widely supported, caching mudah |
| **Framework** | Gin | Echo/Fiber | Populer, middleware rich, dokumentasi bagus |
| **AI** | OpenRouter | OpenAI Direct | Free tier, multiple models, no single vendor lock |
| **Auth** | None | JWT/OAuth2 | Public API, no sensitive data (saat ini) |

## 🏗️ Layer Breakdown

### 1. Presentation Layer (Handlers)
```go
// Tanggung jawab:
// - HTTP request/response
// - Input validation
// - JSON serialization
// - Error HTTP status codes

handlers/
├── card_handler.go       # GET /api/v1/cards, GET /api/v1/cards/:id
├── deck_handler.go       # POST /api/v1/decks/build
├── battle_handler.go     # POST /api/v1/battle/simulate
├── price_handler.go      # GET /api/v1/prices/arbitrage
├── collection_handler.go # CRUD collections
└── meta_handler.go       # GET /api/v1/meta/overview
```

**Rules:**
- ❌ No business logic
- ✅ Call services only
- ✅ Handle HTTP-specific concerns (status codes, headers)

### 2. Business Layer (Services)
```go
// Tanggung jawab:
// - Business logic
// - AI integration
// - Data transformation
// - External API calls

services/
├── card_service.go       # Search, explain card (AI)
├── deck_service.go       # Build deck (AI), analyze meta
├── battle_service.go     # Simulate battle, type advantage
├── price_service.go      # Arbitrage calculation
├── collection_service.go # Collection management
└── ai_service.go         # OpenRouter integration
```

**Rules:**
- ❌ No HTTP-specific code
- ❌ No raw SQL (use repository)
- ✅ Pure business logic
- ✅ Reusable across different interfaces (HTTP, CLI, etc)

### 3. Data Layer (Repository)
```go
// Tanggung jawab:
// - Database queries
// - Data persistence
// - Transaction management

database/
├── init.go              # Schema creation, migrations
└── queries.go           # SQL queries:
                        # - SearchCards()
                        # - GetCardByID()
                        # - GetPriceArbitrage()
```

**Rules:**
- ❌ No business logic
- ✅ SQL queries only
- ✅ Return domain models

## 📦 Data Flow Example

### Scenario: User searches for "Pikachu"

```
1. HTTP Request
   GET /api/v1/cards?name=Pikachu
        │
        ▼
2. Handler (card_handler.go)
   • Parse query param "name"
   • Call cardService.SearchCards()
        │
        ▼
3. Service (card_service.go)
   • Build search filter
   • Call db.SearchCards(filter)
   • Format response
        │
        ▼
4. Repository (database/queries.go)
   • Execute SQL: SELECT ... WHERE name LIKE '%Pikachu%'
   • Return []Card
        │
        ▼
5. Database (SQLite)
   • Query pokemon_tcg.db
   • Return rows
        │
        ▼
6. Response Chain
   Repository → Service → Handler
        │
        ▼
7. HTTP Response
   {
     "cards": [...],
     "total": 15
   }
```

## 🔌 Dependency Injection

```go
// main.go - Wiring dependencies
func main() {
    // Infrastructure
    db, _ := database.NewDB("pokemon_tcg.db")
    
    // Services (injected with dependencies)
    aiService := services.NewAIService(apiKey)
    cardService := services.NewCardService(db, aiService)
    
    // Handlers (injected with services)
    cardHandler := handlers.NewCardHandler(cardService)
    
    // Router
    router.GET("/cards", cardHandler.SearchCards)
}
```

**Benefits:**
- ✅ Easy to test (mock dependencies)
- ✅ Clear dependency graph
- ✅ Flexible configuration

## 🗄️ Database Design

### Schema Diagram

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   expansions    │     │     cards       │     │  card_prices    │
├─────────────────┤     ├─────────────────┤     ├─────────────────┤
│ id (PK)         │◄────┤ expansion_code  │     │ id (PK)         │
│ code (unique)   │     │ id (PK)         │◄────┤ card_id (FK)    │
│ name_id         │     │ name_id         │     │ source          │
│ name_en         │     │ name_en         │     │ price_idr       │
│ total_cards     │     │ category        │     │ price_usd       │
│ released_at     │     │ hp              │     │ condition       │
└─────────────────┘     │ card_type       │     └─────────────────┘
                        │ attacks (JSON)  │
                        │ abilities (JSON)│
                        └─────────────────┘

┌─────────────────┐     ┌─────────────────┐
│     decks       │     │  tournaments    │
├─────────────────┤     ├─────────────────┤
│ id (PK)         │     │ id (PK)         │
│ name            │     │ name            │
│ format          │     │ date            │
│ category        │     │ location        │
│ tournament_count│     │ player_count    │
└─────────────────┘     └─────────────────┘
```

## 🚀 Deployment Options

### Option 1: Single Binary (Recommended)
```bash
# Build
GOOS=linux GOARCH=amd64 go build -o api ./cmd/api

# Deploy
scp api server:/opt/pokemon/
ssh server "systemctl restart pokemon-api"
```

**Best for:**
- Solo developer
- Small team
- Low traffic (<10k requests/day)

### Option 2: Docker
```bash
docker build -t pokemon-api .
docker run -p 8080:8080 -v ./data:/app/data pokemon-api
```

**Best for:**
- Consistent environments
- Easy scaling
- CI/CD integration

### Option 3: Cloud (Future)
```
AWS/GCP/Azure
├── Compute: EC2 / Cloud Run / App Service
├── Database: RDS PostgreSQL (when scaling)
└── Cache: Redis (optional)
```

## 📈 Scaling Roadmap

### Phase 1: Current (Monolithic)
- ✅ SQLite database
- ✅ Single binary
- ✅ ~13k cards
- ✅ 100+ concurrent users

### Phase 2: Growth (10x traffic)
- [ ] Add Redis caching
- [ ] Read replicas
- [ ] CDN for images

### Phase 3: Scale (100x traffic)
- [ ] PostgreSQL migration
- [ ] Horizontal scaling (multiple instances)
- [ ] Load balancer

### Phase 4: Enterprise
- [ ] Microservices (if needed)
- [ ] Kubernetes
- [ ] Distributed tracing

## ✅ Architecture Checklist

| Kriteria | Status | Notes |
|----------|--------|-------|
| **Separation of Concerns** | ✅ | Clear layer separation |
| **Testability** | ✅ | DI enables mocking |
| **Scalability** | ✅ | Can scale to 100k+ cards |
| **Maintainability** | ✅ | Clean code structure |
| **Performance** | ✅ | SQLite < 10ms queries |
| **Security** | ⚠️ | Add rate limiting, auth later |
| **Observability** | ⚠️ | Add logging, metrics |

## 🎯 Key Decisions Summary

1. **Why Monolithic?**
   - Data size manageable (13k cards = 5MB)
   - Simple deployment
   - Easy to understand

2. **Why SQLite?**
   - No database server needed
   - Single file = easy backup
   - Surprisingly fast for read-heavy workloads
   - Can migrate to PostgreSQL later

3. **Why Clean Architecture?**
   - Business logic isolated
   - Easy to test
   - Can change database/HTTP framework later

4. **Why Go?**
   - Fast performance
   - Single binary deployment
   - Great for APIs
   - Standard library rich

## 📚 Resources

- [Clean Architecture - Uncle Bob](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- [Go Project Layout](https://github.com/golang-standards/project-layout)
- [Gin Documentation](https://gin-gonic.com/docs/)
- [SQLite Best Practices](https://www.sqlite.org/queryplanner.html)
