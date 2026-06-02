package models

import (
	"database/sql/driver"
	"encoding/json"
	"time"
)

// Card represents a Pokemon TCG card
type Card struct {
	ID              string `json:"id" db:"id"`
	ExternalID      string `json:"external_id" db:"external_id"` // From Pokepedia
	NameID          string `json:"name_id" db:"name_id"`         // Indonesian name
	NameEN          string `json:"name_en" db:"name_en"`         // English name
	Category        string `json:"category" db:"category"`       // Pokemon, Trainer, Energy
	ExpansionCode   string `json:"expansion_code" db:"expansion_code"`
	CollectorNumber string `json:"collector_number" db:"collector_number"`
	RegulationMark  string `json:"regulation_mark" db:"regulation_mark"` // G, H, I, J
	Rarity          string `json:"rarity" db:"rarity"`                   // C, U, R, RR, SAR, etc.
	Illustrator     string `json:"illustrator" db:"illustrator"`
	ImageURL        string `json:"image_url" db:"image_url"`

	// Pokemon specific fields
	HP             *int    `json:"hp,omitempty" db:"hp"`
	CardType       *string `json:"card_type,omitempty" db:"card_type"` // Fire, Water, etc.
	EvolutionStage *string `json:"evolution_stage,omitempty" db:"evolution_stage"`
	EvolvesFrom    *string `json:"evolves_from,omitempty" db:"evolves_from"`
	RetreatCost    *int    `json:"retreat_cost,omitempty" db:"retreat_cost"`

	// JSON fields for complex data. Pokepedia uses arrays for attacks/abilities
	// and objects for weakness/pokedex, so keep the decoded JSON shape intact.
	Attacks    interface{} `json:"attacks,omitempty" db:"attacks"`
	Abilities  interface{} `json:"abilities,omitempty" db:"abilities"`
	Weakness   interface{} `json:"weakness,omitempty" db:"weakness"`
	Resistance interface{} `json:"resistance,omitempty" db:"resistance"`
	Pokedex    interface{} `json:"pokedex,omitempty" db:"pokedex"`

	// Timestamps
	CreatedAt time.Time `json:"created_at" db:"created_at"`
	UpdatedAt time.Time `json:"updated_at" db:"updated_at"`

	// Relations
	Expansion *Expansion  `json:"expansion,omitempty" db:"-"`
	Prices    []CardPrice `json:"prices,omitempty" db:"-"`
}

// CardPrice represents price data from different sources
type CardPrice struct {
	ID          string    `json:"id" db:"id"`
	CardID      string    `json:"card_id" db:"card_id"`
	Source      string    `json:"source" db:"source"` // cardtell, pricecharting, pokemontcgio
	PriceIDR    *float64  `json:"price_idr,omitempty" db:"price_idr"`
	PriceUSD    *float64  `json:"price_usd,omitempty" db:"price_usd"`
	Currency    string    `json:"currency" db:"currency"`
	Condition   string    `json:"condition" db:"condition"` // NM, LP, MP, etc.
	URL         string    `json:"url" db:"url"`
	LastUpdated time.Time `json:"last_updated" db:"last_updated"`
	CreatedAt   time.Time `json:"created_at" db:"created_at"`
}

// CardSearchRequest represents search parameters
type CardSearchRequest struct {
	Query          string   `form:"q"`
	ExpansionCode  string   `form:"expansion"`
	Category       string   `form:"category"`
	CardType       string   `form:"type"` // Fire, Water, etc.
	RegulationMark string   `form:"regulation"`
	Rarity         string   `form:"rarity"`
	MinHP          *int     `form:"min_hp"`
	MaxHP          *int     `form:"max_hp"`
	HasAbility     *bool    `form:"has_ability"`
	PriceMin       *float64 `form:"price_min"`
	PriceMax       *float64 `form:"price_max"`
	Page           int      `form:"page,default=1"`
	Limit          int      `form:"limit,default=20"`
	SortBy         string   `form:"sort_by,default=name_id"`
	SortOrder      string   `form:"sort_order,default=asc"`
}

