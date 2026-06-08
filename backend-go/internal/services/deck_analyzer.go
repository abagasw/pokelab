package services

import (
	"database/sql"
	"context"
	"fmt"
	"math"
		"sort"
	"strings"
)

// DeckAnalyzer performs advanced deck analysis: consistency, mulligan, brick, matchup.
type DeckAnalyzer struct {
	db *sql.DB
	ai *AIService
}

// NewDeckAnalyzer creates a new DeckAnalyzer.
func NewDeckAnalyzer(db *sql.DB, ai *AIService) *DeckAnalyzer {
	return &DeckAnalyzer{db: db, ai: ai}
}

// ──────────────────────────────────────────────────────────────
// Data structures
// ──────────────────────────────────────────────────────────────

type DeckAnalysisReport struct {
	DeckID       string             `json:"deck_id"`
	DeckName     string             `json:"deck_name"`
	Archetype    string             `json:"archetype"`
	Format       string             `json:"format"`

	// Card composition
	TotalCards   int                `json:"total_cards"`
	PokemonCount int                `json:"pokemon_count"`
	TrainerCount int                `json:"trainer_count"`
	EnergyCount  int                `json:"energy_count"`
	BasicPokemon int                `json:"basic_pokemon"`
	UniqueCards  int                `json:"unique_cards"`

	// Consistency
	Consistency  ConsistencyReport  `json:"consistency"`

	// Mulligan
	Mulligan     MulliganReport     `json:"mulligan"`

	// Brick
	Brick        BrickReport        `json:"brick"`

	// Matchup
	Matchups     []MatchupReport    `json:"matchups"`

	// Curve
	CostCurve    []CurvePoint       `json:"cost_curve"`

	// Engine analysis
	Engine       EngineReport       `json:"engine"`

	// Card roles
	Cards        []AnalyzedCard     `json:"cards"`

	// Turn simulation
	TurnSim      TurnSimulation     `json:"turn_simulation"`

	// Detailed meta matchups
	MetaMatchups []MetaMatchup      `json:"meta_matchups"`

	// AI insights
	AIInsights   string             `json:"ai_insights,omitempty"`
}

type ConsistencyReport struct {
	OpeningHandDraw float64            `json:"opening_hand_draw"` // P(draw at least 1 key card in 7)
	Turn1Supporter  float64            `json:"turn1_supporter"`   // P(draw supporter T1)
	Turn1Energy     float64            `json:"turn1_energy"`      // P(attach energy T1)
	EvolutionTurn2  float64            `json:"evolution_turn2"`   // P(evolve T2)
	DrawPower       int                `json:"draw_power"`        // Total draw/search cards
	SearchPower     int                `json:"search_power"`      // Total search cards
	ConsistencyPct  float64            `json:"consistency_pct"`   // Overall 0-100
	Breakdown       []ConsistencyItem  `json:"breakdown"`
}

type ConsistencyItem struct {
	Name       string  `json:"name"`
	Probability float64 `json:"probability"`
	Formula    string  `json:"formula"`
	Assessment string  `json:"assessment"`
}

type MulliganReport struct {
	MulliganRate     float64 `json:"mulligan_rate"`      // P(no basic in 7)
	ExpectedMulligans float64 `json:"expected_mulligans"` // Per game average
	RiskLevel        string  `json:"risk_level"`         // low/medium/high/critical
	HasBudew         bool    `json:"has_budew"`
	HasCleffa         bool    `json:"has_cleffa"`
	BasicCount       int     `json:"basic_count"`
	Assessment       string  `json:"assessment"`
}

type BrickReport struct {
	BrickRate       float64       `json:"brick_rate"`       // P(dead hand by T3)
	BrickScenarios  []BrickCase   `json:"brick_scenarios"`
	RiskLevel       string        `json:"risk_level"`
	Assessment      string        `json:"assessment"`
}

type BrickCase struct {
	Scenario    string  `json:"scenario"`
	Probability float64 `json:"probability"`
	Severity    string  `json:"severity"`
	Prevention  string  `json:"prevention"`
}

type MatchupReport struct {
	OpponentArchetype string  `json:"opponent_archetype"`
	WinRate           float64 `json:"win_rate"`
	SampleSize        int     `json:"sample_size"`
	Favored           bool    `json:"favored"`
	KeyCards           []string `json:"key_cards"`
	Strategy           string  `json:"strategy"`
}



// TurnSimulation simulates T1/T2 scenarios when hand is bad.
type TurnSimulation struct {
	Turn1          TurnScenario   `json:"turn1"`
	Turn2          TurnScenario   `json:"turn2"`
	RecoveryPaths  []RecoveryPath `json:"recovery_paths"`
	DeadHandRate   float64        `json:"dead_hand_rate"`
	Assessment     string         `json:"assessment"`
}

type TurnScenario struct {
	Turn             int                `json:"turn"`
	HandSize         int                `json:"hand_size"`
	Scenarios        []HandScenario     `json:"scenarios"`
	BestCase         string             `json:"best_case"`
	WorstCase        string             `json:"worst_case"`
	AverageState     string             `json:"average_state"`
}

type HandScenario struct {
	Name        string  `json:"name"`
	Description string  `json:"description"`
	Probability float64 `json:"probability"`
	Severity    string  `json:"severity"`
	Impact      string  `json:"impact"`
}

type RecoveryPath struct {
	CardName    string  `json:"card_name"`
	Action      string  `json:"action"`
	Probability float64 `json:"probability"`
	Result      string  `json:"result"`
}

// MetaMatchup is a detailed matchup report against a specific meta deck.
type MetaMatchup struct {
	OpponentArchetype string            `json:"opponent_archetype"`
	OpponentTier      string            `json:"opponent_tier"`
	WinRate           float64           `json:"win_rate"`
	SampleSize        int               `json:"sample_size"`
	Favored           bool              `json:"favored"`
	ThreatLevel       string            `json:"threat_level"`
	KeyThreats        []ThreatCard      `json:"key_threats"`
	OurKeyCards       []string          `json:"our_key_cards"`
	GamePlan          string            `json:"game_plan"`
	EarlyGame         string            `json:"early_game"`
	MidGame           string            `json:"mid_game"`
	LateGame          string            `json:"late_game"`
	TechSuggestions   []string          `json:"tech_suggestions"`
	SideDeckAdvice    string            `json:"side_deck_advice"`
	TurnByTurn        []TurnPlan        `json:"turn_by_turn"`
}

