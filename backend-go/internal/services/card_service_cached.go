package services

import (
	"context"
	"database/sql"
	"fmt"
	"pokemon-tcg-indonesia/internal/cache"
	"pokemon-tcg-indonesia/internal/models"
)

// CachedCardService extends CardService with Redis caching
type CachedCardService struct {
	*CardService
	redis *cache.RedisClient
}

// NewCachedCardService creates a new cached card service
func NewCachedCardService(db *sql.DB, aiService *AIService, redis *cache.RedisClient) *CachedCardService {
	return &CachedCardService{
		CardService: NewCardService(db, aiService),
		redis:       redis,
	}
}

// GetCardByID gets card by ID with caching
func (s *CachedCardService) GetCardByID(ctx context.Context, id string) (*models.Card, error) {
	if s.redis == nil {
		return s.CardService.GetCardByID(ctx, id)
	}

	var card models.Card
	key := fmt.Sprintf(cache.KeyCardByID, id)

	// Try cache first
	if err := s.redis.Get(key, &card); err == nil {
		return &card, nil
	}

	// Cache miss, fetch from DB
	cardPtr, err := s.CardService.GetCardByID(ctx, id)
	if err != nil {
		return nil, err
	}

	// Store in cache
	if err := s.redis.Set(key, cardPtr, cache.TTLMedium); err != nil {
		// Log error but don't fail
	}

	return cardPtr, nil
}

// SearchCards searches cards with caching
func (s *CachedCardService) SearchCards(ctx context.Context, req models.CardSearchRequest) (*models.CardSearchResponse, error) {
	if s.redis == nil {
		return s.CardService.SearchCards(ctx, req)
	}

	var response models.CardSearchResponse
	cacheKey := fmt.Sprintf(cache.KeyCardSearch, 
		req.Query+req.ExpansionCode+req.CardType+req.RegulationMark+req.Rarity,
		req.Page, req.Limit)

	// Try cache first
	if err := s.redis.Get(cacheKey, &response); err == nil {
		return &response, nil
	}

	// Cache miss
	resp, err := s.CardService.SearchCards(ctx, req)
	if err != nil {
		return nil, err
	}

	// Store in cache
	if err := s.redis.Set(cacheKey, resp, cache.TTLShort); err != nil {
		// Log error but don't fail
	}

	return resp, nil
}

// GetExpansions gets expansions with caching
func (s *CachedCardService) GetExpansions(ctx context.Context) ([]models.Expansion, error) {
	if s.redis == nil {
		return s.CardService.GetExpansions(ctx)
	}

	var expansions []models.Expansion
	
	// Try cache first
	if err := s.redis.Get(cache.KeyExpansionsList, &expansions); err == nil {
		return expansions, nil
	}

	// Cache miss
	exps, err := s.CardService.GetExpansions(ctx)
	if err != nil {
		return nil, err
	}

	// Store in cache
	if err := s.redis.Set(cache.KeyExpansionsList, exps, cache.TTLLong); err != nil {
		// Log error but don't fail
	}

	return exps, nil
}

// InvalidateCardCache invalidates card-related cache
func (s *CachedCardService) InvalidateCardCache(cardID string) {
	if s.redis == nil {
		return
	}

	// Delete specific card cache
	s.redis.Delete(fmt.Sprintf(cache.KeyCardByID, cardID))

	// Delete search caches
	s.redis.DeletePattern(cache.KeyPrefixSearch + "*")
}

// InvalidateExpansionCache invalidates expansion cache
func (s *CachedCardService) InvalidateExpansionCache() {
	if s.redis == nil {
		return
	}

	s.redis.Delete(cache.KeyExpansionsList)
	s.redis.DeletePattern(cache.KeyPrefixCards + "exp:*")
}

// ExplainCard explains card with caching
func (s *CachedCardService) ExplainCard(ctx context.Context, cardID string) (string, error) {
	if s.redis == nil {
		return s.CardService.ExplainCard(ctx, cardID)
	}

	cacheKey := "ai:explain:" + cardID
	var explanation string

	// Try cache first
	if err := s.redis.Get(cacheKey, &explanation); err == nil {
		return explanation, nil
	}

	// Cache miss
	exp, err := s.CardService.ExplainCard(ctx, cardID)
	if err != nil {
		return "", err
	}

	// Store in cache
	if err := s.redis.Set(cacheKey, exp, cache.TTLVeryLong); err != nil {
		// Log error but don't fail
	}

	return exp, nil
}
