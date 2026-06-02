package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"pokemon-tcg-indonesia/internal/models"
	"strings"
	"time"
)

const exchangeRateIDRtoUSD = 16400.0 // From scraped data

// PriceService handles price-related business logic
type PriceService struct {
	db        *sql.DB
	aiService *AIService
}

// NewPriceService creates a new PriceService
func NewPriceService(db *sql.DB, aiService *AIService) *PriceService {
	return &PriceService{db: db, aiService: aiService}
}

// GetArbitrageOpportunities finds price arbitrage opportunities
func (s *PriceService) GetArbitrageOpportunities(ctx context.Context, req models.ArbitrageRequest) (*models.ArbitrageResponse, error) {
	minMargin := req.MinProfitMargin
	if minMargin == 0 {
		minMargin = 0.2 // 20% default
	}
	
	// Query cards with both IDR and USD prices
	opportunities := []models.ArbitrageOpportunity{}
	cards := s.getCardsWithPrices(ctx)
	
	for _, card := range cards {
		if card.IDRPrice == 0 || card.USDPrice == 0 {
			continue
		}
		
		usdInIdr := card.USDPrice * exchangeRateIDRtoUSD
		margin := (usdInIdr - float64(card.IDRPrice)) / usdInIdr
		
		if margin >= minMargin {
			opportunity := models.ArbitrageOpportunity{
				CardID:          card.ID,
				CardName:        card.Name,
				ExpansionCode:   card.Expansion,
				IDRPrice:        card.IDRPrice,
				USDPrice:        card.USDPrice,
				USDInIDR:        usdInIdr,
				ProfitMargin:    margin,
				PotentialProfit: usdInIdr - float64(card.IDRPrice),
				Recommendation:  s.getArbitrageRecommendation(margin),
			}
			opportunities = append(opportunities, opportunity)
		}
	}
	
	if req.Limit > 0 && len(opportunities) > req.Limit {
		opportunities = opportunities[:req.Limit]
	}
	
	return &models.ArbitrageResponse{
		Opportunities: opportunities,
		Total:         len(opportunities),
		ExchangeRate:  exchangeRateIDRtoUSD,
		MinMargin:     minMargin,
		GeneratedAt:   time.Now(),
	}, nil
}