type ThreatCard struct {
	Name     string `json:"name"`
	Threat   string `json:"threat"`   // "OHKO threat", "Spread damage", "Control", etc.
	Counter  string `json:"counter"`  // How to deal with it
	Danger   int    `json:"danger"`   // 1-10
}

type TurnPlan struct {
	Turn     int    `json:"turn"`
	Priority string `json:"priority"`
	Action   string `json:"action"`
	Notes    string `json:"notes"`
}

type CurvePoint struct {
	Cost  int `json:"cost"`
	Count int `json:"count"`
}

type EngineReport struct {
	DrawCards      int     `json:"draw_cards"`
	SearchCards    int     `json:"search_cards"`
	SwitchCards    int     `json:"switch_cards"`
	HealCards      int     `json:"heal_cards"`
	GustCards      int     `json:"gust_cards"`
	DisruptionCards int    `json:"disruption_cards"`
	EngineScore    float64 `json:"engine_score"` // 0-10
	Weaknesses     []string `json:"weaknesses"`
	Strengths      []string `json:"strengths"`
}

type AnalyzedCard struct {
	CardID      string  `json:"card_id"`
	CardName    string  `json:"card_name"`
	Category    string  `json:"category"`
	CardType    string  `json:"card_type"`
	Count       int     `json:"count"`
	Role        string  `json:"role"`
	Importance  float64 `json:"importance"` // 0-10
	DrawChance  float64 `json:"draw_chance"` // P(at least 1 in opening 7)
	PriceIDR    float64 `json:"price_idr"`
	UsageNote   string  `json:"usage_note"`
}

// ──────────────────────────────────────────────────────────────
// Main analysis function
// ──────────────────────────────────────────────────────────────

func (a *DeckAnalyzer) AnalyzeDeck(ctx context.Context, deckID string) (*DeckAnalysisReport, error) {
	// Load deck info
	deck, err := a.getDeckInfo(ctx, deckID)
	if err != nil {
		return nil, err
	}

	// Load cards
	cards, err := a.loadDeckCards(ctx, deckID)
	if err != nil || len(cards) == 0 {
		return nil, fmt.Errorf("no cards found for deck %s", deckID)
	}

	// Build report
	report := &DeckAnalysisReport{
		DeckID:    deckID,
		DeckName:  deck.Name,
		Archetype: deck.Archetype,
		Format:    deck.Format,
		TotalCards: func() int { t := 0; for _, c := range cards { t += c.Count }; return t }(),
	}

	// Classify cards
	pokemonCards, trainerCards, energyCards := classifyCards(cards)
	report.PokemonCount = len(pokemonCards)
	report.TrainerCount = len(trainerCards)
	report.EnergyCount = len(energyCards)

	// Count basics
	for _, c := range pokemonCards {
		if c.EvolutionStage == "Basic" || c.EvolutionStage == "" {
			report.BasicPokemon += c.Count
		}
	}
	report.UniqueCards = len(cards)

	// Consistency analysis
	report.Consistency = a.analyzeConsistency(cards, trainerCards, pokemonCards)

	// Mulligan analysis
	report.Mulligan = a.analyzeMulligan(cards, report.BasicPokemon)

	// Brick analysis
	report.Brick = a.analyzeBrick(cards, trainerCards)

	// Cost curve
	report.CostCurve = a.analyzeCostCurve(pokemonCards)

	// Engine analysis
	report.Engine = a.analyzeEngine(trainerCards)

	// Card roles
	report.Cards = a.analyzeCardRoles(cards, trainerCards)

	// Matchup analysis from tournament data
	report.Matchups = a.analyzeMatchups(ctx, deck.Archetype)

	// Turn simulation (T1/T2 ampas hands)
	report.TurnSim = a.simulateTurns(cards, trainerCards, pokemonCards, report.BasicPokemon)

	// Detailed meta matchup analysis
	report.MetaMatchups = a.analyzeMetaMatchups(ctx, deck.Archetype, cards)

	// AI insights — deterministic summary (user can request full AI via advisor endpoint)
	report.AIInsights = fmt.Sprintf(
		"Deck %s (%s): %d kartu, %.0f%% consistent, %.0f%% mulligan risk, %.0f%% brick risk, engine %.1f/10. Gunakan AI Advisor untuk analisis mendalam.",
		deck.Name, deck.Archetype, report.TotalCards,
		report.Consistency.ConsistencyPct, report.Mulligan.MulliganRate*100,
		report.Brick.BrickRate*100, report.Engine.EngineScore,
	)

	return report, nil
}

// ──────────────────────────────────────────────────────────────
// Consistency analysis using hypergeometric distribution
// ──────────────────────────────────────────────────────────────

func (a *DeckAnalyzer) analyzeConsistency(cards []deckCard, trainers, pokemon []deckCard) ConsistencyReport {
	report := ConsistencyReport{}

	// Count draw/search supporters
	supporterCount := 0
	searchCount := 0
	drawCount := 0
	for _, t := range trainers {
		role := classifyTrainerRole(t.CardName)
		switch role {
		case "draw":
			drawCount += t.Count
		case "search":
			searchCount += t.Count
		case "supporter":
			supporterCount += t.Count
		}
	}
	report.DrawPower = drawCount + supporterCount
	report.SearchPower = searchCount

	// P(at least 1 Supporter in 7 cards) using hypergeometric
	total := 60.0
	hand := 7.0
	if total > 0 && supporterCount > 0 {
		p := 1.0 - hypergeomPMF(0, total, float64(supporterCount), hand)
		report.Turn1Supporter = roundPct(p)
	}

	// P(at least 1 Basic Pokemon in 7)
	basics := 0
	for _, p := range pokemon {
		if p.EvolutionStage == "Basic" || p.EvolutionStage == "" {
			basics += p.Count
		}
	}
	if basics > 0 {
		report.OpeningHandDraw = roundPct(1.0 - hypergeomPMF(0, 60, float64(basics), 7))
	}

	// P(energy in 7)
	energyCount := 0
	for _, c := range cards {
		if c.Category == "Energy" {
			energyCount += c.Count
		}
	}
	if energyCount > 0 {
		report.Turn1Energy = roundPct(1.0 - hypergeomPMF(0, 60, float64(energyCount), 7))
	}

	// Evolution T2: P(drawing Stage 1 by T2 = 7+1=8 cards)
	stage1Count := 0
	for _, p := range pokemon {
		if p.EvolutionStage == "Stage 1" {
			stage1Count += p.Count
		}
	}
	if stage1Count > 0 {
		report.EvolutionTurn2 = roundPct(1.0 - hypergeomPMF(0, 60, float64(stage1Count), 8))
	}

	// Overall consistency score
	report.ConsistencyPct = roundPct((report.OpeningHandDraw*0.30 + report.Turn1Supporter*0.30 + report.Turn1Energy*0.25 + report.EvolutionTurn2*0.15) * 100)

	// Breakdown
	report.Breakdown = []ConsistencyItem{
		{Name: "Opening Basic", Probability: report.OpeningHandDraw, Formula: "P ≥ 1 basic in 7", Assessment: assessProb(report.OpeningHandDraw)},
		{Name: "Turn 1 Supporter", Probability: report.Turn1Supporter, Formula: "P ≥ 1 supporter in 7", Assessment: assessProb(report.Turn1Supporter)},
		{Name: "Turn 1 Energy", Probability: report.Turn1Energy, Formula: "P ≥ 1 energy in 7", Assessment: assessProb(report.Turn1Energy)},
		{Name: "Evolution Turn 2", Probability: report.EvolutionTurn2, Formula: "P ≥ 1 Stage 1 in 8", Assessment: assessProb(report.EvolutionTurn2)},
	}

	return report
}

