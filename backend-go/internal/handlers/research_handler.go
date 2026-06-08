package handlers

import (
	"database/sql"
	"net/http"
	"pokemon-tcg-indonesia/internal/middleware"
	"pokemon-tcg-indonesia/internal/services"
	"strconv"

	"github.com/gin-gonic/gin"
)

// ResearchHandler handles PokeLab ID research requests.
type ResearchHandler struct {
	researchService *services.ResearchService
	deckGenerator   *services.DeckGenerator
	ragService      *services.RAGService
	deckAnalyzer    *services.DeckAnalyzer
}

// NewResearchHandler creates a new ResearchHandler.
func NewResearchHandler(researchService *services.ResearchService, deckGenerator *services.DeckGenerator, ragService *services.RAGService) *ResearchHandler {
	return &ResearchHandler{researchService: researchService, deckGenerator: deckGenerator, ragService: ragService, deckAnalyzer: services.NewDeckAnalyzer(researchService.DB(), researchService.AI())}
}

// GetRecommendations returns meta deck recommendations based on a user's collection.
func (h *ResearchHandler) GetRecommendations(c *gin.Context) {
	userID, exists := middleware.GetUserID(c)
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	collectionID := c.Query("collection_id")
	response, err := h.researchService.GetRecommendations(c.Request.Context(), userID, collectionID)
	if err != nil {
		status := http.StatusInternalServerError
		if err.Error() == "collection_id is required" {
			status = http.StatusBadRequest
		}
		if err.Error() == "collection not found" {
			status = http.StatusNotFound
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, response)
}

// GetDeckGap returns a detailed gap analysis for one deck.
func (h *ResearchHandler) GetDeckGap(c *gin.Context) {
	userID, exists := middleware.GetUserID(c)
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	collectionID := c.Query("collection_id")
	deckID := c.Param("id")
	if deckID == "" {
		deckID = c.Query("deck_id")
	}
	if deckID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "deck_id is required"})
		return
	}

	response, err := h.researchService.GetDeckGap(c.Request.Context(), userID, collectionID, deckID)
	if err != nil {
		status := http.StatusInternalServerError
		switch err.Error() {
		case "collection_id is required", "deck has no card list":
			status = http.StatusBadRequest
		case "collection not found", "deck not found":
			status = http.StatusNotFound
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, response)
}

// GetDeckAnalysis returns a full scout report for one recommended deck.
func (h *ResearchHandler) GetDeckAnalysis(c *gin.Context) {
	userID, exists := middleware.GetUserID(c)
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	collectionID := c.Query("collection_id")
	deckID := c.Param("id")
	if deckID == "" {
		deckID = c.Query("deck_id")
	}
	response, err := h.researchService.GetDeckAnalysis(c.Request.Context(), userID, collectionID, deckID)
	if err != nil {
		status := http.StatusInternalServerError
		switch err.Error() {
		case "collection_id is required", "deck_id is required":
			status = http.StatusBadRequest
		case "collection not found", "deck not found":
			status = http.StatusNotFound
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, response)
}

// GetAntiMeta returns counter recommendations for a target meta deck.
func (h *ResearchHandler) GetAntiMeta(c *gin.Context) {
	var req struct {
		TargetDeckID string `json:"target_deck_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	response, err := h.researchService.GetAntiMeta(c.Request.Context(), req.TargetDeckID)
	if err != nil {
		status := http.StatusInternalServerError
		if err.Error() == "deck not found" {
			status = http.StatusNotFound
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, response)
}

// GetPredictions returns cards with strong meta signals.
func (h *ResearchHandler) GetPredictions(c *gin.Context) {
	category := c.Query("category")
	limit := 20
	if l := c.Query("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 {
			limit = parsed
		}
	}

	response, err := h.researchService.GetPredictions(c.Request.Context(), category, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, response)
}

// GetForecast returns public model-style card and deck meta forecasts.
func (h *ResearchHandler) GetForecast(c *gin.Context) {
	category := c.Query("category")
	limit := 20
	if l := c.Query("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 {
			limit = parsed
		}
	}

	response, err := h.researchService.GetForecast(c.Request.Context(), category, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, response)
}


// GetDeckFullAnalysis returns comprehensive deck analysis with consistency, mulligan, brick, matchup.
func (h *ResearchHandler) GetDeckFullAnalysis(c *gin.Context) {
	deckID := c.Param("id")
	if deckID == "" {
		deckID = c.Query("deck_id")
	}
	if deckID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "deck_id is required"})
		return
	}

	report, err := h.deckAnalyzer.AnalyzeDeck(c.Request.Context(), deckID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, report)
}

// GenerateDecks generates unique deck combinations from inventory + tournament data.
func (h *ResearchHandler) GenerateDecks(c *gin.Context) {
	_, exists := middleware.GetUserID(c)
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	collectionID := c.Query("collection_id")
	if collectionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "collection_id is required"})
		return
	}

	decks, err := h.deckGenerator.GenerateDecks(c.Request.Context(), collectionID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"collection_id": collectionID,
		"generated_decks": decks,
		"total": len(decks),
	})
}


// ResolveCardNames takes a list of card names and returns their DB data (images, prices, etc.)
func (h *ResearchHandler) ResolveCardNames(c *gin.Context) {
	var req struct {
		Names []string `json:"names" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	type ResolvedCard struct {
		Name     string  `json:"name"`
		CardID   string  `json:"card_id"`
		ImageURL string  `json:"image_url"`
		Category string  `json:"category"`
		CardType string  `json:"card_type"`
		Rarity   string  `json:"rarity"`
		PriceIDR float64 `json:"price_idr"`
	}

	var results []ResolvedCard
	seen := map[string]bool{}

	for _, name := range req.Names {
		if seen[name] || name == "" {
			continue
		}
		seen[name] = true

		var card ResolvedCard
		card.Name = name
		var price sql.NullFloat64
		err := h.researchService.DB().QueryRowContext(c.Request.Context(), `
			SELECT c.id, COALESCE(c.image_url, ''), COALESCE(c.category, ''), COALESCE(c.card_type, ''), COALESCE(c.rarity, ''),
				(SELECT MIN(cp.price_idr) FROM card_prices cp WHERE cp.card_id = c.id AND cp.price_idr > 0)
			FROM cards c
			WHERE LOWER(c.name_id) = LOWER(?) AND c.regulation_mark IN ('H','I','J')
			ORDER BY c.id DESC LIMIT 1
		`, name).Scan(&card.CardID, &card.ImageURL, &card.Category, &card.CardType, &card.Rarity, &price)
		if err == nil {
			if price.Valid {
				card.PriceIDR = price.Float64
			}
			results = append(results, card)
		}
	}

	c.JSON(http.StatusOK, gin.H{"cards": results})
}

// AskAdvisor asks OpenRouter to explain deterministic research output.
func (h *ResearchHandler) AskAdvisor(c *gin.Context) {
	var req struct {
		Question string `json:"question" binding:"required"`
		Context  string `json:"context,omitempty"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	response, err := h.researchService.AskAdvisor(c.Request.Context(), req.Question, req.Context)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, response)
}