// CardSearchResponse represents search results
type CardSearchResponse struct {
	Cards      []Card `json:"cards"`
	Total      int64  `json:"total"`
	Page       int    `json:"page"`
	Limit      int    `json:"limit"`
	TotalPages int    `json:"total_pages"`
}

// PriceComparison represents price comparison for a single card from all sources
type PriceComparison struct {
	CardID   string       `json:"card_id"`
	CardName string       `json:"card_name"`
	Prices   []PriceEntry `json:"prices"`
	BestDeal *BestDeal    `json:"best_deal,omitempty"`
}

// PriceEntry represents a single price source entry
type PriceEntry struct {
	Source    string    `json:"source"`
	PriceIDR  *float64  `json:"price_idr,omitempty"`
	PriceUSD  *float64  `json:"price_usd,omitempty"`
	Condition string    `json:"condition"`
	URL       string    `json:"url,omitempty"`
	UpdatedAt time.Time `json:"updated_at,omitempty"`
}

// BestDeal represents the best price found
type BestDeal struct {
	Source   string  `json:"source"`
	Price    float64 `json:"price"`
	Currency string  `json:"currency"`
}

// ArbitrageComparison represents price comparison between markets for arbitrage
type ArbitrageComparison struct {
	CardID               string   `json:"card_id"`
	CardName             string   `json:"card_name"`
	NameID               string   `json:"name_id,omitempty"`
	NameEN               string   `json:"name_en,omitempty"`
	Expansion            string   `json:"expansion"`
	PriceIDR             *float64 `json:"price_idr"`
	PriceUSD             *float64 `json:"price_usd"`
	ExchangeRate         float64  `json:"exchange_rate"`
	PriceIDREquivalent   float64  `json:"price_idr_equivalent"`
	PriceIDREquiv        float64  `json:"price_idr_equiv,omitempty"`
	DifferencePct        float64  `json:"difference_pct,omitempty"`
	PriceDifference      float64  `json:"price_difference"`
	PriceDifferencePct   float64  `json:"price_difference_pct"`
	CheaperIn            string   `json:"cheaper_in"` // "ID" or "US"
	ArbitrageOpportunity bool     `json:"arbitrage_opportunity"`
}

// ArbitrageRequest for arbitrage endpoint
type ArbitrageRequest struct {
	MinProfitMargin float64 `form:"min_margin,default=0.2"`
	Limit           int     `form:"limit,default=20"`
}

// ArbitrageOpportunity represents a single arbitrage opportunity
type ArbitrageOpportunity struct {
	CardID          string  `json:"card_id"`
	CardName        string  `json:"card_name"`
	ExpansionCode   string  `json:"expansion_code"`
	IDRPrice        int64   `json:"idr_price"`
	USDPrice        float64 `json:"usd_price"`
	USDInIDR        float64 `json:"usd_in_idr"`
	ProfitMargin    float64 `json:"profit_margin"`
	PotentialProfit float64 `json:"potential_profit"`
	Recommendation  string  `json:"recommendation"`
}

// ArbitrageResponse for arbitrage endpoint
type ArbitrageResponse struct {
	Opportunities []ArbitrageOpportunity `json:"opportunities"`
	Total         int                    `json:"total"`
	ExchangeRate  float64                `json:"exchange_rate"`
	MinMargin     float64                `json:"min_margin"`
	GeneratedAt   time.Time              `json:"generated_at"`
}

// PricePoint represents a single price history point
type PricePoint struct {
	Price      float64   `json:"price"`
	RecordedAt time.Time `json:"recorded_at"`
}

// PriceHistoryResponse for price history endpoint
type PriceHistoryResponse struct {
	CardID      string       `json:"card_id"`
	Currency    string       `json:"currency"`
	History     []PricePoint `json:"history"`
	Days        int          `json:"days"`
	GeneratedAt time.Time    `json:"generated_at"`
}