// ──────────────────────────────────────────────────────────────
// Mulligan analysis
// ──────────────────────────────────────────────────────────────

func (a *DeckAnalyzer) analyzeMulligan(cards []deckCard, basicCount int) MulliganReport {
	report := MulliganReport{
		BasicCount: basicCount,
	}

	// P(no basic in 7) = C(53,7)/C(60,7) if 7 basics, etc.
	nonBasic := 60 - basicCount
	if basicCount > 0 && nonBasic >= 7 {
		report.MulliganRate = roundPct(hypergeomPMF(0, 60, float64(basicCount), 7))
	} else if basicCount == 0 {
		report.MulliganRate = 1.0
	}

	report.ExpectedMulligans = report.MulliganRate * 2.0 // Approximate per game

	// Check for Budew/Cleffa (Mulligan recovery)
	for _, c := range cards {
		lower := strings.ToLower(c.CardName)
		if strings.Contains(lower, "budew") {
			report.HasBudew = true
		}
		if strings.Contains(lower, "cleffa") {
			report.HasCleffa = true
		}
	}

	// Risk level
	switch {
	case report.MulliganRate < 0.01:
		report.RiskLevel = "low"
		report.Assessment = "Sangat aman — hampir tidak pernah mulligan."
	case report.MulliganRate < 0.05:
		report.RiskLevel = "low"
		report.Assessment = "Aman — mulligan jarang terjadi."
	case report.MulliganRate < 0.15:
		report.RiskLevel = "medium"
		report.Assessment = "Cukup aman, tapi sesekali mulligan. Pastikan ada draw support."
	case report.MulliganRate < 0.30:
		report.RiskLevel = "high"
		report.Assessment = "Risiko mulligan cukup tinggi. Tambahkan lebih banyak Basic Pokemon."
	default:
		report.RiskLevel = "critical"
		report.Assessment = "KRITIS — terlalu sedikit Basic Pokemon! Deck sering mulligan."
	}

	return report
}

// ──────────────────────────────────────────────────────────────
// Brick analysis
// ──────────────────────────────────────────────────────────────

func (a *DeckAnalyzer) analyzeBrick(cards []deckCard, trainers []deckCard) BrickReport {
	report := BrickReport{}
	var scenarios []BrickCase

	drawCards := 0
	searchCards := 0
	energyCards := 0
	pokemonCards := 0
	for _, c := range cards {
		switch c.Category {
		case "Energy":
			energyCards += c.Count
		case "Pokemon":
			pokemonCards += c.Count
		}
	}
	for _, t := range trainers {
		role := classifyTrainerRole(t.CardName)
		if role == "draw" || role == "supporter" {
			drawCards += t.Count
		}
		if role == "search" {
			searchCards += t.Count
		}
	}

	// Scenario 1: All energy opening hand
	if energyCards > 0 {
		pAllEnergy := hypergeomPMF(7, 60, float64(energyCards), 7)
		if pAllEnergy > 0.001 {
			scenarios = append(scenarios, BrickCase{
				Scenario:    "Opening hand semua Energy",
				Probability: roundPct(pAllEnergy),
				Severity:    "high",
				Prevention:  "Tambahkan Pokemon dan Trainer yang bisa di-attach",
			})
		}
	}

	// Scenario 2: No draw support by T3 (7+2=9 cards)
	if drawCards > 0 {
		pNoDraw := hypergeomPMF(0, 60, float64(drawCards), 9)
		if pNoDraw > 0.01 {
			scenarios = append(scenarios, BrickCase{
				Scenario:    "Tidak ada draw support sampai T3",
				Probability: roundPct(pNoDraw),
				Severity:    "medium",
				Prevention:  "Tambahkan Supporter draw (Prof. Research, Iono)",
			})
		}
	}

	// Scenario 3: Too many pokemon, not enough trainers
	if pokemonCards > 25 && len(trainers) < 15 {
		scenarios = append(scenarios, BrickCase{
			Scenario:    "Terlalu banyak Pokemon, Trainer kurang",
			Probability: 0.30,
			Severity:    "medium",
			Prevention:  "Kurangi Pokemon, tambah Trainer support",
		})
	}

	// Overall brick rate = average of scenario probabilities
	totalProb := 0.0
	for _, s := range scenarios {
		totalProb += s.Probability
	}
	if len(scenarios) > 0 {
		report.BrickRate = roundPct(totalProb / float64(len(scenarios)))
	}
	report.BrickScenarios = scenarios

	switch {
	case report.BrickRate < 0.05:
		report.RiskLevel = "low"
		report.Assessment = "Deck sangat konsisten — brick jarang terjadi."
	case report.BrickRate < 0.15:
		report.RiskLevel = "medium"
		report.Assessment = "Ada beberapa brick scenario, tapi masih manageable."
	default:
		report.RiskLevel = "high"
		report.Assessment = "Brick risk tinggi! Perlu optimasi engine dan komposisi kartu."
	}

	return report
}

// ──────────────────────────────────────────────────────────────
// Matchup analysis from tournament data
// ──────────────────────────────────────────────────────────────