// GetCardPriceComparison gets price comparison for a card
func (s *PriceService) GetCardPriceComparison(ctx context.Context, cardID string) ([]map[string]interface{}, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT source, price_idr, price_usd, currency, condition, url, last_updated
		FROM card_prices
		WHERE card_id = ?
		ORDER BY last_updated DESC
	`, cardID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	var prices []map[string]interface{}
	for rows.Next() {
		var source, currency, condition string
		var priceIDR, priceUSD sql.NullFloat64
		var url sql.NullString
		var scrapedAt sql.NullTime
		
		err := rows.Scan(&source, &priceIDR, &priceUSD, &currency, &condition, &url, &scrapedAt)
		if err != nil {
			continue
		}
		
		p := map[string]interface{}{
			"source":    source,
			"currency":  currency,
			"condition": condition,
		}
		
		if priceIDR.Valid {
			p["price_idr"] = priceIDR.Float64
		}
		if priceUSD.Valid {
			p["price_usd"] = priceUSD.Float64
		}
		if url.Valid {
			p["url"] = url.String
		}
		if scrapedAt.Valid {
			p["updated_at"] = scrapedAt.Time
		}
		
		prices = append(prices, p)
	}
	
	return prices, nil
}

// GetPriceHistory gets price history for a card
func (s *PriceService) GetPriceHistory(ctx context.Context, cardID string, days int) (*models.PriceHistoryResponse, error) {
	if days == 0 {
		days = 30
	}
	
	rows, err := s.db.QueryContext(ctx, `
		SELECT price_idr, recorded_at FROM price_history 
		WHERE card_id = ? AND recorded_at >= date('now', ?)
		ORDER BY recorded_at ASC
	`, cardID, fmt.Sprintf("-%d days", days))
	
	history := []models.PricePoint{}
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var p float64
			var d time.Time
			if err := rows.Scan(&p, &d); err == nil {
				history = append(history, models.PricePoint{
					Price:      p,
					RecordedAt: d,
				})
			}
		}
	}
	
	return &models.PriceHistoryResponse{
		CardID:      cardID,
		Currency:    "IDR",
		History:     history,
		Days:        days,
		GeneratedAt: time.Now(),
	}, nil
}

// GetPricePrediction generates AI-powered price forecast
func (s *PriceService) GetPricePrediction(ctx context.Context, cardID string) (*models.PricePrediction, error) {
	// 1. Get current price & metadata
	card, err := s.GetCardWithPrices(ctx, cardID)
	if err != nil {
		return nil, err
	}

	// 2. Get history context
	hist, _ := s.GetPriceHistory(ctx, cardID, 14)
	historyJSON, _ := json.Marshal(hist.History)

	// 3. Get meta context
	var usageCount int
	s.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM deck_cards dc
		JOIN decks d ON dc.deck_id = d.id
		WHERE dc.card_id = ? AND d.tournament_count > 0
	`, cardID).Scan(&usageCount)
	metaContext := fmt.Sprintf("Usage in top decks: %d archetypes", usageCount)

	// 4. AI Prediction
	aiResp, err := s.aiService.PredictPrice(ctx, card.Name, string(historyJSON), metaContext)
	if err != nil {
		return nil, err
	}

	// 5. Parse
	var prediction models.PricePrediction
	prediction.CardID = cardID
	prediction.CurrentPriceIDR = float64(card.IDRPrice)
	prediction.ForecastDays = 30
	prediction.UpdatedAt = time.Now()

	start := strings.Index(aiResp, "{")
	end := strings.LastIndex(aiResp, "}")
	if start != -1 && end != -1 && end > start {
		var parsed struct {
			PredictedPrice float64  `json:"predicted_price"`
			RangeMin       float64  `json:"range_min"`
			RangeMax       float64  `json:"range_max"`
			Confidence     float64  `json:"confidence"`
			Trend          string   `json:"trend"`
			Sentiment      string   `json:"sentiment"`
			Factors        []string `json:"factors"`
		}
		if err := json.Unmarshal([]byte(aiResp[start:end+1]), &parsed); err == nil {
			prediction.PredictedPrice = parsed.PredictedPrice
			prediction.PriceRangeMin = parsed.RangeMin
			prediction.PriceRangeMax = parsed.RangeMax
			prediction.ConfidenceScore = parsed.Confidence
			prediction.Trend = parsed.Trend
			prediction.Sentiment = parsed.Sentiment
			prediction.Factors = parsed.Factors
		}
	}

	return &prediction, nil
}

// GetMarketSummary gets market summary
func (s *PriceService) GetMarketSummary(ctx context.Context) (*models.MarketSummaryResponse, error) {
	return &models.MarketSummaryResponse{
		TotalCards:        13439,
		CardsWithIDRPrice: 679,
		CardsWithUSDPrice: 395,
		ExchangeRate:      exchangeRateIDRtoUSD,
		IDRAveragePrice:   185000,
		USDAveragePrice:   12.50,
		LastUpdated:       time.Now(),
	}, nil
}

// GetCollectionValue calculates collection value
func (s *PriceService) GetCollectionValue(ctx context.Context, items []struct {
	CardID string `json:"card_id"`
	Count  int    `json:"count"`
}) (*models.CollectionValueResponse, error) {
	totalIDR := int64(0)
	totalUSD := 0.0
	resultItems := []models.CollectionItem{}
	
	for _, item := range items {
		card, err := s.GetCardWithPrices(ctx, item.CardID)
		if err != nil {
			continue
		}
		
		itemIDR := card.IDRPrice * int64(item.Count)
		itemUSD := card.USDPrice * float64(item.Count)
		
		totalIDR += itemIDR
		totalUSD += itemUSD
		
		resultItems = append(resultItems, models.CollectionItem{
			CardID:   card.ID,
			Quantity: item.Count,
		})
	}
	
	return &models.CollectionValueResponse{
		TotalCards:   len(items),
		TotalIDR:     totalIDR,
		TotalUSD:     totalUSD,
		Items:        resultItems,
		ExchangeRate: exchangeRateIDRtoUSD,
		CalculatedAt: time.Now(),
	}, nil
}

