package handlers

import (
	"net/http"
	"pokemon-tcg-indonesia/internal/middleware"
	"pokemon-tcg-indonesia/internal/services"
	"strconv"

	"github.com/gin-gonic/gin"
)

// ResearchHandler handles PokeLab ID research requests.
type ResearchHandler struct {
	researchService *services.ResearchService
}

// NewResearchHandler creates a new ResearchHandler.
func NewResearchHandler(researchService *services.ResearchService) *ResearchHandler {
	return &ResearchHandler{researchService: researchService}
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
	deckID := c.Query("deck_id")
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
	deckID := c.Query("deck_id")
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
