# Pokemon TCG Indonesia - Master Makefile
.PHONY: all backend frontend setup dev build test clean docker-up docker-down

# Default target
all: setup

# =============================================================================
# Setup
# =============================================================================

setup: setup-backend setup-frontend
	@echo "✅ Setup complete!"

setup-backend:
	@echo "Setting up backend..."
	cd backend-go && go mod download
	cd backend-go && go build -o build/pokemon-tcg-api ./cmd/api
	cd backend-go && go build -o build/import-data ./cmd/import

setup-frontend:
	@echo "Setting up frontend..."
	cd frontend-astro && npm install

# =============================================================================
# Development
# =============================================================================

dev-backend:
	cd backend-go && ./build/pokemon-tcg-api

dev-frontend:
	cd frontend-astro && npm run dev

dev:
	@echo "Starting development servers..."
	@echo "Backend: http://localhost:8080"
	@echo "Frontend: http://localhost:3000"
	@make -j2 dev-backend dev-frontend

# =============================================================================
# Docker (Full Stack)
# =============================================================================

docker-up:
	@echo "Starting all services with Docker..."
	docker-compose -f backend-go/docker-compose.yml up -d
	@echo "Services started:"
	@echo "  API: http://localhost:8080"
	@echo "  Redis: localhost:6379"
	@echo "  Redis Commander: http://localhost:8081"

docker-down:
	docker-compose -f backend-go/docker-compose.yml down

docker-logs:
	docker-compose -f backend-go/docker-compose.yml logs -f

docker-build:
	docker-compose -f backend-go/docker-compose.yml build

# =============================================================================
# Database
# =============================================================================

import-data:
	cd backend-go && ./build/import-data ../data

db-reset:
	cd backend-go && rm -f pokemon_tcg.db && ./build/import-data ../data

redis-flush:
	docker exec pokemon-redis redis-cli FLUSHDB || redis-cli FLUSHDB

# =============================================================================
# Build
# =============================================================================

build-backend:
	cd backend-go && go build -o build/pokemon-tcg-api ./cmd/api

build-frontend:
	cd frontend-astro && npm run build

build: build-backend build-frontend

# =============================================================================
# Test
# =============================================================================

test-backend:
	cd backend-go && go test ./...

test-frontend:
	cd frontend-astro && npm run test

test: test-backend test-frontend

# =============================================================================
# Lint & Format
# =============================================================================

lint-backend:
	cd backend-go && go vet ./...
	cd backend-go && if command -v golangci-lint >/dev/null; then golangci-lint run; fi

lint-frontend:
	cd frontend-astro && npm run lint

format-backend:
	cd backend-go && go fmt ./...

format-frontend:
	cd frontend-astro && npm run format

lint: lint-backend lint-frontend
format: format-backend format-frontend

# =============================================================================
# Clean
# =============================================================================

clean-backend:
	cd backend-go && rm -rf build/ && rm -f pokemon_tcg.db

clean-frontend:
	cd frontend-astro && rm -rf dist/ node_modules/.cache/

clean: clean-backend clean-frontend

clean-all: clean
	cd backend-go && rm -rf vendor/
	cd frontend-astro && rm -rf node_modules/

# =============================================================================
# Utilities
# =============================================================================

health-check:
	@curl -s http://localhost:8080/api/v1/health | jq . || curl -s http://localhost:8080/api/v1/health

api-docs:
	@echo "API Endpoints:"
	@echo "  GET  /api/v1/health"
	@echo "  GET  /api/v1/cards"
	@echo "  GET  /api/v1/cards/:id"
	@echo "  GET  /api/v1/expansions"
	@echo "  GET  /api/v1/decks"
	@echo "  POST /api/v1/decks/build"
	@echo "  GET  /api/v1/prices/arbitrage"
	@echo "  POST /api/v1/battle/simulate"
	@echo "  GET  /api/v1/meta/overview"

# =============================================================================
# Help
# =============================================================================

help:
	@echo "Pokemon TCG Indonesia - Available Commands"
	@echo ""
	@echo "Setup:"
	@echo "  make setup          Setup both backend and frontend"
	@echo "  make setup-backend  Setup Go backend"
	@echo "  make setup-frontend Setup Astro frontend"
	@echo ""
	@echo "Development:"
	@echo "  make dev            Start all dev servers"
	@echo "  make dev-backend    Start backend server only"
	@echo "  make dev-frontend   Start frontend server only"
	@echo ""
	@echo "Docker:"
	@echo "  make docker-up      Start all services (API + Redis)"
	@echo "  make docker-down    Stop all services"
	@echo "  make docker-logs    View service logs"
	@echo ""
	@echo "Database:"
	@echo "  make import-data    Import data to SQLite"
	@echo "  make db-reset       Reset and reimport database"
	@echo "  make redis-flush    Clear Redis cache"
	@echo ""
	@echo "Build:"
	@echo "  make build          Build both backend and frontend"
	@echo "  make build-backend  Build Go binary"
	@echo "  make build-frontend Build Astro static files"
	@echo ""
	@echo "Quality:"
	@echo "  make test           Run all tests"
	@echo "  make lint           Run linters"
	@echo "  make format         Format code"
	@echo ""
	@echo "Clean:"
	@echo "  make clean          Clean build artifacts"
	@echo "  make clean-all      Clean everything including vendor/node_modules"
