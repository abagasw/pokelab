package handlers

import (
	"net/http"
	"pokemon-tcg-indonesia/internal/middleware"
	"pokemon-tcg-indonesia/internal/models"
	"pokemon-tcg-indonesia/internal/services"

	"github.com/gin-gonic/gin"
)

// CollectionHandler handles collection-related requests
type CollectionHandler struct {
	collectionService *services.CollectionService
}

// NewCollectionHandler creates a new CollectionHandler
func NewCollectionHandler(collectionService *services.CollectionService) *CollectionHandler {
	return &CollectionHandler{collectionService: collectionService}
}

// GetCollections godoc
// @Summary Get user collections
// @Description Get all collections for the current user
// @Tags collections
// @Accept json
// @Produce json
// @Security BearerAuth
// @Success 200 {array} models.Collection
// @Router /collections [get]
func (h *CollectionHandler) GetCollections(c *gin.Context) {
	userID, exists := middleware.GetUserID(c)
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	collections, err := h.collectionService.GetCollections(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, collections)
}

// CreateCollection godoc
// @Summary Create collection
// @Description Create a new collection
// @Tags collections
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param request body object true "Collection details"
// @Success 201 {object} models.Collection
// @Router /collections [post]
func (h *CollectionHandler) CreateCollection(c *gin.Context) {
	userID, exists := middleware.GetUserID(c)
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var req struct {
		Name      string `json:"name" binding:"required,min=1,max=100"`
		IsDefault bool   `json:"is_default"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	collection, err := h.collectionService.CreateCollection(c.Request.Context(), userID, req.Name, req.IsDefault)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, collection)
}

// GetCollection godoc
// @Summary Get collection
// @Description Get a specific collection with all items
// @Tags collections
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path string true "Collection ID"
// @Success 200 {object} models.Collection
// @Router /collections/{id} [get]
func (h *CollectionHandler) GetCollection(c *gin.Context) {
	collectionID := c.Param("id")
	if collectionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "collection ID required"})
		return
	}
	userID, exists := middleware.GetUserID(c)
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	collection, err := h.collectionService.GetCollectionForUser(c.Request.Context(), collectionID, userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Collection not found"})
		return
	}

	c.JSON(http.StatusOK, collection)
}

// UpdateCollection godoc
// @Summary Update collection
// @Description Update collection name
// @Tags collections
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path string true "Collection ID"
// @Param request body object true "Collection details"
// @Success 200 {object} models.Collection
// @Router /collections/{id} [put]
func (h *CollectionHandler) UpdateCollection(c *gin.Context) {
	collectionID := c.Param("id")
	if collectionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "collection ID required"})
		return
	}
	userID, exists := middleware.GetUserID(c)
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	if _, err := h.collectionService.GetCollectionForUser(c.Request.Context(), collectionID, userID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Collection not found"})
		return
	}

	var req struct {
		Name string `json:"name" binding:"required,min=1,max=100"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.collectionService.UpdateCollection(c.Request.Context(), collectionID, req.Name); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Return updated collection
	collection, err := h.collectionService.GetCollectionForUser(c.Request.Context(), collectionID, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, collection)
}

// DeleteCollection godoc
// @Summary Delete collection
// @Description Delete a collection and all its items
// @Tags collections
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path string true "Collection ID"
// @Success 204
// @Router /collections/{id} [delete]
func (h *CollectionHandler) DeleteCollection(c *gin.Context) {
	collectionID := c.Param("id")
	if collectionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "collection ID required"})
		return
	}
	userID, exists := middleware.GetUserID(c)
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	if _, err := h.collectionService.GetCollectionForUser(c.Request.Context(), collectionID, userID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Collection not found"})
		return
	}

	if err := h.collectionService.DeleteCollection(c.Request.Context(), collectionID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.Status(http.StatusNoContent)
}

// AddToCollection godoc
// @Summary Add to collection
// @Description Add a card to a collection
// @Tags collections
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path string true "Collection ID"
// @Param request body models.CollectionRequest true "Card details"
// @Success 201 {object} models.CollectionItem
// @Router /collections/{id}/items [post]
func (h *CollectionHandler) AddToCollection(c *gin.Context) {
	collectionID := c.Param("id")
	if collectionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "collection ID required"})
		return
	}
	userID, exists := middleware.GetUserID(c)
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	if _, err := h.collectionService.GetCollectionForUser(c.Request.Context(), collectionID, userID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Collection not found"})
		return
	}

	var req models.CollectionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Validate card ID
	if req.CardID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "card_id is required"})
		return
	}

	// Validate quantity
	if req.Quantity <= 0 {
		req.Quantity = 1
	}

	// Validate condition
	validConditions := map[string]bool{"NM": true, "LP": true, "MP": true, "HP": true, "DMG": true}
	if req.Condition != "" && !validConditions[req.Condition] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "condition must be one of: NM, LP, MP, HP, DMG"})
		return
	}

	if err := h.collectionService.AddToCollection(c.Request.Context(), collectionID, req); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": "Added to collection"})
}

