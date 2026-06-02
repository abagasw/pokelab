package models

import (
	"time"
)

// Deck represents a Pokemon TCG deck archetype
type Deck struct {
	ID          string `json:"id" db:"id"`
	UserID      string `json:"user_id,omitempty" db:"user_id"`
	ExternalID  string `json:"external_id,omitempty" db:"external_id"` // From LimitlessTCG
	Name        string `json:"name" db:"name"`
	Description string `json:"description" db:"description"`
	Format      string `json:"format" db:"format"` // Standard, Expanded, etc.
	Archetype   string `json:"archetype" db:"archetype"`

	// Statistics
	TournamentCount int `json:"tournament_count" db:"tournament_count"`
	WinCount        int `json:"win_count" db:"win_count"`
	Top8Count       int `json:"top8_count" db:"top8_count"`

	// Timestamps
	CreatedAt time.Time `json:"created_at" db:"created_at"`
	UpdatedAt time.Time `json:"updated_at" db:"updated_at"`

	// Relations
	Decklists []Decklist `json:"decklists,omitempty" db:"-"`
}

// Decklist represents a specific deck list from tournament
type Decklist struct {
	ID             string `json:"id" db:"id"`
	ExternalID     string `json:"external_id" db:"external_id"` // list_id from LimitlessTCG
	DeckID         string `json:"deck_id" db:"deck_id"`
	TournamentID   string `json:"tournament_id,omitempty" db:"tournament_id"`
	TournamentName string `json:"tournament_name,omitempty" db:"-"`
	TournamentDate string `json:"tournament_date,omitempty" db:"-"`
	Name           string `json:"name,omitempty" db:"name"`

	// Player info
	PlayerName string `json:"player_name" db:"player_name"`
	Placement  int    `json:"placement" db:"placement"`

	// Match record
	WinCount  int `json:"win_count" db:"win_count"`
	LossCount int `json:"loss_count" db:"loss_count"`
	TieCount  int `json:"tie_count" db:"tie_count"`
	Points    int `json:"points" db:"points"`

	// Cards
	Cards []DeckCard `json:"cards,omitempty" db:"-"`

	CreatedAt time.Time `json:"created_at" db:"created_at"`
}

// DeckCard represents a card in a deck
type DeckCard struct {
	ID        int      `json:"id"`
	DeckID    string   `json:"deck_id"`
	CardID    string   `json:"card_id"`
	CardName  string   `json:"card_name"`
	Category  string   `json:"category,omitempty"`
	CardType  string   `json:"card_type,omitempty"`
	ImageURL  string   `json:"image_url,omitempty"`
	Count     int      `json:"count"`
	IsPokemon bool     `json:"is_pokemon"`
	PriceIDR  *float64 `json:"price_idr,omitempty"`
	PriceUSD  *float64 `json:"price_usd,omitempty"`
}

// DeckBuildRequest represents a request to build a deck
type DeckBuildRequest struct {
	Name           string   `json:"name" validate:"required"`
	Budget         *float64 `json:"budget,omitempty"` // In IDR
	BudgetCurrency string   `json:"budget_currency,omitempty" default:"IDR"`

	// Inventory-based building
	UseInventory bool   `json:"use_inventory"`
	CollectionID string `json:"collection_id,omitempty"`

	// Preferences
	PreferredArchetype string   `json:"preferred_archetype,omitempty"`
	RegulationMarks    []string `json:"regulation_marks,omitempty"` // G, H, I, J

	// Card constraints
	MustIncludeCards []string `json:"must_include_cards,omitempty"` // Card names
	AvoidCards       []string `json:"avoid_cards,omitempty"`

	// Source preference
	PreferIndonesia bool `json:"prefer_indonesia,omitempty"` // Prefer cards available in Indonesia
}

