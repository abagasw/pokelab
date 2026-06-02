package handlers

import (
	"net/http"
	"pokemon-tcg-indonesia/internal/models"
	"pokemon-tcg-indonesia/internal/services"
	"strconv"

	"github.com/gin-gonic/gin"
)

// DeckHandler handles deck-related requests
type DeckHandler struct {
	deckService *services.DeckService
}

// NewDeckHandler creates a new DeckHandler
func NewDeckHandler(deckService *services.DeckService) *DeckHandler {
	return &DeckHandler{deckService: deckService}
}

// GetDecks godoc
// @Summary Get deck archetypes
// @Description Get list of deck archetypes with optional filtering. Includes user-saved decks if authenticated.
// @Tags decks
// @Accept json
// @Produce json
// @Param format query string false "Format: Standard, Expanded"
// @Param page query int false "Page number" default(1)
// @Param limit query int false "Items per page" default(20)
// @Success 200 {array} models.Deck
// @Router /decks [get]
func (h *DeckHandler) GetDecks(c *gin.Context) {
	format := c.Query("format")
	queryText := c.Query("q")
	page := 1
	limit := 20

	if p := c.Query("page"); p != "" {
		if parsed, err := strconv.Atoi(p); err == nil && parsed > 0 {
			page = parsed
		}
	}
	if l := c.Query("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 {
			limit = parsed
		}
	}

	// Get userID if authenticated
	userID, _ := c.Get("userID")
	userIDStr := ""
	if id, ok := userID.(string); ok {
		userIDStr = id
	}

	decks, total, err := h.deckService.GetDecks(c.Request.Context(), format, queryText, userIDStr, page, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.Header("X-Total-Count", strconv.Itoa(total))
	if c.Query("with_meta") == "1" {
		totalPages := 1
		if limit > 0 {
			totalPages = (total + limit - 1) / limit
			if totalPages < 1 {
				totalPages = 1
			}
		}
		c.JSON(http.StatusOK, gin.H{
			"decks":       decks,
			"page":        page,
			"limit":       limit,
			"total":       total,
			"total_pages": totalPages,
		})
		return
	}

	c.JSON(http.StatusOK, decks)
}

// CreateDeck godoc
// @Summary Save custom deck
// @Description Save a new custom deck to user's profile
// @Tags decks
// @Accept json
// @Produce json
// @Param request body models.Deck true "Deck data"
// @Success 201 {object} models.Deck
// @Router /decks [post]
func (h *DeckHandler) CreateDeck(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	var deck models.Deck
	if err := c.ShouldBindJSON(&deck); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	savedDeck, err := h.deckService.CreateDeck(c.Request.Context(), userID.(string), &deck)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, savedDeck)
}

// GetDeckByID godoc
// @Summary Get deck by ID
// @Description Get detailed information about a deck archetype
// @Tags decks
// @Accept json
// @Produce json
// @Param id path string true "Deck ID"
// @Success 200 {object} models.Deck
// @Router /decks/{id} [get]
func (h *DeckHandler) GetDeckByID(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid deck ID"})
		return
	}

	deck, err := h.deckService.GetDeckByID(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Deck not found"})
		return
	}

	c.JSON(http.StatusOK, deck)
}

// GetDeckDecklists godoc
// @Summary Get deck decklists
// @Description Get all decklists for a specific deck archetype
// @Tags decks
// @Accept json
// @Produce json
// @Param id path string true "Deck ID"
// @Success 200 {array} models.Decklist
// @Router /decks/{id}/decklists [get]
func (h *DeckHandler) GetDeckDecklists(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid deck ID"})
		return
	}

	decklists, err := h.deckService.GetDeckDecklists(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, decklists)
}

// BuildDeck godoc
// @Summary AI Deck Builder
// @Description Build a deck using AI based on budget and preferences
// @Tags decks
// @Accept json
// @Produce json
// @Param request body models.DeckBuildRequest true "Deck build request"
// @Success 200 {object} models.DeckBuildResponse
// @Router /decks/build [post]
func (h *DeckHandler) BuildDeck(c *gin.Context) {
	var req models.DeckBuildRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	response, err := h.deckService.BuildDeck(c.Request.Context(), req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, response)
}

// AnalyzeDeck godoc
// @Summary Analyze deck
// @Description Analyze a deck list and provide AI insights
// @Tags decks
// @Accept json
// @Produce json
// @Param request body object true "Deck list to analyze"
// @Success 200 {object} map[string]interface{}
// @Router /decks/analyze [post]
func (h *DeckHandler) AnalyzeDeck(c *gin.Context) {
	var req struct {
		Name  string `json:"name"`
		Cards []struct {
			CardID string `json:"card_id"`
			Count  int    `json:"count"`
		} `json:"cards"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	analysis, err := h.deckService.AnalyzeDeck(c.Request.Context(), req.Name, req.Cards)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, analysis)
}

// SuggestDecks godoc
// @Summary AI Suggest decks
// @Description Get AI-suggested decks based on available cards or preferences
// @Tags ai
// @Accept json
// @Produce json
// @Param request body object true "Preferences"
// @Success 200 {array} models.DeckBuildResponse
// @Router /ai/suggest-decks [post]
func (h *DeckHandler) SuggestDecks(c *gin.Context) {
	var req struct {
		Budget         float64  `json:"budget,omitempty"`
		PlayStyle      string   `json:"play_style,omitempty"` // aggressive, control, combo
		PreferredTypes []string `json:"preferred_types,omitempty"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	suggestions, err := h.deckService.SuggestDecks(c.Request.Context(), req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, suggestions)
}

// GetTournaments godoc
// @Summary Get tournaments
// @Description Get list of tournaments with optional filtering
// @Tags tournaments
// @Accept json
// @Produce json
// @Param format query string false "Format filter"
// @Param limit query int false "Limit" default(10)
// @Success 200 {array} models.Tournament
// @Router /tournaments [get]
func (h *DeckHandler) GetTournaments(c *gin.Context) {
	format := c.Query("format")
	limit := 10

	if l := c.Query("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 {
			limit = parsed
		}
	}

	tournaments, err := h.deckService.GetTournaments(c.Request.Context(), format, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, tournaments)
}

// GetTournamentByID godoc
// @Summary Get tournament by ID
// @Description Get detailed information about a tournament
// @Tags tournaments
// @Accept json
// @Produce json
// @Param id path string true "Tournament ID"
// @Success 200 {object} models.Tournament
// @Router /tournaments/{id} [get]
func (h *DeckHandler) GetTournamentByID(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid tournament ID"})
		return
	}

	tournament, err := h.deckService.GetTournamentByID(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Tournament not found"})
		return
	}

	c.JSON(http.StatusOK, tournament)
}

// GetTournamentStandings godoc
// @Summary Get tournament standings
// @Description Get standings/results for a specific tournament
// @Tags tournaments
// @Accept json
// @Produce json
// @Param id path string true "Tournament ID"
// @Param top query int false "Top N standings" default(32)
// @Success 200 {array} models.Decklist
// @Router /tournaments/{id}/standings [get]
func (h *DeckHandler) GetTournamentStandings(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid tournament ID"})
		return
	}

	top := 32
	if t := c.Query("top"); t != "" {
		if parsed, err := strconv.Atoi(t); err == nil && parsed > 0 {
			top = parsed
		}
	}

	standings, err := h.deckService.GetTournamentStandings(c.Request.Context(), id, top)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, standings)
}