// RemoveFromCollection godoc
// @Summary Remove from collection
// @Description Remove an item from a collection
// @Tags collections
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path string true "Collection ID"
// @Param itemId path string true "Item ID"
// @Success 204
// @Router /collections/{id}/items/{itemId} [delete]
func (h *CollectionHandler) RemoveFromCollection(c *gin.Context) {
	collectionID := c.Param("id")
	itemID := c.Param("itemId")

	if collectionID == "" || itemID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "collection ID and item ID required"})
		return
	}
	userID, exists := middleware.GetUserID(c)
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	if _, err := h.collectionService.GetCollectionForUser(c.Request.Context(), collectionID, userID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Collection not found"})
		return
	}

	if err := h.collectionService.RemoveFromCollection(c.Request.Context(), collectionID, itemID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.Status(http.StatusNoContent)
}

// UpdateCollectionItem godoc
// @Summary Update collection item
// @Description Update details of a collection item
// @Tags collections
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path string true "Collection ID"
// @Param itemId path string true "Item ID"
// @Param request body models.CollectionRequest true "Item details"
// @Success 200 {object} models.CollectionItem
// @Router /collections/{id}/items/{itemId} [put]
func (h *CollectionHandler) UpdateCollectionItem(c *gin.Context) {
	collectionID := c.Param("id")
	itemID := c.Param("itemId")
	if collectionID == "" || itemID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "collection ID and item ID required"})
		return
	}
	userID, exists := middleware.GetUserID(c)
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	if _, err := h.collectionService.GetCollectionForUser(c.Request.Context(), collectionID, userID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Collection not found"})
		return
	}

	var req models.CollectionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.collectionService.UpdateCollectionItem(c.Request.Context(), collectionID, itemID, req); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Item updated"})
}

// GetCollectionSummary godoc
// @Summary Get collection summary
// @Description Get summary statistics for a collection
// @Tags collections
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path string true "Collection ID"
// @Success 200 {object} models.CollectionSummary
// @Router /collections/{id}/summary [get]
func (h *CollectionHandler) GetCollectionSummary(c *gin.Context) {
	collectionID := c.Param("id")
	if collectionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "collection ID required"})
		return
	}
	userID, exists := middleware.GetUserID(c)
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	if _, err := h.collectionService.GetCollectionForUser(c.Request.Context(), collectionID, userID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Collection not found"})
		return
	}

	summary, err := h.collectionService.GetCollectionSummary(c.Request.Context(), collectionID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, summary)
}

// GetPortfolioInsight godoc
// @Summary Get portfolio insight
// @Description Get deep visual analysis for a collection
// @Tags collections
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path string true "Collection ID"
// @Success 200 {object} models.PortfolioInsight
// @Router /collections/{id}/insight [get]
func (h *CollectionHandler) GetPortfolioInsight(c *gin.Context) {
	collectionID := c.Param("id")
	if collectionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "collection ID required"})
		return
	}
	userID, exists := middleware.GetUserID(c)
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	if _, err := h.collectionService.GetCollectionForUser(c.Request.Context(), collectionID, userID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Collection not found"})
		return
	}

	insight, err := h.collectionService.GetPortfolioInsight(c.Request.Context(), collectionID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, insight)
}



// BulkImport godoc
// @Summary Bulk import cards to collection by name
// @Description Search cards by name and add them to collection in bulk
// @Tags collections
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path string true "Collection ID"
// @Param request body object true "Bulk import entries"
// @Success 200 {object} services.BulkImportResult
// @Router /collections/{id}/bulk-import [post]
func (h *CollectionHandler) BulkImport(c *gin.Context) {
	collectionID := c.Param("id")
	if collectionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "collection ID required"})
		return
	}
	userID, exists := middleware.GetUserID(c)
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	if _, err := h.collectionService.GetCollectionForUser(c.Request.Context(), collectionID, userID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Collection not found"})
		return
	}

	var req struct {
		Entries []services.BulkImportEntry `json:"entries" binding:"required,min=1"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result, err := h.collectionService.BulkImportByName(c.Request.Context(), collectionID, req.Entries)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, result)
}

// GetPriceAlerts godoc
// @Summary Get price alerts
// @Description Get all price alerts for the current user
// @Tags alerts
// @Accept json
// @Produce json
// @Security BearerAuth
// @Success 200 {array} models.PriceAlert
// @Router /alerts [get]
func (h *CollectionHandler) GetPriceAlerts(c *gin.Context) {
	userID, exists := middleware.GetUserID(c)
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	alerts, err := h.collectionService.GetPriceAlerts(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, alerts)
}

// CreatePriceAlert godoc
// @Summary Create price alert
// @Description Create a new price alert
// @Tags alerts
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param request body object true "Alert details"
// @Success 201 {object} models.PriceAlert
// @Router /alerts [post]
func (h *CollectionHandler) CreatePriceAlert(c *gin.Context) {
	userID, exists := middleware.GetUserID(c)
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var req struct {
		CardID      string  `json:"card_id" binding:"required"`
		TargetPrice float64 `json:"target_price" binding:"required,gt=0"`
		Condition   string  `json:"condition"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	alert, err := h.collectionService.CreatePriceAlert(c.Request.Context(), userID, req.CardID, req.TargetPrice, req.Condition)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, alert)
}

// DeletePriceAlert godoc
// @Summary Delete price alert
// @Description Delete a price alert
// @Tags alerts
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path string true "Alert ID"
// @Success 204
// @Router /alerts/{id} [delete]
func (h *CollectionHandler) DeletePriceAlert(c *gin.Context) {
	userID, exists := middleware.GetUserID(c)
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	alertID := c.Param("id")
	if alertID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "alert ID required"})
		return
	}

	if err := h.collectionService.DeletePriceAlert(c.Request.Context(), alertID, userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.Status(http.StatusNoContent)
}