// PricePrediction represents AI-powered price forecast
type PricePrediction struct {
	CardID          string    `json:"card_id"`
	CurrentPriceIDR float64   `json:"current_price_idr"`
	PredictedPrice  float64   `json:"predicted_price"`
	PriceRangeMin   float64   `json:"price_range_min"`
	PriceRangeMax   float64   `json:"price_range_max"`
	ConfidenceScore float64   `json:"confidence_score"` // 0.0 - 1.0
	Trend           string    `json:"trend"`            // "up", "down", "stable"
	Sentiment       string    `json:"sentiment"`        // AI analysis summary
	Factors         []string  `json:"factors"`          // Key reasons for prediction
	ForecastDays    int       `json:"forecast_days"`
	UpdatedAt       time.Time `json:"updated_at"`
}

// MarketSummaryResponse for market summary endpoint
type MarketSummaryResponse struct {
	TotalCards        int       `json:"total_cards"`
	CardsWithIDRPrice int       `json:"cards_with_idr_price"`
	CardsWithUSDPrice int       `json:"cards_with_usd_price"`
	ExchangeRate      float64   `json:"exchange_rate"`
	IDRAveragePrice   float64   `json:"idr_average_price"`
	USDAveragePrice   float64   `json:"usd_average_price"`
	LastUpdated       time.Time `json:"last_updated"`
}

// CollectionValueResponse for collection value endpoint
type CollectionValueResponse struct {
	TotalCards   int              `json:"total_cards"`
	TotalIDR     int64            `json:"total_idr"`
	TotalUSD     float64          `json:"total_usd"`
	Items        []CollectionItem `json:"items"`
	ExchangeRate float64          `json:"exchange_rate"`
	CalculatedAt time.Time        `json:"calculated_at"`
}

// Price for price data
type Price struct {
	ID        int        `json:"id"`
	CardID    string     `json:"card_id"`
	Currency  string     `json:"currency"`
	Price     float64    `json:"price"`
	Condition string     `json:"condition"`
	Source    string     `json:"source"`
	URL       string     `json:"url,omitempty"`
	ScrapedAt *time.Time `json:"scraped_at,omitempty"`
}

// Attack represents a card attack
type Attack struct {
	Name        string   `json:"name"`
	Damage      string   `json:"damage"`
	Description string   `json:"description"`
	EnergyCost  []string `json:"energy_cost"`
}

// Ability represents a card ability
type Ability struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	AbilityType string `json:"ability_type"`
}

// CardFilter for search queries
type CardFilter struct {
	Name           string `form:"name"`
	ExpansionCode  string `form:"expansion_code"`
	CardType       string `form:"card_type"`
	RegulationMark string `form:"regulation_mark"`
	Rarity         string `form:"rarity"`
	HPMin          int    `form:"hp_min"`
	HPMax          int    `form:"hp_max"`
	Limit          int    `form:"limit,default=20"`
	Offset         int    `form:"offset,default=0"`
}

// JSONB is a custom type for PostgreSQL JSONB
type JSONB map[string]interface{}

// Scan implements the sql.Scanner interface for JSONB
func (j *JSONB) Scan(value interface{}) error {
	if value == nil {
		*j = nil
		return nil
	}

	switch v := value.(type) {
	case []byte:
		if len(v) == 0 {
			*j = nil
			return nil
		}
		return json.Unmarshal(v, j)
	case string:
		if v == "" {
			*j = nil
			return nil
		}
		return json.Unmarshal([]byte(v), j)
	default:
		return json.Unmarshal(value.([]byte), j)
	}
}

// Value implements the driver.Valuer interface for JSONB
func (j JSONB) Value() (driver.Value, error) {
	if j == nil {
		return nil, nil
	}
	return json.Marshal(j)
}