func (a *DeckAnalyzer) analyzeMatchups(ctx context.Context, archetype string) []MatchupReport {
	if archetype == "" || a.db == nil {
		return []MatchupReport{}
	}

	rows, err := a.db.QueryContext(ctx, `
		SELECT d2.archetype, COUNT(*) as matches,
		       SUM(CASE WHEN COALESCE(dl1.placement,99) < COALESCE(dl2.placement,99) THEN 1 ELSE 0 END) as wins
		FROM decklists dl1
		JOIN decks d1 ON d1.id = dl1.deck_id
		JOIN decklists dl2 ON dl2.tournament_id = dl1.tournament_id AND dl2.deck_id != dl1.deck_id
		JOIN decks d2 ON d2.id = dl2.deck_id
		WHERE d1.archetype = ? AND d2.archetype != ''
		GROUP BY d2.archetype
		HAVING matches >= 1
		ORDER BY matches DESC
		LIMIT 10
	`, archetype)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var matchups []MatchupReport
	for rows.Next() {
		var m MatchupReport
		var matches, wins int
		if rows.Scan(&m.OpponentArchetype, &matches, &wins) == nil {
			m.SampleSize = matches
			if matches > 0 {
				m.WinRate = roundPct(float64(wins) / float64(matches))
			}
			m.Favored = m.WinRate > 0.50
			if m.WinRate >= 0.60 {
				m.Strategy = fmt.Sprintf("Favored matchup — %s punya advantage melawan %s.", archetype, m.OpponentArchetype)
			} else if m.WinRate <= 0.40 {
				m.Strategy = fmt.Sprintf("Unfavored — butuh side deck atau tech card untuk %s.", m.OpponentArchetype)
			} else {
				m.Strategy = "Even matchup — skill dan sequencing sangat menentukan."
			}
			matchups = append(matchups, m)
		}
	}
	return matchups
}


// ──────────────────────────────────────────────────────────────
// Engine analysis
// ──────────────────────────────────────────────────────────────

func (a *DeckAnalyzer) analyzeEngine(trainers []deckCard) EngineReport {
	report := EngineReport{}
	strengths := []string{}
	weaknesses := []string{}

	for _, t := range trainers {
		role := classifyTrainerRole(t.CardName)
		switch role {
		case "draw":
			report.DrawCards += t.Count
		case "search":
			report.SearchCards += t.Count
		case "switch":
			report.SwitchCards += t.Count
		case "heal":
			report.HealCards += t.Count
		case "gust":
			report.GustCards += t.Count
		case "disruption":
			report.DisruptionCards += t.Count
		}
	}

	// Engine score (0-10)
	score := 5.0
	if report.DrawCards >= 8 { score += 1; strengths = append(strengths, "Draw power kuat") } else if report.DrawCards < 4 { score -= 1; weaknesses = append(weaknesses, "Draw power kurang") }
	if report.SearchCards >= 6 { score += 1; strengths = append(strengths, "Search konsisten") } else if report.SearchCards < 2 { score -= 1; weaknesses = append(weaknesses, "Search terbatas") }
	if report.SwitchCards >= 4 { score += 0.5; strengths = append(strengths, "Mobility baik") } else if report.SwitchCards < 2 { score -= 0.5; weaknesses = append(weaknesses, "Switch kurang — mudah terjebak") }
	if report.GustCards >= 2 { score += 0.5; strengths = append(strengths, "Gust effect tersedia") }
	if report.DisruptionCards >= 3 { score += 0.5; strengths = append(strengths, "Disruption kuat") }

	report.EngineScore = math.Max(0, math.Min(10, roundPct(score)))
	report.Strengths = strengths
	report.Weaknesses = weaknesses
	return report
}

// ──────────────────────────────────────────────────────────────
// Cost curve
// ──────────────────────────────────────────────────────────────

func (a *DeckAnalyzer) analyzeCostCurve(pokemon []deckCard) []CurvePoint {
	curve := map[int]int{}
	for _, p := range pokemon {
		cost := p.AttackCost
		if cost > 4 { cost = 4 }
		curve[cost] += p.Count
	}
	var points []CurvePoint
	for cost, count := range curve {
		points = append(points, CurvePoint{Cost: cost, Count: count})
	}
	sort.Slice(points, func(i, j int) bool { return points[i].Cost < points[j].Cost })
	return points
}

// ──────────────────────────────────────────────────────────────
// Card roles
// ──────────────────────────────────────────────────────────────

func (a *DeckAnalyzer) analyzeCardRoles(cards, trainers []deckCard) []AnalyzedCard {
	var analyzed []AnalyzedCard
	for _, c := range cards {
		ac := AnalyzedCard{
			CardID:   c.CardID,
			CardName: c.CardName,
			Category: c.Category,
			CardType: c.CardType,
			Count:    c.Count,
			PriceIDR: c.PriceIDR,
		}
		// Role
		if c.Category == "Pokemon" {
			if c.EvolutionStage == "Basic" && c.HP >= 130 {
				ac.Role = "attacker"
				ac.Importance = 8
			} else if c.EvolutionStage == "Basic" {
				ac.Role = "basic/setup"
				ac.Importance = 6
			} else {
				ac.Role = "evolution/attacker"
				ac.Importance = 7
			}
		} else if c.Category == "Energy" {
			ac.Role = "energy"
			ac.Importance = 5
		} else {
			ac.Role = classifyTrainerRole(c.CardName)
			ac.Importance = 6
		}

		// Draw chance: P(at least 1 in 7)
		if c.Count > 0 {
			ac.DrawChance = roundPct(1.0 - hypergeomPMF(0, 60, float64(c.Count), 7))
		}

		ac.UsageNote = generateUsageNote(c, ac.Role)
		analyzed = append(analyzed, ac)
	}
	sort.Slice(analyzed, func(i, j int) bool { return analyzed[i].Importance > analyzed[j].Importance })
	return analyzed
}

// ──────────────────────────────────────────────────────────────
// Helper types and functions
// ──────────────────────────────────────────────────────────────

type deckCard struct {
	CardID         string
	CardName       string
	Category       string
	CardType       string
	EvolutionStage string
	HP             int
	Count          int
	AttackCost     int
	PriceIDR       float64
	IsPokemon      bool
}

type deckInfo struct {
	Name      string
	Archetype string
	Format    string
}

func (a *DeckAnalyzer) getDeckInfo(ctx context.Context, deckID string) (*deckInfo, error) {
	var d deckInfo
	err := a.db.QueryRowContext(ctx, `
		SELECT name, COALESCE(archetype,''), COALESCE(format,'Standard')
		FROM decks WHERE id = ?
	`, deckID).Scan(&d.Name, &d.Archetype, &d.Format)
	if err != nil {
		return nil, err
	}
	return &d, nil
}

