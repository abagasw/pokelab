package cache

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/redis/go-redis/v9"
)

// RedisClient wraps redis client with caching methods
type RedisClient struct {
	client *redis.Client
	ctx    context.Context
}

// NewRedisClient creates a new Redis client
func NewRedisClient(redisURL string) (*RedisClient, error) {
	if redisURL == "" {
		redisURL = "localhost:6379"
	}

	client := redis.NewClient(&redis.Options{
		Addr:     redisURL,
		Password: "", // no password set
		DB:       0,  // use default DB
	})

	ctx := context.Background()

	// Test connection
	if err := client.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("failed to connect to Redis: %w", err)
	}

	log.Println("Connected to Redis")

	return &RedisClient{
		client: client,
		ctx:    ctx,
	}, nil
}

// Close closes the Redis connection
func (r *RedisClient) Close() error {
	return r.client.Close()
}

// Get retrieves a value from cache
func (r *RedisClient) Get(key string, dest interface{}) error {
	data, err := r.client.Get(r.ctx, key).Bytes()
	if err == redis.Nil {
		return fmt.Errorf("cache miss")
	}
	if err != nil {
		return err
	}

	return json.Unmarshal(data, dest)
}

// Set stores a value in cache with TTL
func (r *RedisClient) Set(key string, value interface{}, ttl time.Duration) error {
	data, err := json.Marshal(value)
	if err != nil {
		return err
	}

	return r.client.Set(r.ctx, key, data, ttl).Err()
}

// Delete removes a key from cache
func (r *RedisClient) Delete(key string) error {
	return r.client.Del(r.ctx, key).Err()
}

// DeletePattern removes keys matching a pattern
func (r *RedisClient) DeletePattern(pattern string) error {
	keys, err := r.client.Keys(r.ctx, pattern).Result()
	if err != nil {
		return err
	}

	if len(keys) > 0 {
		return r.client.Del(r.ctx, keys...).Err()
	}

	return nil
}

// Exists checks if a key exists
func (r *RedisClient) Exists(key string) bool {
	n, err := r.client.Exists(r.ctx, key).Result()
	return err == nil && n > 0
}

// GetOrSet gets value from cache or sets it using the provided function
func (r *RedisClient) GetOrSet(key string, dest interface{}, ttl time.Duration, fn func() (interface{}, error)) error {
	// Try to get from cache
	if err := r.Get(key, dest); err == nil {
		return nil
	}

	// Cache miss, execute function
	data, err := fn()
	if err != nil {
		return err
	}

	// Store in cache
	if err := r.Set(key, data, ttl); err != nil {
		log.Printf("Failed to set cache: %v", err)
	}

	// Copy data to dest
	jsonData, _ := json.Marshal(data)
	return json.Unmarshal(jsonData, dest)
}

// Cache Keys
const (
	KeyPrefixCards      = "cards:"
	KeyPrefixExpansions = "expansions:"
	KeyPrefixDecks      = "decks:"
	KeyPrefixPrices     = "prices:"
	KeyPrefixMeta       = "meta:"
	KeyPrefixSearch     = "search:"
	KeyCardByID         = KeyPrefixCards + "id:%s"
	KeyCardsByExpansion = KeyPrefixCards + "exp:%s:page:%d:limit:%d"
	KeyCardSearch       = KeyPrefixSearch + "%s:page:%d:limit:%d"
	KeyExpansionsList   = KeyPrefixExpansions + "list"
	KeyArbitrageOpps    = KeyPrefixPrices + "arbitrage:%f:%d"
	KeyDecksList        = KeyPrefixDecks + "list:%s:%d:%d"
	KeyMetaOverview     = KeyPrefixMeta + "overview"
)

// TTL constants
const (
	TTLShort    = 5 * time.Minute
	TTLMedium   = 15 * time.Minute
	TTLLong     = 1 * time.Hour
	TTLVeryLong = 24 * time.Hour
)
