package handlers

import (
	"net/http"
	"pokemon-tcg-indonesia/internal/models"
	"pokemon-tcg-indonesia/internal/services"
	"strconv"

	"github.com/gin-gonic/gin"
)

// PriceHandler handles price-related requests
type PriceHandler struct {
	priceService *services.PriceService
}

// NewPriceHandler creates a new PriceHandler
func NewPriceHandler(priceService *services.PriceService) *PriceHandler {
	return &PriceHandler{priceService: priceService}
}

// ComparePrices godoc
// @Summary Compare card prices
// @Description Get price comparison for a card from different sources
// @Tags prices
// @Accept json
// @Produce json
// @Param card_id query string true "Card ID"
// @Success 200 {object} models.PriceComparison
// @Router /prices/compare [get]
func (h *PriceHandler) ComparePrices(c *gin.Context) {
	cardID := c.Query("card_id")
	if cardID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "card_id query parameter required"})
		return
	}

	// Get prices
	prices, err := h.priceService.GetCardPriceComparison(c.Request.Context(), cardID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Get card details for the response
	card, _ := h.priceService.GetCardWithPrices(c.Request.Context(), cardID)
	cardName := cardID
	if card != nil {
		cardName = card.Name
	}

	// Build the structured response
	response := gin.H{
		"card_id":   cardID,
		"card_name": cardName,
		"prices":    prices,
	}

	// Find best deal (lowest price in IDR)
	var bestDeal interface{}
	var minPrice float64
	for _, p := range prices {
		if pIDR, ok := p["price_idr"].(float64); ok && pIDR > 0 {
			if bestDeal == nil || pIDR < minPrice {
				minPrice = pIDR
				bestDeal = gin.H{
					"source":   p["source"],
					"price":    pIDR,
					"currency": "IDR",
				}
			}
		}
	}

	if bestDeal != nil {
		response["best_deal"] = bestDeal
	}

	c.JSON(http.StatusOK, response)
}


// GetArbitrageOpportunities godoc
// @Summary Get arbitrage opportunities
// @Description Find cards with significant price differences between ID and US markets
// @Tags prices
// @Accept json
// @Produce json
// @Param min_difference query number false "Minimum price difference percentage" default(20)
// @Param limit query int false "Limit results" default(50)
// @Success 200 {array} models.PriceComparison
// @Router /prices/arbitrage [get]
func (h *PriceHandler) GetArbitrageOpportunities(c *gin.Context) {
	minDiff := 0.20 // 20% default
	limit := 50

	if md := c.Query("min_difference"); md != "" {
		if parsed, err := strconv.ParseFloat(md, 64); err == nil && parsed > 0 {
			minDiff = parsed / 100 // Convert percentage to decimal
		}
	}
	if l := c.Query("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 {
			limit = parsed
		}
	}

	req := models.ArbitrageRequest{
		MinProfitMargin: minDiff,
		Limit:           limit,
	}

	opportunities, err := h.priceService.GetArbitrageOpportunities(c.Request.Context(), req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, opportunities)
}

// GetPriceTrends godoc
// @Summary Get price trends
// @Description Get price trends over time for a card or set
// @Tags prices
// @Accept json
// @Produce json
// @Param card_id query string false "Card ID"
// @Param expansion query string false "Expansion code"
// @Param days query int false "Number of days" default(30)
// @Success 200 {object} map[string]interface{}
// @Router /prices/trends [get]
func (h *PriceHandler) GetPriceTrends(c *gin.Context) {
	cardID := c.Query("card_id")
	_ = c.Query("expansion") // Reserved for future use
	days := 30

	if d := c.Query("days"); d != "" {
		if parsed, err := strconv.Atoi(d); err == nil && parsed > 0 {
			days = parsed
		}
	}

	result, err := h.priceService.GetPriceHistory(c.Request.Context(), cardID, days)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, result)
}

// GetBestDeals godoc
// @Summary Get best deals
// @Description Get the best value cards currently available
// @Tags prices
// @Accept json
// @Produce json
// @Param category query string false "Card category"
// @Param limit query int false "Limit results" default(20)
// @Success 200 {array} models.Card
// @Router /prices/best-deals [get]
func (h *PriceHandler) GetBestDeals(c *gin.Context) {
	_ = c.DefaultQuery("limit", "20") // Reserved for future use

	// Return market summary instead
	summary, err := h.priceService.GetMarketSummary(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, summary)
}

// GetPricePrediction godoc
// @Summary Get price prediction
// @Description Get AI-powered price forecast for a card
// @Tags prices
// @Accept json
// @Produce json
// @Param id path string true "Card ID"
// @Success 200 {object} models.PricePrediction
// @Router /prices/{id}/prediction [get]
func (h *PriceHandler) GetPricePrediction(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "card ID required"})
		return
	}

	prediction, err := h.priceService.GetPricePrediction(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, prediction)
}
