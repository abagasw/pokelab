package handlers

import (
	"net/http"
	"pokemon-tcg-indonesia/internal/services"

	"github.com/gin-gonic/gin"
)

// AIHandler handles general AI assistant requests.
type AIHandler struct {
	cardService *services.CardService
}

// NewAIHandler creates a new AIHandler.
func NewAIHandler(cardService *services.CardService) *AIHandler {
	return &AIHandler{cardService: cardService}
}

// AskAI godoc
// @Summary Ask AI
// @Description Ask AI about Pokemon TCG using available app context
// @Tags ai
// @Accept json
// @Produce json
// @Param request body object true "Question"
// @Success 200 {object} map[string]string
// @Router /ai/ask [post]
func (h *AIHandler) AskAI(c *gin.Context) {
	var req struct {
		Question string `json:"question" binding:"required"`
		Context  string `json:"context,omitempty"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	answer, err := h.cardService.AskAI(c.Request.Context(), req.Question, req.Context)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"answer": answer})
}
