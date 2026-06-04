package models

// MissingCard describes a card the user still needs to complete a deck.
type MissingCard struct {
	CardID                string   `json:"card_id"`
	CardName              string   `json:"card_name"`
	Category              string   `json:"category"`
	RequiredCount         int      `json:"required_count"`
	OwnedCount            int      `json:"owned_count"`
	MissingCount          int      `json:"missing_count"`
	EstimatedPriceIDR     float64  `json:"estimated_price_idr"`
	TotalEstimatedIDR     float64  `json:"total_estimated_idr"`
	BuyPriority           string   `json:"buy_priority"`
	SubstituteSuggestions []string `json:"substitute_suggestions,omitempty"`
}

// ResearchDeckRecommendation ranks a meta deck against a user's inventory.
type ResearchDeckRecommendation struct {
	DeckID                  string        `json:"deck_id"`
	DeckName                string        `json:"deck_name"`
	Archetype               string        `json:"archetype"`
	Tier                    string        `json:"tier"`
	CompletenessPct         float64       `json:"completeness_pct"`
	OwnedCards              int           `json:"owned_cards"`
	RequiredCards           int           `json:"required_cards"`
	MissingCards            []MissingCard `json:"missing_cards"`
	EstimatedUpgradeCostIDR float64       `json:"estimated_upgrade_cost_idr"`
	MetaScore               float64       `json:"meta_score"`
	RecommendationReason    string        `json:"recommendation_reason"`
	AIAdvice                string        `json:"ai_advice,omitempty"`
}

// ResearchRecommendationsResponse is returned by /research/recommendations.
type ResearchRecommendationsResponse struct {
	CollectionID    string                       `json:"collection_id"`
	Recommendations []ResearchDeckRecommendation `json:"recommendations"`
}

// DeckGapAnalysis gives detailed inventory coverage for one deck.
type DeckGapAnalysis struct {
	CollectionID            string        `json:"collection_id"`
	DeckID                  string        `json:"deck_id"`
	DeckName                string        `json:"deck_name"`
	CompletenessPct         float64       `json:"completeness_pct"`
	OwnedCards              int           `json:"owned_cards"`
	RequiredCards           int           `json:"required_cards"`
	MissingCards            []MissingCard `json:"missing_cards"`
	EstimatedUpgradeCostIDR float64       `json:"estimated_upgrade_cost_idr"`
}

// ResearchTournamentStats summarizes competitive results for a deck archetype.
type ResearchTournamentStats struct {
	TournamentCount int `json:"tournament_count"`
	WinCount        int `json:"win_count"`
	Top8Count       int `json:"top8_count"`
}

// ResearchDeckSource identifies the representative list used for the analysis.
type ResearchDeckSource struct {
	DecklistID     string `json:"decklist_id"`
	DecklistName   string `json:"decklist_name"`
	PlayerName     string `json:"player_name"`
	TournamentName string `json:"tournament_name"`
	TournamentDate string `json:"tournament_date"`
	Placement      int    `json:"placement"`
}

// ResearchCategoryBreakdown summarizes inventory coverage by card category.
type ResearchCategoryBreakdown struct {
	Category        string  `json:"category"`
	RequiredCount   int     `json:"required_count"`
	OwnedCount      int     `json:"owned_count"`
	MissingCount    int     `json:"missing_count"`
	CompletenessPct float64 `json:"completeness_pct"`
}

// ResearchDeckStatistics contains aggregate deck numbers for deeper analysis.
type ResearchDeckStatistics struct {
	UniqueCards              int     `json:"unique_cards"`
	TotalCopies              int     `json:"total_copies"`
	PokemonCopies            int     `json:"pokemon_copies"`
	TrainerCopies            int     `json:"trainer_copies"`
	EnergyCopies             int     `json:"energy_copies"`
	MissingUniqueCards       int     `json:"missing_unique_cards"`
	MissingCopies            int     `json:"missing_copies"`
	HighPriorityMissingCards int     `json:"high_priority_missing_cards"`
	AverageCopiesPerCard     float64 `json:"average_copies_per_card"`
	MaxCopies                int     `json:"max_copies"`
	DeckValueIDR             float64 `json:"deck_value_idr"`
	OwnedValueIDR            float64 `json:"owned_value_idr"`
	MissingValueIDR          float64 `json:"missing_value_idr"`
	PriceCoveragePct         float64 `json:"price_coverage_pct"`
	ConsistencyScore         float64 `json:"consistency_score"`
}

