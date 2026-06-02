package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// RateLimiter defines the interface for rate limiting
type RateLimiter interface {
	Allow(key string) bool
	Reset(key string)
}

// MemoryRateLimiter implements in-memory rate limiting
type MemoryRateLimiter struct {
	requests map[string][]time.Time
	limit    int
	window   time.Duration
	mu       sync.RWMutex
}

// NewMemoryRateLimiter creates a new in-memory rate limiter
func NewMemoryRateLimiter(limit int, window time.Duration) *MemoryRateLimiter {
	return &MemoryRateLimiter{
		requests: make(map[string][]time.Time),
		limit:    limit,
		window:   window,
	}
}

// Allow checks if a request is allowed
func (r *MemoryRateLimiter) Allow(key string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()

	now := time.Now()
	cutoff := now.Add(-r.window)

	// Get existing requests and filter out old ones
	requests := r.requests[key]
	var valid []time.Time
	for _, req := range requests {
		if req.After(cutoff) {
			valid = append(valid, req)
		}
	}

	// Check if limit exceeded
	if len(valid) >= r.limit {
		r.requests[key] = valid
		return false
	}

	// Add new request
	valid = append(valid, now)
	r.requests[key] = valid
	return true
}

// Reset clears the rate limit for a key
func (r *MemoryRateLimiter) Reset(key string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.requests, key)
}

// Cleanup removes old entries periodically
func (r *MemoryRateLimiter) Cleanup() {
	r.mu.Lock()
	defer r.mu.Unlock()

	now := time.Now()
	cutoff := now.Add(-r.window)

	for key, requests := range r.requests {
		var valid []time.Time
		for _, req := range requests {
			if req.After(cutoff) {
				valid = append(valid, req)
			}
		}
		if len(valid) == 0 {
			delete(r.requests, key)
		} else {
			r.requests[key] = valid
		}
	}
}

// StartCleanup starts the cleanup goroutine
func (r *MemoryRateLimiter) StartCleanup(interval time.Duration) {
	ticker := time.NewTicker(interval)
	go func() {
		for range ticker.C {
			r.Cleanup()
		}
	}()
}

// RateLimitConfig holds configuration for rate limiting
type RateLimitConfig struct {
	Limit           int
	Window          time.Duration
	KeyFunc         func(*gin.Context) string
	SkipSuccessful  bool
	SkipFailed      bool
}

// DefaultRateLimitConfig returns default config
func DefaultRateLimitConfig() RateLimitConfig {
	return RateLimitConfig{
		Limit:  100,             // 100 requests
		Window: time.Minute,     // per minute
		KeyFunc: func(c *gin.Context) string {
			// Use IP address as key
			return c.ClientIP()
		},
	}
}

// AuthRateLimitConfig returns stricter config for auth endpoints
func AuthRateLimitConfig() RateLimitConfig {
	return RateLimitConfig{
		Limit:  5,               // 5 requests
		Window: time.Minute,     // per minute
		KeyFunc: func(c *gin.Context) string {
			return c.ClientIP()
		},
	}
}

// RateLimitMiddleware creates a rate limiting middleware
func RateLimitMiddleware(limiter RateLimiter, config RateLimitConfig) gin.HandlerFunc {
	return func(c *gin.Context) {
		key := config.KeyFunc(c)

		if !limiter.Allow(key) {
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error": "Rate limit exceeded",
				"retry_after": config.Window.Seconds(),
			})
			c.Abort()
			return
		}

		c.Next()
	}
}

// RateLimitByUserID uses user ID for rate limiting (for authenticated endpoints)
func RateLimitByUserID(limiter RateLimiter, limit int, window time.Duration) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, exists := GetUserID(c)
		if !exists {
			c.Next()
			return
		}

		config := RateLimitConfig{
			Limit:  limit,
			Window: window,
			KeyFunc: func(c *gin.Context) string {
				return userID
			},
		}

		RateLimitMiddleware(limiter, config)(c)
	}
}
