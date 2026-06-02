package handlers

import (
	"crypto/tls"
	"io"
	"net/http"
	"net/url"
	"pokemon-tcg-indonesia/internal/models"
	"pokemon-tcg-indonesia/internal/services"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// CardHandler handles card-related requests
type CardHandler struct {
	cardService *services.CardService
}

// NewCardHandler creates a new CardHandler
func NewCardHandler(cardService *services.CardService) *CardHandler {
	return &CardHandler{cardService: cardService}
}

// SearchCards godoc
// @Summary Search cards
// @Description Search Pokemon TCG cards with various filters
// @Tags cards
// @Accept json
// @Produce json
// @Param q query string false "Search query"
// @Param expansion query string false "Expansion code (e.g., MA4)"
// @Param category query string false "Category: Pokemon, Trainer, Energy"
// @Param type query string false "Card type: Fire, Water, Grass, etc."
// @Param regulation query string false "Regulation mark: G, H, I, J"
// @Param rarity query string false "Rarity: C, U, R, RR, SAR"
// @Param min_hp query int false "Minimum HP"
// @Param max_hp query int false "Maximum HP"
// @Param has_ability query bool false "Has ability"
// @Param price_min query number false "Minimum price (IDR)"
// @Param price_max query number false "Maximum price (IDR)"
// @Param page query int false "Page number" default(1)
// @Param limit query int false "Items per page" default(20)
// @Success 200 {object} models.CardSearchResponse
// @Router /cards [get]
func (h *CardHandler) SearchCards(c *gin.Context) {
	var req models.CardSearchRequest
	if err := c.ShouldBindQuery(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Set defaults
	if req.Page < 1 {
		req.Page = 1
	}
	if req.Limit < 1 || req.Limit > 100 {
		req.Limit = 20
	}

	result, err := h.cardService.SearchCards(c.Request.Context(), req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, result)
}

// GetCardByID godoc
// @Summary Get card by ID
// @Description Get detailed information about a specific card
// @Tags cards
// @Accept json
// @Produce json
// @Param id path string true "Card ID"
// @Success 200 {object} models.Card
// @Router /cards/{id} [get]
func (h *CardHandler) GetCardByID(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Card ID required"})
		return
	}

	card, err := h.cardService.GetCardByID(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Card not found"})
		return
	}

	c.JSON(http.StatusOK, card)
}

// GetCardByIDQuery gets a card by query string ID. This supports card IDs that
// contain slashes, which are awkward to represent as a path parameter.
func (h *CardHandler) GetCardByIDQuery(c *gin.Context) {
	id := c.Query("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Card ID required"})
		return
	}

	card, err := h.cardService.GetCardByID(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Card not found"})
		return
	}

	c.JSON(http.StatusOK, card)
}

// GetCardPrices godoc
// @Summary Get card prices
// @Description Get all price data for a specific card from different sources
// @Tags cards
// @Accept json
// @Produce json
// @Param id path string true "Card ID"
// @Success 200 {object} map[string]interface{}
// @Router /cards/{id}/prices [get]
func (h *CardHandler) GetCardPrices(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Card ID required"})
		return
	}

	prices, err := h.cardService.GetCardPrices(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, prices)
}

// ProxyCardImage fetches trusted remote card images through the API.
func (h *CardHandler) ProxyCardImage(c *gin.Context) {
	rawURL := c.Query("url")
	if rawURL == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "url is required"})
		return
	}

	parsed, err := url.Parse(rawURL)
	if err != nil || (parsed.Scheme != "https" && parsed.Scheme != "http") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid image url"})
		return
	}

	host := strings.ToLower(parsed.Hostname())
	trustedHosts := map[string]bool{
		"pub-61ccf1b9e1ab4037b28e968ea11d9d1f.r2.dev": true,
		"images.pokemontcg.io":                        true,
	}
	if !trustedHosts[host] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "image host is not allowed"})
		return
	}

	client := &http.Client{
		Timeout: 12 * time.Second,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true}, //nolint:gosec // Image proxy fallback for known public card hosts with local trust issues.
		},
	}
	req, err := http.NewRequestWithContext(c.Request.Context(), http.MethodGet, rawURL, nil)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid image request"})
		return
	}
	req.Header.Set("User-Agent", "PokeLab-ID/1.0")

	resp, err := client.Do(req)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to fetch image"})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		c.JSON(http.StatusBadGateway, gin.H{"error": "image source returned error"})
		return
	}

	contentType := resp.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "image/webp"
	}
	if !strings.HasPrefix(contentType, "image/") {
		c.JSON(http.StatusBadGateway, gin.H{"error": "source is not an image"})
		return
	}

	c.Header("Cache-Control", "public, max-age=86400")
	c.Header("Content-Type", contentType)
	c.Status(http.StatusOK)
	_, _ = io.Copy(c.Writer, resp.Body)
}

// GetExpansions godoc
// @Summary Get all expansions
// @Description Get list of all Pokemon TCG expansions/sets
// @Tags expansions
// @Accept json
// @Produce json
// @Success 200 {array} models.Expansion
// @Router /expansions [get]
func (h *CardHandler) GetExpansions(c *gin.Context) {
	expansions, err := h.cardService.GetExpansions(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, expansions)
}

// GetExpansionByCode godoc
// @Summary Get expansion by code
// @Description Get detailed information about a specific expansion
// @Tags expansions
// @Accept json
// @Produce json
// @Param code path string true "Expansion code (e.g., MA4)"
// @Success 200 {object} models.ExpansionSummary
// @Router /expansions/{code} [get]
func (h *CardHandler) GetExpansionByCode(c *gin.Context) {
	code := c.Param("code")

	expansion, err := h.cardService.GetExpansionByCode(c.Request.Context(), code)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Expansion not found"})
		return
	}

	c.JSON(http.StatusOK, expansion)
}

// GetCardsByExpansion godoc
// @Summary Get cards by expansion
// @Description Get all cards from a specific expansion
// @Tags expansions
// @Accept json
// @Produce json
// @Param code path string true "Expansion code"
// @Param page query int false "Page number" default(1)
// @Param limit query int false "Items per page" default(20)
// @Success 200 {object} models.CardSearchResponse
// @Router /expansions/{code}/cards [get]
func (h *CardHandler) GetCardsByExpansion(c *gin.Context) {
	code := c.Param("code")

	page := 1
	limit := 20

	if p := c.Query("page"); p != "" {
		if parsed, err := strconv.Atoi(p); err == nil && parsed > 0 {
			page = parsed
		}
	}
	if l := c.Query("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 && parsed <= 100 {
			limit = parsed
		}
	}

	result, err := h.cardService.GetCardsByExpansion(c.Request.Context(), code, page, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, result)
}

// ExplainCard godoc
// @Summary AI explain card
// @Description Get AI explanation about a card's abilities and strategies
// @Tags ai
// @Accept json
// @Produce json
// @Param request body object true "Card ID"
// @Success 200 {object} map[string]string
// @Router /ai/explain-card [post]
func (h *CardHandler) ExplainCard(c *gin.Context) {
	var req struct {
		CardID string `json:"card_id" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.CardID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Card ID required"})
		return
	}

	explanation, err := h.cardService.ExplainCard(c.Request.Context(), req.CardID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"explanation": explanation})
}