// DeckBuildResponse represents AI-generated deck recommendation
type DeckBuildResponse struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Archetype   string `json:"archetype"`

	Cards struct {
		Pokemon []DeckCard `json:"pokemon"`
		Trainer []DeckCard `json:"trainer"`
		Energy  []DeckCard `json:"energy"`
	} `json:"cards"`

	TotalCards int `json:"total_cards"`

	Pricing struct {
		TotalIDR         float64 `json:"total_idr"`
		TotalUSD         float64 `json:"total_usd"`
		WithinBudget     bool    `json:"within_budget"`
		BudgetDifference float64 `json:"budget_difference"`
	} `json:"pricing"`

	// AI Analysis
	Analysis struct {
		Strengths         []string `json:"strengths"`
		Weaknesses        []string `json:"weaknesses"`
		KeyCards          []string `json:"key_cards"`
		Playstyle         string   `json:"playstyle"`
		CompetitiveRating float64  `json:"competitive_rating"` // 0-10
	} `json:"analysis"`

	// Card availability
	AvailableInIndonesia int `json:"available_in_indonesia"`
	TotalCardsInDeck     int `json:"total_cards_in_deck"`

	// Alternatives
	CheaperAlternatives []struct {
		OriginalCard string  `json:"original_card"`
		Alternative  string  `json:"alternative"`
		SavingsIDR   float64 `json:"savings_idr"`
		TradeOff     string  `json:"trade_off"`
	} `json:"cheaper_alternatives,omitempty"`
}

// Tournament represents a Pokemon TCG tournament
type Tournament struct {
	ID          string `json:"id" db:"id"`
	ExternalID  string `json:"external_id" db:"external_id"`
	Name        string `json:"name" db:"name"`
	Date        string `json:"date,omitempty" db:"date"`
	Format      string `json:"format" db:"format"`
	Location    string `json:"location" db:"location"`
	PlayerCount int    `json:"player_count,omitempty" db:"player_count"`

	CreatedAt time.Time `json:"created_at" db:"created_at"`

	// Relations
	Decklists []Decklist `json:"decklists,omitempty" db:"-"`
}

// TournamentStanding represents a player's standing in a tournament
type TournamentStanding struct {
	ID           int    `json:"id"`
	TournamentID string `json:"tournament_id"`
	DecklistID   string `json:"decklist_id,omitempty"`
	PlayerName   string `json:"player_name"`
	DeckName     string `json:"deck_name,omitempty"`
	Placement    int    `json:"placement"`
	Points       int    `json:"points"`
	WinCount     int    `json:"win_count"`
	LossCount    int    `json:"loss_count"`
	TieCount     int    `json:"tie_count"`
}

// MetaAnalysis represents meta analysis data
type MetaAnalysis struct {
	TotalTournaments int `json:"total_tournaments"`
	TotalPlayers     int `json:"total_players"`

	// Top decks (matches frontend expectations)
	TopDecks []struct {
		DeckID     string  `json:"deck_id"`
		Name       string  `json:"name"`
		WinRate    float64 `json:"win_rate"`
		Popularity float64 `json:"popularity"`
	} `json:"top_decks"`

	// Trending cards
	TrendingCards []Card `json:"trending_cards"`

	// Format health
	FormatHealth struct {
		DiversityScore float64 `json:"diversity_score"`
		Tier1DeckCount int     `json:"tier1_deck_count"`
	} `json:"format_health"`

	// Legacy/Extended data
	DeckPopularity []struct {
		DeckID      string  `json:"deck_id"`
		DeckName    string  `json:"deck_name"`
		Appearances int     `json:"appearances"`
		WinRate     float64 `json:"win_rate"`
		Top8Rate    float64 `json:"top8_rate"`
		AvgPriceIDR float64 `json:"avg_price_idr"`
		ValueScore  float64 `json:"value_score"`
	} `json:"deck_popularity,omitempty"`

	AIInsights struct {
		MetaOverview  string   `json:"meta_overview"`
		TopTierDecks  []string `json:"top_tier_decks"`
		BudgetOptions []string `json:"budget_options"`
		TrendingCards []string `json:"trending_cards"`
		Predictions   string   `json:"predictions"`
	} `json:"ai_insights,omitempty"`
}
