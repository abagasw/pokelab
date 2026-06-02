# Arsitektur Quick Reference

## 🎯 Pattern: Monolithic Layered Architecture

```
Request → Router → Handler → Service → Repository → Database
```

## 📂 Layer Structure

| Layer | Folder | Responsibility | Example Files |
|-------|--------|----------------|---------------|
| **Presentation** | `handlers/` | HTTP, JSON, Validation | `card_handler.go` |
| **Business** | `services/` | Logic, AI, Calculation | `card_service.go` |
| **Data** | `database/` | SQL, Queries | `queries.go` |
| **Domain** | `models/` | Entities, DTOs | `card.go` |

## 🔄 Data Flow

```
1. Client ──HTTP──▶ Router
2. Router ────────▶ Handler (validate)
3. Handler ───────▶ Service (business logic)
4. Service ───────▶ Repository (SQL)
5. Repository ────▶ Database
6. Response ◀────── Back up the chain
```

## 💉 Dependency Injection

```go
// Infrastructure
db, _ := database.NewDB("pokemon_tcg.db")

// Services (depend on infrastructure)
aiService := services.NewAIService(apiKey)
cardService := services.NewCardService(db, aiService)

// Handlers (depend on services)
cardHandler := handlers.NewCardHandler(cardService)

// Router (depend on handlers)
r.GET("/cards", cardHandler.SearchCards)
```

## 🗄️ Database

```
SQLite (Embedded)
├── Size: ~5 MB (13k cards)
├── Location: pokemon_tcg.db
└── Tables: cards, expansions, decks, tournaments, card_prices
```

## 🧠 AI Integration

```
Business Layer (Service)
    │
    ▼
AIService ──▶ OpenRouter API
    │
    ▼
Free tier: 20-60 req/min
Model: meta-llama/llama-3.3-70b-instruct:free
```

## 🚀 Deployment

### Current: Single Binary
```bash
# Build
go build -o api ./cmd/api

# Run
./api
# Server: http://localhost:8080
```

### Future Options
- Docker container
- Kubernetes (if microservices needed)
- Cloud Run / Lambda

## ✅ Architecture Checklist

- [x] Separation of Concerns
- [x] Dependency Injection
- [x] Repository Pattern
- [x] Testable (mockable)
- [x] Scalable (can handle 100k+ cards)
- [ ] Redis caching (future)
- [ ] PostgreSQL migration (future)
- [ ] Authentication (future)

## 📊 Performance

| Operation | Latency |
|-----------|---------|
| Card Search | ~10ms |
| Get Card by ID | ~5ms |
| AI Deck Build | ~2s |
| Battle Simulate | ~20ms |

## 🔑 Key Decisions

1. **Monolithic** (not Microservices)
   - Data size small (13k cards)
   - Simple deployment
   - Single codebase

2. **SQLite** (not PostgreSQL)
   - Zero configuration
   - Portable (single file)
   - Fast enough for current size
   - Easy migration later if needed

3. **Clean Architecture**
   - Business logic isolated
   - Easy to test
   - Framework agnostic

## 🆘 When to Scale

| Metric | Current | Scale When |
|--------|---------|------------|
| Cards | 13k | > 100k → PostgreSQL |
| Traffic | Low | > 10k req/day → Redis |
| Users | Single | > 100 concurrent → Horizontal |
| Team | 1-2 | > 5 people → Microservices |

## 📚 Quick Links

- [Full Architecture Doc](ARCHITECTURE.md)
- [Architecture Summary](ARCHITECTURE_SUMMARY.md)
- [Diagrams](docs/)
- [API Docs](api/README.md)
- [Import Guide](IMPORT.md)