// ResearchCardStatistics contains per-card numerical context inside the deck.
type ResearchCardStatistics struct {
	OverallRank         int     `json:"overall_rank"`
	CategoryRank        int     `json:"category_rank"`
	DeckSharePct        float64 `json:"deck_share_pct"`
	OwnedSharePct       float64 `json:"owned_share_pct"`
	MissingSharePct     float64 `json:"missing_share_pct"`
	MissingCostSharePct float64 `json:"missing_cost_share_pct"`
	AvgCopiesWhenSeen   float64 `json:"avg_copies_when_seen"`
	MetaDeckAppearances int     `json:"meta_deck_appearances"`
	MetaTotalCopies     int     `json:"meta_total_copies"`
	CopyDelta           int     `json:"copy_delta"`
	OwnershipStatus     string  `json:"ownership_status"`
}

// ResearchCardUsage explains how one card is used inside a representative decklist.
type ResearchCardUsage struct {
	CardID              string                 `json:"card_id"`
	CardName            string                 `json:"card_name"`
	Category            string                 `json:"category"`
	CardType            string                 `json:"card_type,omitempty"`
	RequiredCount       int                    `json:"required_count"`
	OwnedCount          int                    `json:"owned_count"`
	MissingCount        int                    `json:"missing_count"`
	CoveragePct         float64                `json:"coverage_pct"`
	EstimatedPriceIDR   float64                `json:"estimated_price_idr"`
	TotalMissingCostIDR float64                `json:"total_missing_cost_idr"`
	Role                string                 `json:"role"`
	ImportanceScore     float64                `json:"importance_score"`
	MetaFrequency       int                    `json:"meta_frequency,omitempty"`
	BuyPriority         string                 `json:"buy_priority"`
	Substitutes         []string               `json:"substitutes,omitempty"`
	UsageNote           string                 `json:"usage_note"`
	Statistics          ResearchCardStatistics `json:"statistics"`
}

// ResearchUpgradeStep describes one buy or testing priority.
type ResearchUpgradeStep struct {
	Priority         string  `json:"priority"`
	CardID           string  `json:"card_id"`
	CardName         string  `json:"card_name"`
	MissingCount     int     `json:"missing_count"`
	EstimatedCostIDR float64 `json:"estimated_cost_idr"`
	Reason           string  `json:"reason"`
}

// ResearchTacticalProfile summarizes deterministic deck play patterns.
type ResearchTacticalProfile struct {
	Playstyle    string   `json:"playstyle"`
	GamePlan     []string `json:"game_plan"`
	Strengths    []string `json:"strengths"`
	Weaknesses   []string `json:"weaknesses"`
	KeyCards     []string `json:"key_cards"`
	MatchupNotes []string `json:"matchup_notes"`
}

// ResearchDeckAnalysis is the full PokeLab scout report for one recommended deck.
type ResearchDeckAnalysis struct {
	CollectionID            string                      `json:"collection_id"`
	DeckID                  string                      `json:"deck_id"`
	DeckName                string                      `json:"deck_name"`
	Archetype               string                      `json:"archetype"`
	Tier                    string                      `json:"tier"`
	MetaScore               float64                     `json:"meta_score"`
	CompletenessPct         float64                     `json:"completeness_pct"`
	OwnedCards              int                         `json:"owned_cards"`
	RequiredCards           int                         `json:"required_cards"`
	EstimatedUpgradeCostIDR float64                     `json:"estimated_upgrade_cost_idr"`
	TournamentStats         ResearchTournamentStats     `json:"tournament_stats"`
	DeckSource              ResearchDeckSource          `json:"deck_source"`
	DeckStatistics          ResearchDeckStatistics      `json:"deck_statistics"`
	CategoryBreakdown       []ResearchCategoryBreakdown `json:"category_breakdown"`
	CardUsage               []ResearchCardUsage         `json:"card_usage"`
	MissingCards            []MissingCard               `json:"missing_cards"`
	UpgradePlan             []ResearchUpgradeStep       `json:"upgrade_plan"`
	TacticalProfile         ResearchTacticalProfile     `json:"tactical_profile"`
	DataQualityWarnings     []string                    `json:"data_quality_warnings"`
}