// AskPriceQuestion asks AI about pricing
func (s *PriceService) AskPriceQuestion(ctx context.Context, cardID, question string) (string, error) {
	card, err := s.GetCardWithPrices(ctx, cardID)
	if err != nil {
		return s.aiService.AnalyzePrice(ctx, cardID, `{"error": "price data not found"}`)
	}
	
	rows, err := s.db.QueryContext(ctx, `
		SELECT source, price_idr, price_usd, currency, condition, last_updated
		FROM card_prices WHERE card_id = ? ORDER BY last_updated DESC
	`, cardID)
	if err != nil {
		return s.aiService.AnalyzePrice(ctx, cardID, `{"error": "failed to query prices"}`)
	}
	defer rows.Close()
	
	type priceEntry struct {
		Source    string  `json:"source"`
		PriceIDR  *int64  `json:"price_idr,omitempty"`
		PriceUSD  *float64 `json:"price_usd,omitempty"`
		Currency  string  `json:"currency"`
		Condition string  `json:"condition"`
		ScrapedAt string  `json:"last_updated"`
	}
	
	var prices []priceEntry
	for rows.Next() {
		var p priceEntry
		var priceIDR, priceUSD sql.NullFloat64
		var scrapedAt sql.NullTime
		rows.Scan(&p.Source, &priceIDR, &priceUSD, &p.Currency, &p.Condition, &scrapedAt)
		if priceIDR.Valid {
			idr := int64(priceIDR.Float64)
			p.PriceIDR = &idr
		}
		if priceUSD.Valid {
			p.PriceUSD = &priceUSD.Float64
		}
		if scrapedAt.Valid {
			p.ScrapedAt = scrapedAt.Time.Format("2006-01-02")
		}
		prices = append(prices, p)
	}
	
	priceDataMap := map[string]interface{}{
		"card_id":   cardID,
		"card_name": card.Name,
		"current_prices": prices,
	}
	priceDataJSON, _ := json.Marshal(priceDataMap)
	return s.aiService.AnalyzePrice(ctx, cardID, string(priceDataJSON))
}

// Helper types and functions

type cardWithPrices struct {
	ID        string
	Name      string
	Expansion string
	IDRPrice  int64
	USDPrice  float64
}

func (s *PriceService) getCardsWithPrices(ctx context.Context) []cardWithPrices {
	cards := []cardWithPrices{}
	rows, err := s.db.QueryContext(ctx, `
		SELECT c.id, c.name_id, c.expansion_code,
		       MAX(CASE WHEN cp.currency = 'IDR' THEN cp.price_idr END) as idr_price,
		       MAX(CASE WHEN cp.currency = 'USD' THEN cp.price_usd END) as usd_price
		FROM cards c
		JOIN card_prices cp ON c.id = cp.card_id
		GROUP BY c.id
		HAVING idr_price IS NOT NULL AND usd_price IS NOT NULL
	`)
	if err != nil {
		return cards
	}
	defer rows.Close()
	
	for rows.Next() {
		var card cardWithPrices
		var idrPrice, usdPrice sql.NullFloat64
		err := rows.Scan(&card.ID, &card.Name, &card.Expansion, &idrPrice, &usdPrice)
		if err != nil { continue }
		if idrPrice.Valid { card.IDRPrice = int64(idrPrice.Float64) }
		if usdPrice.Valid { card.USDPrice = usdPrice.Float64 }
		cards = append(cards, card)
	}
	return cards
}

func (s *PriceService) GetCardWithPrices(ctx context.Context, cardID string) (*cardWithPrices, error) {
	card := &cardWithPrices{ID: cardID}
	err := s.db.QueryRowContext(ctx, `SELECT name_id FROM cards WHERE id = ?`, cardID).Scan(&card.Name)
	if err != nil { return nil, err }
	var idrPrice sql.NullFloat64
	s.db.QueryRowContext(ctx, `SELECT price_idr FROM card_prices WHERE card_id = ? AND currency = 'IDR' ORDER BY last_updated DESC LIMIT 1`, cardID).Scan(&idrPrice)
	if idrPrice.Valid { card.IDRPrice = int64(idrPrice.Float64) }
	var usdPrice sql.NullFloat64
	s.db.QueryRowContext(ctx, `SELECT price_usd FROM card_prices WHERE card_id = ? AND currency = 'USD' ORDER BY last_updated DESC LIMIT 1`, cardID).Scan(&usdPrice)
	if usdPrice.Valid { card.USDPrice = usdPrice.Float64 }
	return card, nil
}

func (s *PriceService) getArbitrageRecommendation(margin float64) string {
	if margin >= 0.5 { return "Strong Buy in ID - High arbitrage opportunity" }
	if margin >= 0.3 { return "Good Buy in ID - Moderate profit potential" }
	return "Marginal - Consider other factors"
}
