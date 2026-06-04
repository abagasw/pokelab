package config

import (
	"os"
	"strconv"
)

// Config holds application configuration
type Config struct {
	DatabaseURL      string
	DBPath           string
	RedisURL         string
	OpenRouterAPIKey string
	OpenRouterModel  string
	JWTSecret        string
	Port             string
	Environment      string
	MLServiceURL     string
	ExchangeRate     float64
	AllowedOrigins   string
}

// Load loads configuration from environment variables
func Load() *Config {
	return &Config{
		DatabaseURL:      getEnv("DATABASE_URL", ""),
		DBPath:           getEnv("DB_PATH", "pokemon_tcg.db"),
		RedisURL:         getEnv("REDIS_URL", ""),
		OpenRouterAPIKey: getEnv("OPENROUTER_API_KEY", ""),
		OpenRouterModel:  getEnv("OPENROUTER_MODEL", "meta-llama/llama-3.3-70b-instruct:free"),
		JWTSecret:        getEnv("JWT_SECRET", ""),
		Port:             getEnv("PORT", "8080"),
		Environment:      getEnv("ENV", "development"),
		MLServiceURL:     getEnv("ML_SERVICE_URL", "http://localhost:8081"),
		ExchangeRate:     getEnvFloat("EXCHANGE_RATE", 16400),
		AllowedOrigins:   getEnv("ALLOWED_ORIGINS", ""),
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvFloat(key string, defaultValue float64) float64 {
	if value := os.Getenv(key); value != "" {
		if f, err := strconv.ParseFloat(value, 64); err == nil {
			return f
		}
	}
	return defaultValue
}
