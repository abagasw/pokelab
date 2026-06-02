package models

import (
	"time"
)

// Expansion represents a Pokemon TCG expansion/set
type Expansion struct {
	ID            int       `json:"id" db:"id"`
	Code          string    `json:"code" db:"code"` // MA4, SV1S, etc.
	NameID        string    `json:"name_id" db:"name_id"` // Indonesian name
	NameEN        string    `json:"name_en" db:"name_en"` // English name
	SeriesID      *int      `json:"series_id,omitempty" db:"series_id"`
	SeriesNameEN  string    `json:"series_name_en,omitempty" db:"series_name_en"`
	SeriesNameID  string    `json:"series_name_id,omitempty" db:"series_name_id"`
	
	ProductType   string    `json:"product_type" db:"product_type"` // Booster Pack, Deck, etc.
	TotalCards    int       `json:"total_cards" db:"total_cards"`
	ReleasedAt    *time.Time `json:"released_at,omitempty" db:"released_at"`
	
	// Images
	PackImageURL   string `json:"pack_image_url,omitempty" db:"pack_image_url"`
	SetSymbolURL   string `json:"set_symbol_url,omitempty" db:"set_symbol_url"`
	
	CreatedAt time.Time `json:"created_at" db:"created_at"`
	
	// Relations
	Cards []Card `json:"cards,omitempty" db:"-"`
}

// ExpansionSummary represents summary of an expansion
type ExpansionSummary struct {
	Expansion
	CardCount   int     `json:"card_count"`
	AvgPriceIDR float64 `json:"avg_price_idr"`
	AvgPriceUSD float64 `json:"avg_price_usd"`
	
	// Rarity distribution
	RarityDistribution map[string]int `json:"rarity_distribution"`
	
	// Most valuable cards
	TopCards []struct {
		CardID   string `json:"card_id"`
		CardName string `json:"card_name"`
		PriceIDR float64 `json:"price_idr"`
		Rarity   string `json:"rarity"`
	} `json:"top_cards"`
}

// Series represents a Pokemon TCG series
type Series struct {
	ID       int    `json:"id" db:"id"`
	NameEN   string `json:"name_en" db:"name_en"`
	NameID   string `json:"name_id" db:"name_id"`
}

// RegulationMark represents regulation marks (G, H, I, J, etc.)
type RegulationMark struct {
	Mark      string    `json:"mark" db:"mark"` // G, H, I, J
	LegalFrom time.Time `json:"legal_from" db:"legal_from"`
	LegalTo   *time.Time `json:"legal_to,omitempty" db:"legal_to"`
	IsCurrent bool      `json:"is_current" db:"is_current"`
}