// AntiMetaRecommendation describes a deck or plan that can answer a target meta deck.
type AntiMetaRecommendation struct {
	TargetDeckID    string   `json:"target_deck_id"`
	TargetDeckName  string   `json:"target_deck_name"`
	CounterDeckID   string   `json:"counter_deck_id"`
	CounterDeckName string   `json:"counter_deck_name"`
	Archetype       string   `json:"archetype"`
	CounterScore    float64  `json:"counter_score"`
	TechCards       []string `json:"tech_cards"`
	MatchupNotes    []string `json:"matchup_notes"`
	AIAdvice        string   `json:"ai_advice,omitempty"`
}

// MetaPrediction describes a card likely to become important in the meta.
type MetaPrediction struct {
	CardID            string   `json:"card_id"`
	CardName          string   `json:"card_name"`
	Category          string   `json:"category"`
	CardType          string   `json:"card_type,omitempty"`
	Rarity            string   `json:"rarity,omitempty"`
	Appearances       int      `json:"appearances"`
	TotalCopies       int      `json:"total_copies"`
	PredictionScore   float64  `json:"prediction_score"`
	ConfidencePct     float64  `json:"confidence_pct"`
	MetaSharePct      float64  `json:"meta_share_pct"`
	AverageCopies     float64  `json:"average_copies"`
	VolatilityScore   float64  `json:"volatility_score"`
	AdoptionVelocity  float64  `json:"adoption_velocity"`
	StapleIndex       float64  `json:"staple_index"`
	Trend             string   `json:"trend"`
	ForecastLabel     string   `json:"forecast_label"`
	RecommendedAction string   `json:"recommended_action"`
	Reason            string   `json:"reason"`
	Factors           []string `json:"factors"`
	RiskFactors       []string `json:"risk_factors"`
	ModelSignals      []string `json:"model_signals"`
}

// MetaDeckPrediction describes an archetype likely to rise or remain dominant.
type MetaDeckPrediction struct {
	Archetype              string   `json:"archetype"`
	RepresentativeDeckID   string   `json:"representative_deck_id"`
	RepresentativeDeckName string   `json:"representative_deck_name"`
	PredictedTier          string   `json:"predicted_tier"`
	PredictionScore        float64  `json:"prediction_score"`
	ConfidencePct          float64  `json:"confidence_pct"`
	MomentumScore          float64  `json:"momentum_score"`
	MetaSharePct           float64  `json:"meta_share_pct"`
	DeckCount              int      `json:"deck_count"`
	TournamentCount        int      `json:"tournament_count"`
	WinCount               int      `json:"win_count"`
	Top8Count              int      `json:"top8_count"`
	GrowthSignal           string   `json:"growth_signal"`
	ExpectedRole           string   `json:"expected_role"`
	ForecastReason         string   `json:"forecast_reason"`
	Drivers                []string `json:"drivers"`
	RiskFactors            []string `json:"risk_factors"`
}

// ResearchLabStats summarizes model input coverage for the public lab.
type ResearchLabStats struct {
	TotalDecks             int    `json:"total_decks"`
	TotalArchetypes        int    `json:"total_archetypes"`
	TotalCardSignals       int    `json:"total_card_signals"`
	TotalTournamentSignals int    `json:"total_tournament_signals"`
	ModelVersion           string `json:"model_version"`
}

// ResearchForecastResponse is returned by /research/meta-forecast.
type ResearchForecastResponse struct {
	DeckPredictions []MetaDeckPrediction `json:"deck_predictions"`
	CardPredictions []MetaPrediction     `json:"card_predictions"`
	LabStats        ResearchLabStats     `json:"lab_stats"`
	Methodology     []string             `json:"methodology"`
}

// AIResearchAdvice is the response for contextual research advisor questions.
type AIResearchAdvice struct {
	Question string `json:"question"`
	Answer   string `json:"answer"`
	Context  string `json:"context,omitempty"`
}
