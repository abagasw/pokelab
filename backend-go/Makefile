.PHONY: all build run test clean import deps

# Binary name
BINARY=pokemon-tcg-api

# Build directory
BUILD_DIR=./build

# Data directory
DATA_DIR=../data

all: deps build

deps:
	@echo "Installing dependencies..."
	go mod tidy
	go mod download

build:
	@echo "Building..."
	@mkdir -p $(BUILD_DIR)
	go build -o $(BUILD_DIR)/$(BINARY) ./cmd/api

run: build
	@echo "Running server..."
	$(BUILD_DIR)/$(BINARY)

dev:
	@echo "Running in development mode..."
	go run ./cmd/api

import:
	@echo "Importing data..."
	go run ./cmd/import $(DATA_DIR)

test:
	@echo "Running tests..."
	go test -v ./...

clean:
	@echo "Cleaning..."
	rm -rf $(BUILD_DIR)
	rm -f *.db

# Docker commands
docker-build:
	docker build -t pokemon-tcg-api .

docker-run:
	docker run -p 8080:8080 -v $(PWD)/data:/app/data pokemon-tcg-api

# Help
help:
	@echo "Available targets:"
	@echo "  make deps      - Install dependencies"
	@echo "  make build     - Build the binary"
	@echo "  make run       - Build and run the server"
	@echo "  make dev       - Run in development mode"
	@echo "  make import    - Import data from JSON files"
	@echo "  make test      - Run tests"
	@echo "  make clean     - Clean build artifacts"
	@echo "  make docker-build - Build Docker image"
	@echo "  make docker-run   - Run Docker container"
