package config

import (
	"os"
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
}

// Load loads configuration from environment variables
func Load() *Config {
	return &Config{
		DatabaseURL:      getEnv("DATABASE_URL", ""),
		DBPath:           getEnv("DB_PATH", "pokemon_tcg.db"),
		RedisURL:         getEnv("REDIS_URL", ""),
		OpenRouterAPIKey: getEnv("OPENROUTER_API_KEY", ""),
		OpenRouterModel:  getEnv("OPENROUTER_MODEL", "meta-llama/llama-3.3-70b-instruct:free"),
		JWTSecret:        getEnv("JWT_SECRET", "your-secret-key"),
		Port:             getEnv("PORT", "8080"),
		Environment:      getEnv("ENV", "development"),
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