func (a *DeckAnalyzer) loadDeckCards(ctx context.Context, deckID string) ([]deckCard, error) {
	rows, err := a.db.QueryContext(ctx, `
		SELECT dc.card_id, COALESCE(c.name_id, dc.card_id), COALESCE(c.category,''),
		       COALESCE(c.card_type,''), COALESCE(c.evolution_stage,''),
		       COALESCE(c.hp,0), dc.count, COALESCE(c.retreat_cost,0),
		       (SELECT MIN(cp.price_idr) FROM card_prices cp WHERE cp.card_id = dc.card_id AND cp.price_idr > 0),
		       dc.is_pokemon
		FROM deck_cards dc
		LEFT JOIN cards c ON dc.card_id = c.id
		WHERE dc.deck_id = ?
		ORDER BY dc.is_pokemon DESC, c.category, c.name_id
	`, deckID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cards []deckCard
	for rows.Next() {
		var c deckCard
		var price sql.NullFloat64
		var isPokemon sql.NullBool
		if err := rows.Scan(&c.CardID, &c.CardName, &c.Category, &c.CardType,
			&c.EvolutionStage, &c.HP, &c.Count, &c.AttackCost, &price, &isPokemon); err == nil {
			if price.Valid { c.PriceIDR = price.Float64 }
			if isPokemon.Valid { c.IsPokemon = isPokemon.Bool }
			cards = append(cards, c)
		}
	}
	return cards, nil
}

func classifyCards(cards []deckCard) (pokemon, trainers, energy []deckCard) {
	for _, c := range cards {
		switch c.Category {
		case "Pokemon":
			pokemon = append(pokemon, c)
		case "Energy":
			energy = append(energy, c)
		default:
			trainers = append(trainers, c)
		}
	}
	return
}

func classifyTrainerRole(name string) string {
	lower := strings.ToLower(name)
	switch {
	case strings.Contains(lower, "research") || strings.Contains(lower, "iono") || strings.Contains(lower, "professor") || strings.Contains(lower, "cheren") || strings.Contains(lower, "hilda") || strings.Contains(lower, "judge") || strings.Contains(lower, "n ") || strings.Contains(lower, "bianca"):
		return "draw"
	case strings.Contains(lower, "ball") || strings.Contains(lower, "candy") || strings.Contains(lower, "vessel") || strings.Contains(lower, "rod") || strings.Contains(lower, "earthen") || strings.Contains(lower, "poffin") || strings.Contains(lower, "pokégear") || strings.Contains(lower, "poképad"):
		return "search"
	case strings.Contains(lower, "switch") || strings.Contains(lower, "escape") || strings.Contains(lower, "retreat") || strings.Contains(lower, "rope") || strings.Contains(lower, "board"):
		return "switch"
	case strings.Contains(lower, "heal") || strings.Contains(lower, "potion") || strings.Contains(lower, "nurse") || strings.Contains(lower, "berry"):
		return "heal"
	case strings.Contains(lower, "catcher") || strings.Contains(lower, "boss") || strings.Contains(lower, "counter catcher") || strings.Contains(lower, "perintah"):
		return "gust"
	case strings.Contains(lower, "hamm") || strings.Contains(lower, "crushing") || strings.Contains(lower, "e Hammer") || strings.Contains(lower, "handiwork") || strings.Contains(lower, "lost city") || strings.Contains(lower, "path"):
		return "disruption"
	default:
		return "utility"
	}
}

func generateUsageNote(c deckCard, role string) string {
	switch role {
	case "attacker":
		return fmt.Sprintf("Main attacker — %d HP, focus on setting up", c.HP)
	case "draw":
		return "Draw support — gunakan T1 untuk setup hand"
	case "search":
		return "Search — cari kartu kunci untuk combo"
	case "gust":
		return "Gust — tarik target lawan untuk KO"
	case "switch":
		return "Switch — hindari active lock"
	case "disruption":
		return "Disruption — ganggu setup lawan"
	default:
		return ""
	}
}

// hypergeomPMF calculates P(X=k) for hypergeometric distribution
// N = population, K = success states, n = draws, k = observed successes
func hypergeomPMF(k int, N, K, n float64) float64 {
	if K > N || n > N || k > int(K) || k > int(n) {
		if k == 0 && K < n {
			return 1.0
		}
		return 0.0
	}
	return math.Exp(lnComb(K, float64(k)) + lnComb(N-K, n-float64(k)) - lnComb(N, n))
}

// lnComb calculates ln(C(n,k))
func lnComb(n, k float64) float64 {
	if k < 0 || k > n {
		return math.Inf(-1)
	}
	if k == 0 || k == n {
		return 0
	}
	if k > n-k {
		k = n - k
	}
	result := 0.0
	for i := 1.0; i <= k; i++ {
		result += math.Log(n-i+1) - math.Log(i)
	}
	return result
}

func roundPct(v float64) float64 {
	return math.Round(v*1000) / 1000
}

func assessProb(p float64) string {
	switch {
	case p >= 0.95: return "Excellent"
	case p >= 0.85: return "Good"
	case p >= 0.70: return "Acceptable"
	case p >= 0.50: return "Risky"
	default: return "Poor"
	}
}

// ──────────────────────────────────────────────────────────────
// Turn simulation: T1/T2 ampas hands
// ──────────────────────────────────────────────────────────────

func (a *DeckAnalyzer) simulateTurns(cards, trainers, pokemon []deckCard, basicCount int) TurnSimulation {
	sim := TurnSimulation{}

	// Count key card categories
	drawCards := 0
	searchCards := 0
	supporterCards := 0
	energyCards := 0
	pokemonCards := 0
	switchCards := 0
	for _, c := range cards {
		switch c.Category {
		case "Energy":
			energyCards += c.Count
		case "Pokemon":
			pokemonCards += c.Count
		}
	}
	for _, t := range trainers {
		role := classifyTrainerRole(t.CardName)
		switch role {
		case "draw":
			drawCards += t.Count
			supporterCards += t.Count
		case "search":
			searchCards += t.Count
		case "switch":
			switchCards += t.Count
		}
	}

	// ── Turn 1 (7 cards in hand) ──
	sim.Turn1 = TurnScenario{
		Turn:     1,
		HandSize: 7,
		Scenarios: []HandScenario{},
	}

	// Scenario: No basic Pokemon
	pNoBasic := hypergeomPMF(0, 60, float64(basicCount), 7)
	sim.Turn1.Scenarios = append(sim.Turn1.Scenarios, HandScenario{
		Name:        "Tidak ada Basic Pokemon",
		Description: "Harus mulligan — kehilangan tempo dan lawan tahu deck kamu.",
		Probability: roundPct(pNoBasic),
		Severity:    "critical",
		Impact:      "Mulligan, lawan dapat info free + mungkin dapat prize advantage",
	})

	// Scenario: No energy in hand
	pNoEnergy := hypergeomPMF(0, 60, float64(energyCards), 7)
	sim.Turn1.Scenarios = append(sim.Turn1.Scenarios, HandScenario{
		Name:        "Tidak ada Energy di hand",
		Description: "Tidak bisa attach energy T1 — attacker mati 1 turn.",
		Probability: roundPct(pNoEnergy),
		Severity:    "high",
		Impact:      "Tidak bisa attack T2, lawan dapat free setup turn",
	})

	// Scenario: No supporter/draw
	pNoSupporter := hypergeomPMF(0, 60, float64(supporterCards), 7)
	sim.Turn1.Scenarios = append(sim.Turn1.Scenarios, HandScenario{
		Name:        "Tidak ada Supporter/draw T1",
		Description: "Hand stagnant — hanya bisa pass dan pray.",
		Probability: roundPct(pNoSupporter),
		Severity:    "high",
		Impact:      "Tidak bisa dig deeper, stuck dengan 7 kartu random",
	})

	// Scenario: All trainers no pokemon
	pAllTrainers := 0.0
	if energyCards+pokemonCards < 7 {
		pAllTrainers = hypergeomPMF(7, 60, float64(len(trainers)), 7)
	}
	if pAllTrainers > 0.001 {
		sim.Turn1.Scenarios = append(sim.Turn1.Scenarios, HandScenario{
			Name:        "Hand semua Trainer",
		Description: "Tidak ada Pokemon untuk dimainkan — dead hand.",
		Probability: roundPct(pAllTrainers),
		Severity:    "high",
		Impact:      "Tidak ada board state, mulligan berikutnya",
		})
	}

	// Scenario: Only 1 basic, no search
	pOneBasicNoSearch := 0.0
	if basicCount > 0 && searchCards > 0 {
		pOneBasic := hypergeomPMF(1, 60, float64(basicCount), 7)
		pNoSearch := hypergeomPMF(0, 60, float64(searchCards), 7)
		pOneBasicNoSearch = pOneBasic * pNoSearch
	}
	if pOneBasicNoSearch > 0.01 {
		sim.Turn1.Scenarios = append(sim.Turn1.Scenarios, HandScenario{
			Name:        "1 Basic, tidak ada search",
			Description: "Hanya 1 Pokemon di field — sangat vulnerable ke gust/counter.",
			Probability: roundPct(pOneBasicNoSearch),
			Severity:    "medium",
			Impact:      "Jika lawan punya Boss/gust, game langsung selesai",
		})
	}

	// Best/worst case
	sim.Turn1.BestCase = fmt.Sprintf("Basic + Energy + Supporter — full setup T1 (P=%.0f%%)", (1.0-pNoBasic)*(1.0-pNoEnergy)*(1.0-pNoSupporter)*100)
	sim.Turn1.WorstCase = fmt.Sprintf("Mulligan atau dead hand — kehilangan tempo (P=%.0f%%)", (pNoBasic+pNoSupporter)*100)
	sim.Turn1.AverageState = fmt.Sprintf("Rata-rama: %d Pokemon, %d Energy, %d draw di hand", basicCount/3, energyCards*7/60, supporterCards*7/60)

	// ── Turn 2 (7+1=8 cards, opponent sudah 1 prize) ──
	sim.Turn2 = TurnScenario{
		Turn:     2,
		HandSize: 8,
		Scenarios: []HandScenario{},
	}

	// Scenario: Still no evolution after T1
	stage1Count := 0
	for _, p := range pokemon {
		if p.EvolutionStage == "Stage 1" {
			stage1Count += p.Count
		}
	}
	if stage1Count > 0 {
		pNoEvoT2 := hypergeomPMF(0, 59, float64(stage1Count), 8) // 59 cards left in deck
		sim.Turn2.Scenarios = append(sim.Turn2.Scenarios, HandScenario{
			Name:        "Belum evolve sampai T2",
			Description: "Basic Pokemon masih sendirian — mudah di-KO lawan.",
			Probability: roundPct(pNoEvoT2),
			Severity:    "high",
			Impact:      "Lawan bisa KO basic kamu sebelum evolve, +1 prize",
		})
	}

	// Scenario: No draw power by T2 (8 cards seen)
	pNoDrawT2 := hypergeomPMF(0, 59, float64(drawCards), 8)
	if pNoDrawT2 > 0.01 {
		sim.Turn2.Scenarios = append(sim.Turn2.Scenarios, HandScenario{
			Name:        "Masih belum draw T2",
			Description: "2 turn tanpa draw — hand sangat kering.",
			Probability: roundPct(pNoDrawT2),
			Severity:    "critical",
			Impact:      "Hampir pasti kalah — deck engine sangat lemah",
		})
	}

	// Scenario: Opponent already has attacker online
	sim.Turn2.Scenarios = append(sim.Turn2.Scenarios, HandScenario{
		Name:        "Lawan sudah attacker online T2",
		Description: "Meta deck seperti Dragapult/Zoroark bisa attack T2 dengan 180+ damage.",
		Probability: 0.40, // Approximate — most meta decks can attack by T2
		Severity:    "high",
		Impact:      "Jika kamu belum setup, lawan bisa snowball dari sini",
	})

	// ── Recovery Paths ──
	// What cards can save a bad hand?
	if drawCards > 0 {
		recoveryProb := 1.0 - hypergeomPMF(0, 53, float64(drawCards), 1) // Topdeck
		sim.RecoveryPaths = append(sim.RecoveryPaths, RecoveryPath{
			CardName:    "Draw Supporter",
			Action:      "Topdeck draw supporter untuk refresh hand",
			Probability: roundPct(recoveryProb),
			Result:      "Draw 3-4 kartu baru — bisa selamatkan game",
		})
	}
	if searchCards > 0 {
		recoveryProb := 1.0 - hypergeomPMF(0, 53, float64(searchCards), 1)
		sim.RecoveryPaths = append(sim.RecoveryPaths, RecoveryPath{
			CardName:    "Search Card (Ball/Vessel)",
			Action:      "Topdeck search untuk cari kartu kunci",
			Probability: roundPct(recoveryProb),
			Result:      "Cari Pokemon atau Energy yang dibutuhkan",
		})
	}
	if switchCards > 0 {
		sim.RecoveryPaths = append(sim.RecoveryPaths, RecoveryPath{
			CardName:    "Switch/Escape",
			Action:      "Hindari active lock dari lawan",
			Probability: roundPct(1.0 - hypergeomPMF(0, 53, float64(switchCards), 1)),
			Result:      "Ganti attacker — lanjutkan gameplan",
		})
	}

	// Dead hand rate
	deadRate := pNoBasic
	if pNoSupporter > deadRate {
		deadRate = pNoSupporter
	}
	sim.DeadHandRate = roundPct(deadRate)

	switch {
	case sim.DeadHandRate < 0.05:
		sim.Assessment = "Deck sangat konsisten — ampas hand sangat jarang."
	case sim.DeadHandRate < 0.15:
		sim.Assessment = "Kadang ampas, tapi recovery paths tersedia."
	case sim.DeadHandRate < 0.30:
		sim.Assessment = "Cukup sering ampas T1/T2 — perlu tambah draw/search support."
	default:
		sim.Assessment = "SANGAT SERING AMPAS! Deck butuh overhaul engine."
	}

	return sim
}

// ──────────────────────────────────────────────────────────────
// Detailed meta matchup analysis
// ──────────────────────────────────────────────────────────────

func (a *DeckAnalyzer) analyzeMetaMatchups(ctx context.Context, archetype string, ourCards []deckCard) []MetaMatchup {
	if archetype == "" || a.db == nil {
		return []MetaMatchup{}
	}

	// Get top meta archetypes with win rates
	rows, err := a.db.QueryContext(ctx, `
		SELECT d2.archetype, COUNT(*) as matches,
		       SUM(CASE WHEN COALESCE(dl1.placement,99) < COALESCE(dl2.placement,99) THEN 1 ELSE 0 END) as wins,
		       COALESCE(MAX(d2.tournament_count),0)
		FROM decklists dl1
		JOIN decks d1 ON d1.id = dl1.deck_id
		JOIN decklists dl2 ON dl2.tournament_id = dl1.tournament_id AND dl2.deck_id != dl1.deck_id
		JOIN decks d2 ON d2.id = dl2.deck_id
		WHERE d1.archetype = ? AND d2.archetype != ''
		GROUP BY d2.archetype
		HAVING matches >= 1
		ORDER BY matches DESC
		LIMIT 5
	`, archetype)
	if err != nil {
		return []MetaMatchup{}
	}
	defer rows.Close()

	// Build our card name set for counter analysis
	ourCardNames := map[string]bool{}
	for _, c := range ourCards {
		ourCardNames[strings.ToLower(c.CardName)] = true
	}

	var matchups []MetaMatchup
	for rows.Next() {
		var m MetaMatchup
		var matches, wins, tourneyCnt int
		if rows.Scan(&m.OpponentArchetype, &matches, &wins, &tourneyCnt) != nil {
			continue
		}
		m.SampleSize = matches
		if matches > 0 {
			m.WinRate = roundPct(float64(wins) / float64(matches))
		}
		m.Favored = m.WinRate > 0.50

		// Tier assignment
		switch {
		case tourneyCnt >= 5:
			m.OpponentTier = "S"
		case tourneyCnt >= 3:
			m.OpponentTier = "A"
		default:
			m.OpponentTier = "B"
		}

		// Threat level
		switch {
		case m.WinRate >= 0.60:
			m.ThreatLevel = "low"
		case m.WinRate >= 0.45:
			m.ThreatLevel = "medium"
		default:
			m.ThreatLevel = "high"
		}

		// Key threats (generic — based on archetype pattern)
		m.KeyThreats = generateGenericThreats(m.OpponentArchetype)
		m.OurKeyCards = nil // skip per-matchup query

		// Game plan based on archetype matchup
		m.GamePlan = generateGamePlan(archetype, m.OpponentArchetype, m.Favored, m.WinRate)
		m.EarlyGame = generateEarlyGame(archetype, m.OpponentArchetype)
		m.MidGame = generateMidGame(archetype, m.OpponentArchetype, m.Favored)
		m.LateGame = generateLateGame(archetype, m.OpponentArchetype, m.Favored)

		// Turn-by-turn plan
		m.TurnByTurn = generateTurnByTurn(archetype, m.OpponentArchetype, m.Favored)

		// Tech suggestions
		m.TechSuggestions = generateTechSuggestions(archetype, m.OpponentArchetype, ourCardNames)
		m.SideDeckAdvice = generateSideDeckAdvice(archetype, m.OpponentArchetype, m.Favored)

		matchups = append(matchups, m)
	}
	return matchups
}

func (a *DeckAnalyzer) loadThreatCards(ctx context.Context, opponentArchetype string, ourCards map[string]bool) []ThreatCard {
	rows, err := a.db.QueryContext(ctx, `
		SELECT c.name_id, dc.count, dc.is_pokemon
		FROM deck_cards dc
		JOIN cards c ON dc.card_id = c.id
		JOIN decks d ON dc.deck_id = d.id
		WHERE d.archetype = ? AND dc.is_pokemon = 1
		GROUP BY c.name_id
		ORDER BY SUM(dc.count) DESC
		LIMIT 5
	`, opponentArchetype)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var threats []ThreatCard
	for rows.Next() {
		var name string
		var count int
		var isPokemon bool
		if rows.Scan(&name, &count, &isPokemon) != nil {
			continue
		}
		threat := ThreatCard{
			Name:   name,
			Danger: 5,
		}
		lower := strings.ToLower(name)
		switch {
		case strings.Contains(lower, "ex") || strings.Contains(lower, "mega"):
			threat.Threat = "EX/Mega — high HP, powerful attacks"
			threat.Danger = 8
			threat.Counter = "Butuh damage 220+ untuk OHKO, atau spread + gust"
		case strings.Contains(lower, "vstar") || strings.Contains(lower, "vmax"):
			threat.Threat = "VSTAR/VMAX — bulky attacker"
			threat.Danger = 7
			threat.Counter = "Focus fire atau counter type advantage"
		default:
			threat.Threat = fmt.Sprintf("Support Pokemon — %dx copy", count)
			threat.Danger = 4
			threat.Counter = "Targetkan dengan gust sebelum setup lengkap"
		}

		// Check if we have counter
		if ourCards[lower] {
			threat.Counter += " [KAMU PUNYA KARTU INI]"
		}
		threats = append(threats, threat)
	}
	return threats
}

func (a *DeckAnalyzer) findOurKeyCards(ctx context.Context, ourArchetype, opponentArchetype string) []string {
	rows, err := a.db.QueryContext(ctx, `
		SELECT c.name_id FROM deck_cards dc
		JOIN cards c ON dc.card_id = c.id
		JOIN decks d ON dc.deck_id = d.id
		WHERE d.archetype = ?
		GROUP BY c.name_id ORDER BY SUM(dc.count) DESC LIMIT 5
	`, ourArchetype)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var cards []string
	for rows.Next() {
		var name string
		if rows.Scan(&name) == nil {
			cards = append(cards, name)
		}
	}
	return cards
}

// ── Strategy generators ──

func generateGamePlan(our, opponent string, favored bool, winRate float64) string {
	if favored {
		return fmt.Sprintf("Favored melawan %s. Mainkan gameplan normal — setup attacker, kontrol board, dan close game secepat mungkin. Lawan akan mencoba comeback, jadi jangan beri napas.", opponent)
	}
	return fmt.Sprintf("Unfavored melawan %s. Perlu pendekatan berbeda: prioritaskan disrupt setup lawan, cari tech card yang bisa swing momentum, dan mainkan lebih agresif dari biasanya.", opponent)
}

func generateEarlyGame(our, opponent string) string {
	return fmt.Sprintf("T1-T2: Fokus setup — cari Basic + Energy + Supporter. Jangan terburu-buru attack jika setup belum matang. Lawan %s biasanya juga butuh 1-2 turn untuk setup.", opponent)
}

func generateMidGame(our, opponent string, favored bool) string {
	if favored {
		return "T3-T5: Mulai serang — targetkan key Pokemon lawan dengan gust. Jaga board control dan jangan biarkan lawan comeback."
	}
	return "T3-T5: Ini kritis — harus mulai menekan sebelum lawan snowball. Gunakan disruption jika ada, dan targetkan Pokemon yang belum evolve."
}

func generateLateGame(our, opponent string, favored bool) string {
	if favored {
		return "T6+: Close game — hit prize trade yang menguntungkan. Jika sudah unggul prize, mainkan safe."
	}
	return "T6+: Harus aggressive — cari cara swing momentum. 1 KO yang tepat bisa mengubah game. Jangan menyerah sampai prize count 0."
}

func generateTurnByTurn(our, opponent string, favored bool) []TurnPlan {
	return []TurnPlan{
		{Turn: 1, Priority: "Setup", Action: "Attach energy, play Supporter untuk draw/search", Notes: "Ideal: Basic + Energy + Draw Supporter di opening hand"},
		{Turn: 2, Priority: "Establish board", Action: "Evolve jika Stage 1, mulai serang jika attacker ready", Notes: "Lawan juga baru mulai — ini saat terbaik untuk setup tanpa tekanan"},
		{Turn: 3, Priority: "Apply pressure", Action: "Mulai attack — targetkan Pokemon lawan yang belum evolve", Notes: "Gust effect sangat berharga di turn ini"},
		{Turn: 4, Priority: "Control", Action: "Maintain board advantage, disrupt lawan jika bisa", Notes: "Jika sudah unggul prize, mainkan lebih safe"},
		{Turn: 5, Priority: "Close", Action: "Push untuk KO terakhir", Notes: "Hitungan prize: pastikan trade yang menguntungkan"},
	}
}

func generateTechSuggestions(our, opponent string, ourCards map[string]bool) []string {
	var suggestions []string
	if !ourCards["munkidori"] {
		suggestions = append(suggestions, "Munkidori — spread damage counter, sangat bagus melawan multi-prize decks")
	}
	if !ourCards["fezandipiti ex"] {
		suggestions = append(suggestions, "Fezandipiti ex — draw + gust effect dalam 1 kartu")
	}
	if !ourCards["boss's orders"] && !ourCards["perintah boss"] {
		suggestions = append(suggestions, "Boss's Orders / Perintah Boss — gust effect untuk target KO")
	}
	if !ourCards["iono"] {
		suggestions = append(suggestions, "Iono — disruption draw + reset hand lawan saat mereka unggul")
	}
	if len(suggestions) == 0 {
		suggestions = append(suggestions, "Engine sudah cukup solid — fokus ke optimalisasi sequencing dan prize mapping")
	}
	return suggestions
}

func generateSideDeckAdvice(our, opponent string, favored bool) string {
	if favored {
		return fmt.Sprintf("Favored — side deck bisa difokuskan ke matchup lain. Pertahankan core engine %s.", our)
	}
	return fmt.Sprintf("Unfavored — pertimbangkan tech card spesifik: Enhanced Hammer untuk energy disruption, Path to the Peak untuk ability lock, atau Lost City untuk membuang key Pokemon %s.", opponent)
}

func generateGenericThreats(archetype string) []ThreatCard {
	lower := strings.ToLower(archetype)
	var threats []ThreatCard

	if strings.Contains(lower, "dragapult") {
		threats = append(threats, ThreatCard{Name: "Dragapult ex", Threat: "220 damage + spread 6 damage counters", Danger: 9, Counter: "Butuh OHKO 260+ HP atau damage counter sebelum attack"})
		threats = append(threats, ThreatCard{Name: "Dusknoir", Threat: "Spread damage + ability lock", Danger: 7, Counter: "Targetkan Duskull/Dusclops sebelum evolve"})
	}
	if strings.Contains(lower, "charizard") {
		threats = append(threats, ThreatCard{Name: "Charizard ex", Threat: "180 damage + energy acceleration", Danger: 8, Counter: "Water type advantage atau gust sebelum setup"})
	}
	if strings.Contains(lower, "gardevoir") {
		threats = append(threats, ThreatCard{Name: "Gardevoir ex", Threat: "Psychic energy dari discard — unlimited acceleration", Danger: 9, Counter: "Iono + pressure sebelum Gardevoir online"})
	}
	if strings.Contains(lower, "gholdengo") {
		threats = append(threats, ThreatCard{Name: "Gholdengo ex", Threat: "Make It Rain — discard energy for big damage", Danger: 7, Counter: "Energy disruption atau KO sebelum kumpul energy"})
	}
	if strings.Contains(lower, "ogerpon") || strings.Contains(lower, "raging") {
		threats = append(threats, ThreatCard{Name: "Raging Bolt / Ogerpon", Threat: "Massive damage dari energy stacking", Danger: 8, Counter: "Targetkan Ogerpon sebelum Raging Bolt attack"})
	}
	if strings.Contains(lower, "zoroark") {
		threats = append(threats, ThreatCard{Name: "Zoroark", Threat: "Flexible attacker — bisa copy attack lawan", Danger: 7, Counter: "Jangan biarkan Zoroark free setup di bench"})
	}

	if len(threats) == 0 {
		threats = append(threats, ThreatCard{Name: archetype + " core", Threat: "Main attacker — high damage output", Danger: 6, Counter: "Analisa kartu utama lawan dan cari weakness"})
	}
	return threats
}
