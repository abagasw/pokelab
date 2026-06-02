package models

import (
	"time"
)

// Collection represents a user's card collection
type Collection struct {
	ID        string    `json:"id" db:"id"`
	UserID    string    `json:"user_id" db:"user_id"`
	Name      string    `json:"name" db:"name"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
	UpdatedAt time.Time `json:"updated_at" db:"updated_at"`
	
	// Statistics
	TotalCards   int     `json:"total_cards" db:"-"`
	TotalValueIDR float64 `json:"total_value_idr" db:"-"`
	TotalValueUSD float64 `json:"total_value_usd" db:"-"`
	
	// Relations
	Items []CollectionItem `json:"items,omitempty" db:"-"`
}

// CollectionItem represents a card in a collection
type CollectionItem struct {
	ID         int       `json:"id" db:"id"`
	CollectionID string    `json:"collection_id" db:"collection_id"`
	CardID     string    `json:"card_id" db:"card_id"`
	
	// Details
	Quantity    int     `json:"quantity" db:"quantity"`
	Condition   string  `json:"condition" db:"condition"` // NM, LP, MP, HP, DMG
	PurchasePrice *float64 `json:"purchase_price,omitempty" db:"purchase_price"`
	PurchaseCurrency string `json:"purchase_currency,omitempty" db:"purchase_currency"`
	PurchaseDate *time.Time `json:"purchase_date,omitempty" db:"purchase_date"`
	Notes       string  `json:"notes,omitempty" db:"notes"`
	
	CreatedAt time.Time `json:"created_at" db:"created_at"`
	UpdatedAt time.Time `json:"updated_at" db:"updated_at"`
	
	// Relations
	Card *Card `json:"card,omitempty" db:"-"`
}

// CollectionSummary represents summary of a collection
type CollectionSummary struct {
	CollectionID string    `json:"collection_id"`
	Name         string    `json:"name"`
	
	CardCount struct {
		Total    int `json:"total"`
		Unique   int `json:"unique"`
		Pokemon  int `json:"pokemon"`
		Trainer  int `json:"trainer"`
		Energy   int `json:"energy"`
	} `json:"card_count"`
	
	Value struct {
		CurrentIDR   float64 `json:"current_idr"`
		CurrentUSD   float64 `json:"current_usd"`
		PurchaseCost float64 `json:"purchase_cost"`
		ProfitLoss   float64 `json:"profit_loss"`
		ProfitLossPct float64 `json:"profit_loss_pct"`
	} `json:"value"`
	
	Expansions []struct {
		Code  string `json:"code"`
		Name  string `json:"name"`
		Count int    `json:"count"`
	} `json:"expansions"`
	
	// AI Analysis
	DeckSuggestions []struct {
		DeckName     string   `json:"deck_name"`
		Completeness float64  `json:"completeness"` // 0-100%
		MissingCards []string `json:"missing_cards"`
		EstCostIDR   float64  `json:"est_cost_idr"`
	} `json:"deck_suggestions"`
}

// PriceAlert represents a price alert
type PriceAlert struct {
	ID       string    `json:"id" db:"id"`
	UserID   string    `json:"user_id" db:"user_id"`
	CardID   string    `json:"card_id" db:"card_id"`
	
	// Alert conditions
	TargetPrice   float64 `json:"target_price" db:"target_price"`
	TargetCurrency string `json:"target_currency" db:"target_currency"` // IDR or USD
	Condition     string  `json:"condition" db:"condition"` // "below" or "above"
	
	// Status
	IsActive   bool       `json:"is_active" db:"is_active"`
	TriggeredAt *time.Time `json:"triggered_at,omitempty" db:"triggered_at"`
	
	CreatedAt time.Time `json:"created_at" db:"created_at"`
	
	// Relations
	Card *Card `json:"card,omitempty" db:"-"`
}

// CollectionRequest represents request to add/update collection item
type CollectionRequest struct {
	CardID      string     `json:"card_id" validate:"required"`
	Quantity    int        `json:"quantity" validate:"min=1"`
	Condition   string     `json:"condition" validate:"oneof=NM LP MP HP DMG"`
	PurchasePrice *float64 `json:"purchase_price,omitempty"`
	PurchaseCurrency string `json:"purchase_currency,omitempty" default:"IDR"`
	PurchaseDate *time.Time `json:"purchase_date,omitempty"`
	Notes       string     `json:"notes,omitempty"`
}

// PriceAlertRequest represents request to create price alert
type PriceAlertRequest struct {
	CardID         string    `json:"card_id" validate:"required"`
	TargetPrice    float64   `json:"target_price" validate:"gt=0"`
	TargetCurrency string    `json:"target_currency" validate:"oneof=IDR USD"`
	Condition      string    `json:"condition" validate:"oneof=below above"`
}

// ImageRecognitionRequest represents image recognition request
type ImageRecognitionRequest struct {
	ImageBase64 string `json:"image_base64" validate:"required"`
	ImageFormat string `json:"image_format,omitempty" default:"jpeg"` // jpeg, png
}

// ImageRecognitionResponse represents image recognition result
type ImageRecognitionResponse struct {
	Recognized    bool   `json:"recognized"`
	Confidence    float64 `json:"confidence"` // 0-100%
	CardID        *string `json:"card_id,omitempty"`
	CardName      string `json:"card_name,omitempty"`
	ExpansionCode string `json:"expansion_code,omitempty"`
	CollectorNumber string `json:"collector_number,omitempty"`
	
	// Price info
	Prices struct {
		CardtellIDR *float64 `json:"cardtell_idr,omitempty"`
		PriceChartingUSD *float64 `json:"pricecharting_usd,omitempty"`
	} `json:"prices"`
	
	// Related info
	UsedInDecks []string `json:"used_in_decks,omitempty"`
	AlternativeVersions []struct {
		Expansion string  `json:"expansion"`
		Rarity    string  `json:"rarity"`
		PriceIDR  float64 `json:"price_idr"`
	} `json:"alternative_versions,omitempty"`
	
	// AI Commentary
	AIAnalysis string `json:"ai_analysis"`
}

// CollectionAddRequest for adding to collection (legacy compat)
type CollectionAddRequest struct {
	CardID      string  `json:"card_id"`
	Count       int     `json:"count"`
	Condition   string  `json:"condition"`
	PurchasePrice *float64 `json:"purchase_price,omitempty"`
	Notes       string  `json:"notes,omitempty"`
}

// CollectionStats for collection statistics
type CollectionStats struct {
	TotalCards            int                `json:"total_cards"`
	UniqueCards           int                `json:"unique_cards"`
	TotalValueIDR         int64              `json:"total_value_idr"`
	TotalValueUSD         float64            `json:"total_value_usd"`
	ValueChangePercent    float64            `json:"value_change_percent"`
	ConditionDistribution map[string]int     `json:"condition_distribution"`
	ExpansionDistribution map[string]int     `json:"expansion_distribution"`
}

// Alert for price alerts (legacy compat)
type Alert struct {
	ID          string    `json:"id"`
	UserID      string    `json:"user_id"`
	CardID      string    `json:"card_id"`
	Type        string    `json:"type"`
	Target      float64   `json:"target"`
	CreatedAt   time.Time `json:"created_at"`
	TriggeredAt *time.Time `json:"triggered_at,omitempty"`
	Active      bool      `json:"active"`
}

// AlertRequest for creating alerts (legacy compat)
type AlertRequest struct {
	UserID string    `json:"user_id"`
	CardID string    `json:"card_id"`
	Type   string    `json:"type"`
	Target float64   `json:"target"`
}

// Wishlist for user wishlist
type Wishlist struct {
	ID        string    `json:"id"`
	UserID    string    `json:"user_id"`
	Items     []WishlistItem `json:"items,omitempty"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// WishlistItem represents an item in wishlist
type WishlistItem struct {
	CardID   string    `json:"card_id"`
	MaxPrice *float64  `json:"max_price,omitempty"`
	Priority int       `json:"priority"`
	Card     *Card     `json:"card,omitempty"`
}

// ImportResult for import operations
type ImportResult struct {
	Imported int      `json:"imported"`
	Errors   []string `json:"errors"`
}

// DashboardStats represents stats for user dashboard
type DashboardStats struct {
	Collection struct {
		TotalCards      int     `json:"total_cards"`
		TotalValueIDR   float64 `json:"total_value_idr"`
		TotalValueUSD   float64 `json:"total_value_usd"`
		MonthlyChange   float64 `json:"monthly_change"`
	} `json:"collection"`
	
	PriceAlerts struct {
		Active   int `json:"active"`
		Triggered int `json:"triggered"`
	} `json:"price_alerts"`
	
	Market struct {
		TrendingCards []Card `json:"trending_cards"`
		BestDeals     []PriceComparison `json:"best_deals"`
	} `json:"market"`
	
	Recommendations struct {
		CompleteDecks []struct {
			DeckName     string  `json:"deck_name"`
			Completeness float64 `json:"completeness"`
		} `json:"complete_decks"`
		InvestmentOpportunities []Card `json:"investment_opportunities"`
	} `json:"recommendations"`
}

// PortfolioInsight represents deep visual analysis of a collection
type PortfolioInsight struct {
	CollectionID string `json:"collection_id"`
	
	ValueHistory     []ValuePoint        `json:"value_history"`
	TypeDistribution []TypeCount         `json:"type_distribution"`
	RarityDistribution []RarityCount     `json:"rarity_distribution"`
	ExpansionProgress  []ExpansionProgress `json:"expansion_progress"`
	NotableMovements   []PriceMovement     `json:"notable_movements"`
}

type ValuePoint struct {
	Date  string  `json:"date"`
	Value float64 `json:"value"`
}

type TypeCount struct {
	Type  string `json:"type"`
	Count int    `json:"count"`
}

type RarityCount struct {
	Rarity string `json:"rarity"`
	Count  int    `json:"count"`
}

type ExpansionProgress struct {
	Code       string  `json:"code"`
	Name       string  `json:"name"`
	Collected  int     `json:"collected"`
	TotalCards int     `json:"total_cards"`
	Percentage float64 `json:"percentage"`
}

type PriceMovement struct {
	CardID        string  `json:"card_id"`
	Name          string  `json:"name"`
	ChangePercent float64 `json:"change_percent"`
	CurrentPrice  float64 `json:"current_price"`
	Trend         string  `json:"trend"` // up, down
}
