package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// MLHandler handles ML-related requests
type MLHandler struct {
	mlServiceURL string
	httpClient   *http.Client
}

// NewMLHandler creates a new MLHandler
func NewMLHandler(mlServiceURL string) *MLHandler {
	return &MLHandler{
		mlServiceURL: mlServiceURL,
		httpClient:   &http.Client{Timeout: 30 * time.Second},
	}
}

// GetPricePredictions generates price predictions for cards
func (h *MLHandler) GetPricePredictions(c *gin.Context) {
	cardIDs := c.QueryArray("card_ids")
	horizonDays := 30

	resp, err := h.post("/predict/prices", map[string]interface{}{
		"card_ids":     cardIDs,
		"horizon_days": horizonDays,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer resp.Body.Close()

	var result map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&result)
	c.JSON(http.StatusOK, result)
}

// GetAnomalyDetection detects anomalies in price or tournament data
func (h *MLHandler) GetAnomalyDetection(c *gin.Context) {
	cardIDs := c.QueryArray("card_ids")
	if len(cardIDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "card_ids required"})
		return
	}

	thresholdStd := 3.0
	if t := c.Query("threshold_std"); t != "" {
		fmt.Sscanf(t, "%f", &thresholdStd)
	}

	resp, err := h.post("/detect/anomalies", map[string]interface{}{
		"card_ids":      cardIDs,
		"threshold_std": thresholdStd,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer resp.Body.Close()

	var result map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&result)
	c.JSON(http.StatusOK, result)
}

// GetModelInfo returns information about loaded ML models
func (h *MLHandler) GetModelInfo(c *gin.Context) {
	resp, err := h.get("/models/info")
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "ML service unavailable"})
		return
	}
	defer resp.Body.Close()

	var result map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&result)
	c.JSON(http.StatusOK, result)
}

func (h *MLHandler) post(path string, body interface{}) (*http.Response, error) {
	jsonBody, _ := json.Marshal(body)
	req, _ := http.NewRequest("POST", h.mlServiceURL+path, bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	return h.httpClient.Do(req)
}

func (h *MLHandler) get(path string) (*http.Response, error) {
	return h.httpClient.Get(h.mlServiceURL + path)
}
