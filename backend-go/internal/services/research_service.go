package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"math"
	"pokemon-tcg-indonesia/internal/models"
	"sort"
	"strings"
)

// ResearchService powers PokeLab ID recommendation and meta research features.
type ResearchService struct {
	db        *sql.DB
	aiService *AIService
}

// NewResearchService creates a new ResearchService.
func NewResearchService(db *sql.DB, aiService *AIService) *ResearchService {
	return &ResearchService{db: db, aiService: aiService}
}

// GetRecommendations compares a user's collection against meta decklists.
func (s *ResearchService) GetRecommendations(ctx context.Context, userID, collectionID string) (*models.ResearchRecommendationsResponse, error) {
	if err := s.ensureCollectionOwner(ctx, userID, collectionID); err != nil {
		return nil, err
	}

	inventory, err := s.loadCollectionInventory(ctx, collectionID)
	if err != nil {
		return nil, err
	}

	decks, err := s.loadMetaDecks(ctx, 30)
	if err != nil {
		return nil, err
	}

	recommendations := make([]models.ResearchDeckRecommendation, 0, len(decks))
	for _, deck := range decks {
		cards, err := s.loadRepresentativeDeckCards(ctx, deck.ID)
		if err != nil || len(cards) == 0 {
			continue
		}

		rec := s.scoreDeck(deck, cards, inventory)
		recommendations = append(recommendations, rec)
	}

	sort.SliceStable(recommendations, func(i, j int) bool {
		left := recommendations[i].CompletenessPct*0.65 + recommendations[i].MetaScore*0.35
		right := recommendations[j].CompletenessPct*0.65 + recommendations[j].MetaScore*0.35
		return left > right
	})

	if len(recommendations) > 10 {
		recommendations = recommendations[:10]
	}

	return &models.ResearchRecommendationsResponse{
		CollectionID:    collectionID,
		Recommendations: recommendations,
	}, nil
}

// GetDeckGap returns detailed missing-card information for a single deck.
func (s *ResearchService) GetDeckGap(ctx context.Context, userID, collectionID, deckID string) (*models.DeckGapAnalysis, error) {
	if err := s.ensureCollectionOwner(ctx, userID, collectionID); err != nil {
		return nil, err
	}

	inventory, err := s.loadCollectionInventory(ctx, collectionID)
	if err != nil {
		return nil, err
	}

	deck, err := s.getDeck(ctx, deckID)
	if err != nil {
		return nil, err
	}

	cards, err := s.loadRepresentativeDeckCards(ctx, deckID)
	if err != nil {
		return nil, err
	}
	if len(cards) == 0 {
		return nil, fmt.Errorf("deck has no card list")
	}

	rec := s.scoreDeck(deck, cards, inventory)
	return &models.DeckGapAnalysis{
		CollectionID:            collectionID,
		DeckID:                  rec.DeckID,
		DeckName:                rec.DeckName,
		CompletenessPct:         rec.CompletenessPct,
		OwnedCards:              rec.OwnedCards,
		RequiredCards:           rec.RequiredCards,
		MissingCards:            rec.MissingCards,
		EstimatedUpgradeCostIDR: rec.EstimatedUpgradeCostIDR,
	}, nil
}

// GetDeckAnalysis returns a full Football Manager-style scout report for one deck.
func (s *ResearchService) GetDeckAnalysis(ctx context.Context, userID, collectionID, deckID string) (*models.ResearchDeckAnalysis, error) {
	if strings.TrimSpace(deckID) == "" {
		return nil, fmt.Errorf("deck_id is required")
	}
	if err := s.ensureCollectionOwner(ctx, userID, collectionID); err != nil {
		return nil, err
	}

	inventory, err := s.loadCollectionInventory(ctx, collectionID)
	if err != nil {
		return nil, err
	}

	deck, err := s.getDeck(ctx, deckID)
	if err != nil {
		return nil, err
	}

	cards, err := s.loadRepresentativeDeckCards(ctx, deckID)
	if err != nil {
		return nil, err
	}

	analysis := s.buildDeckAnalysis(ctx, collectionID, deck, cards, inventory)
	return &analysis, nil
}

// GetAntiMeta recommends counters for a target deck.
func (s *ResearchService) GetAntiMeta(ctx context.Context, targetDeckID string) ([]models.AntiMetaRecommendation, error) {
	target, err := s.getDeck(ctx, targetDeckID)
	if err != nil {
		return nil, err
	}

	decks, err := s.loadMetaDecks(ctx, 30)
	if err != nil {
		return nil, err
	}

	recommendations := make([]models.AntiMetaRecommendation, 0)
	for _, deck := range decks {
		if deck.ID == target.ID {
			continue
		}

		score := s.metaScore(deck) + s.counterBonus(target, deck)
		rec := models.AntiMetaRecommendation{
			TargetDeckID:    target.ID,
			TargetDeckName:  target.Name,
			CounterDeckID:   deck.ID,
			CounterDeckName: deck.Name,
			Archetype:       deck.Archetype,
			CounterScore:    round(score),
			TechCards:       s.techCardsForTarget(target),
			MatchupNotes:    s.matchupNotes(target, deck),
		}
		recommendations = append(recommendations, rec)
	}

	sort.SliceStable(recommendations, func(i, j int) bool {
		return recommendations[i].CounterScore > recommendations[j].CounterScore
	})
	if len(recommendations) > 5 {
		recommendations = recommendations[:5]
	}

	if len(recommendations) > 0 {
		contextJSON, _ := json.Marshal(recommendations[0])
		advice, err := s.aiService.AskWithContext(ctx, string(contextJSON), "Jelaskan rencana anti-meta ini secara singkat untuk pemain Pokemon TCG Indonesia.")
		if err == nil {
			recommendations[0].AIAdvice = advice
		}
	}

	return recommendations, nil
}

// GetPredictions returns cards with the strongest current meta signals.
func (s *ResearchService) GetPredictions(ctx context.Context, category string, limit int) ([]models.MetaPrediction, error) {
	if limit <= 0 {
		limit = 500
	}

	totalDecklists := s.countDecklistsWithCards(ctx)

	query := `
		SELECT c.id, c.name_id, c.category, COALESCE(c.card_type, ''), COALESCE(c.rarity, ''),
		       COUNT(dc.id) as appearances, COALESCE(SUM(dc.count), 0) as total_copies
		FROM deck_cards dc
		JOIN cards c ON c.id = dc.card_id
		WHERE (? = '' OR c.category = ? OR c.card_type = ?)
		GROUP BY c.id, c.name_id, c.category, c.card_type, c.rarity
		ORDER BY appearances DESC, total_copies DESC
		LIMIT ?
	`

	rows, err := s.db.QueryContext(ctx, query, category, category, category, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	predictions := make([]models.MetaPrediction, 0)
	for rows.Next() {
		var p models.MetaPrediction
		if err := rows.Scan(&p.CardID, &p.CardName, &p.Category, &p.CardType, &p.Rarity, &p.Appearances, &p.TotalCopies); err != nil {
			continue
		}
		p = s.enrichCardPrediction(p, totalDecklists)
		predictions = append(predictions, p)
	}

	if len(predictions) == 0 {
		return s.fallbackPredictions(category, limit), nil
	}

	return predictions, nil
}

// GetForecast returns public model-style meta forecasts for the research lab.
func (s *ResearchService) GetForecast(ctx context.Context, category string, limit int) (*models.ResearchForecastResponse, error) {
	if limit <= 0 {
		limit = 500
	}

	cardPredictions, err := s.GetPredictions(ctx, category, limit)
	if err != nil {
		return nil, err
	}

	deckPredictions, stats, err := s.forecastDecks(ctx, limit)
	if err != nil {
		return nil, err
	}
	stats.TotalCardSignals = len(cardPredictions)

	return &models.ResearchForecastResponse{
		DeckPredictions: deckPredictions,
		CardPredictions: cardPredictions,
		LabStats:        stats,
		Methodology: []string{
			"Card model: frequency, total copies, average copies, adoption velocity, staple index, rarity/context risk.",
			"Deck model: archetype clustering from tournament decks, tournament count, win/top-cut signals, momentum, and meta-share estimate.",
			"OpenRouter is explain-only. Ranking, confidence, and tiers are deterministic from local database signals.",
			"Scores are scouting signals, not guarantees. Validate with matchup testing and new tournament imports.",
		},
	}, nil
}

func (s *ResearchService) enrichCardPrediction(p models.MetaPrediction, totalDecklists int) models.MetaPrediction {
	if totalDecklists <= 0 {
		totalDecklists = p.Appearances
	}
	avgCopies := 0.0
	if p.Appearances > 0 {
		avgCopies = float64(p.TotalCopies) / float64(p.Appearances)
	}
	metaShare := 0.0
	if totalDecklists > 0 {
		metaShare = float64(p.Appearances) / float64(totalDecklists) * 100
	}
	adoptionVelocity := math.Min(100, metaShare*0.9+math.Log1p(float64(p.Appearances))*8+avgCopies*4)
	stapleIndex := math.Min(100, metaShare*0.65+math.Min(avgCopies, 4)*12+math.Log1p(float64(p.Appearances))*3)
	volatility := math.Max(5, 100-stapleIndex+(avgCopies-2.2)*8)
	if volatility > 100 {
		volatility = 100
	}
	copyPressure := math.Min(100, math.Log1p(float64(p.TotalCopies))*12)
	rawScore := metaShare*0.36 + adoptionVelocity*0.25 + stapleIndex*0.25 + copyPressure*0.14
	p.PredictionScore = round(math.Min(100, rawScore))
	p.ConfidencePct = round(math.Min(96, 38+math.Sqrt(float64(maxInt(1, p.Appearances)))*4.8+math.Min(18, metaShare*0.25)))
	p.MetaSharePct = round(metaShare)
	p.AverageCopies = round(avgCopies)
	p.AdoptionVelocity = round(adoptionVelocity)
	p.StapleIndex = round(stapleIndex)
	p.VolatilityScore = round(volatility)
	p.Trend = trendLabel(p.PredictionScore)
	p.ForecastLabel = forecastLabel(p)
	p.RecommendedAction = recommendedCardAction(p)
	p.Factors = []string{
		fmt.Sprintf("Muncul di %d decklist", p.Appearances),
		fmt.Sprintf("Total %d copy tercatat", p.TotalCopies),
		fmt.Sprintf("Meta share %.1f%% dari decklist tersimpan", p.MetaSharePct),
		fmt.Sprintf("Rata-rata %.1f copy saat dimainkan", p.AverageCopies),
	}
	p.ModelSignals = []string{
		fmt.Sprintf("Adoption velocity %.1f/100", p.AdoptionVelocity),
		fmt.Sprintf("Staple index %.1f/100", p.StapleIndex),
		fmt.Sprintf("Volatility %.1f/100", p.VolatilityScore),
		fmt.Sprintf("Confidence %.1f%%", p.ConfidencePct),
	}
	if p.Rarity != "" {
		p.Factors = append(p.Factors, "Rarity: "+p.Rarity)
	}
	p.RiskFactors = cardRiskFactors(p)
	p.Reason = fmt.Sprintf("%s diproyeksikan %s: score %.1f dengan meta share %.1f%%, adoption %.1f, dan rata-rata %.1f copy.",
		p.CardName, strings.ToLower(p.ForecastLabel), p.PredictionScore, p.MetaSharePct, p.AdoptionVelocity, p.AverageCopies)
	return p
}

func (s *ResearchService) forecastDecks(ctx context.Context, limit int) ([]models.MetaDeckPrediction, models.ResearchLabStats, error) {
	decks, err := s.loadMetaDecks(ctx, 500)
	if err != nil {
		return nil, models.ResearchLabStats{}, err
	}

	type archetypeAgg struct {
		archetype string
		decks     []models.Deck
		tourneys  int
		wins      int
		top8      int
	}
	groups := map[string]*archetypeAgg{}
	totalTournamentSignals := 0
	for _, deck := range decks {
		key := strings.TrimSpace(deck.Archetype)
		if key == "" {
			key = strings.TrimSpace(deck.Name)
		}
		if key == "" {
			key = "Unknown"
		}
		group := groups[key]
		if group == nil {
			group = &archetypeAgg{archetype: key}
			groups[key] = group
		}
		group.decks = append(group.decks, deck)
		group.tourneys += deck.TournamentCount
		group.wins += deck.WinCount
		group.top8 += deck.Top8Count
		totalTournamentSignals += deck.TournamentCount
	}

	predictions := make([]models.MetaDeckPrediction, 0, len(groups))
	for _, group := range groups {
		sort.SliceStable(group.decks, func(i, j int) bool {
			if s.metaScore(group.decks[i]) != s.metaScore(group.decks[j]) {
				return s.metaScore(group.decks[i]) > s.metaScore(group.decks[j])
			}
			return group.decks[i].Name < group.decks[j].Name
		})
		rep := group.decks[0]
		metaShare := 0.0
		if totalTournamentSignals > 0 {
			metaShare = float64(group.tourneys) / float64(totalTournamentSignals) * 100
		}
		momentum := math.Min(100, float64(group.top8)*18+float64(group.wins)*6+math.Sqrt(float64(len(group.decks)))*7+math.Sqrt(float64(group.tourneys))*5+metaShare*0.7)
		tournamentDepth := math.Min(100, math.Log1p(float64(group.tourneys))*9)
		score := math.Min(100, momentum*0.42+metaShare*0.85+tournamentDepth+float64(group.top8)*4+float64(group.wins)*2)
		confidence := math.Min(96, 42+math.Sqrt(float64(maxInt(1, group.tourneys)))*8+float64(len(group.decks))*2+float64(group.top8)*3)
		p := models.MetaDeckPrediction{
			Archetype:              group.archetype,
			RepresentativeDeckID:   rep.ID,
			RepresentativeDeckName: rep.Name,
			PredictedTier:          tierFromScore(score),
			PredictionScore:        round(score),
			ConfidencePct:          round(confidence),
			MomentumScore:          round(momentum),
			MetaSharePct:           round(metaShare),
			DeckCount:              len(group.decks),
			TournamentCount:        group.tourneys,
			WinCount:               group.wins,
			Top8Count:              group.top8,
			GrowthSignal:           deckGrowthSignal(score, momentum, metaShare),
			ExpectedRole:           deckExpectedRole(score, metaShare),
			Drivers: []string{
				fmt.Sprintf("%d decklist dalam cluster archetype", len(group.decks)),
				fmt.Sprintf("%d tournament signal tersimpan", group.tourneys),
				fmt.Sprintf("%.1f%% estimasi meta share", metaShare),
				fmt.Sprintf("%.1f momentum score", momentum),
			},
			RiskFactors: deckRiskFactors(group.tourneys, group.top8, metaShare),
		}
		p.ForecastReason = fmt.Sprintf("%s diprediksi %s dengan score %.1f karena momentum %.1f dan meta share %.1f%%.",
			p.Archetype, strings.ToLower(p.ExpectedRole), p.PredictionScore, p.MomentumScore, p.MetaSharePct)
		predictions = append(predictions, p)
	}

	sort.SliceStable(predictions, func(i, j int) bool {
		if predictions[i].PredictionScore != predictions[j].PredictionScore {
			return predictions[i].PredictionScore > predictions[j].PredictionScore
		}
		// Secondary sort: higher tournament_count first, then alphabetical
		if predictions[i].TournamentCount != predictions[j].TournamentCount {
			return predictions[i].TournamentCount > predictions[j].TournamentCount
		}
		return predictions[i].Archetype < predictions[j].Archetype
	})
	if len(predictions) > limit {
		predictions = predictions[:limit]
	}

	stats := models.ResearchLabStats{
		TotalDecks:             len(decks),
		TotalArchetypes:        len(groups),
		TotalTournamentSignals: totalTournamentSignals,
		ModelVersion:           "PokeLab deterministic scout v1.2",
	}
	return predictions, stats, nil
}

func (s *ResearchService) countDecklistsWithCards(ctx context.Context) int {
	var count int
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(DISTINCT deck_id) FROM deck_cards`).Scan(&count)
	if err != nil || count <= 0 {
		return 1
	}
	return count
}

func forecastLabel(p models.MetaPrediction) string {
	switch {
	case p.PredictionScore >= 82 && p.ConfidencePct >= 70:
		return "Likely staple"
	case p.PredictionScore >= 68:
		return "Rising meta piece"
	case p.PredictionScore >= 52:
		return "Watchlist"
	default:
		return "Low-confidence signal"
	}
}

func recommendedCardAction(p models.MetaPrediction) string {
	switch p.ForecastLabel {
	case "Likely staple":
		return "Prioritaskan testing dan siapkan copy sesuai archetype yang dimainkan."
	case "Rising meta piece":
		return "Masukkan ke watchlist, uji 1-2 copy, dan pantau hasil turnamen berikutnya."
	case "Watchlist":
		return "Pantau sinergi dan jangan overbuy sebelum muncul di lebih banyak top list."
	default:
		return "Gunakan sebagai data scouting, belum cukup kuat untuk keputusan belanja besar."
	}
}

func cardRiskFactors(p models.MetaPrediction) []string {
	risks := []string{}
	if p.MetaSharePct < 8 {
		risks = append(risks, "Meta share masih rendah; bisa hanya tech lokal atau efek satu archetype.")
	}
	if p.AverageCopies < 1.4 {
		risks = append(risks, "Rata-rata copy rendah; kemungkinan kartu tech, bukan core engine.")
	}
	if p.VolatilityScore > 70 {
		risks = append(risks, "Volatilitas tinggi; validasi dengan matchup sebelum menaikkan copy.")
	}
	if len(risks) == 0 {
		risks = append(risks, "Risiko utama adalah perubahan meta setelah hasil turnamen baru masuk.")
	}
	return risks
}

func deckGrowthSignal(score, momentum, metaShare float64) string {
	switch {
	case score >= 82 && momentum >= 70:
		return "surging"
	case metaShare >= 10 && score >= 68:
		return "consolidating"
	case score >= 55:
		return "watch"
	default:
		return "fringe"
	}
}

func deckExpectedRole(score, metaShare float64) string {
	switch {
	case score >= 82:
		return "Tier contender"
	case metaShare >= 10:
		return "Established meta deck"
	case score >= 58:
		return "Potential breakout"
	default:
		return "Meta watchlist"
	}
}

func deckRiskFactors(tourneys, top8 int, metaShare float64) []string {
	risks := []string{}
	if tourneys <= 2 {
		risks = append(risks, "Sample tournament masih kecil.")
	}
	if top8 == 0 {
		risks = append(risks, "Belum ada sinyal top cut kuat di data tersimpan.")
	}
	if metaShare > 18 {
		risks = append(risks, "Deck populer biasanya menjadi target tech anti-meta.")
	}
	if len(risks) == 0 {
		risks = append(risks, "Pantau perubahan tech package dari turnamen berikutnya.")
	}
	return risks
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

// AskAdvisor asks OpenRouter to explain deterministic PokeLab data.
func (s *ResearchService) AskAdvisor(ctx context.Context, question, researchContext string) (*models.AIResearchAdvice, error) {
	if strings.TrimSpace(question) == "" {
		return nil, fmt.Errorf("question is required")
	}
	systemContext := "PokeLab ID memakai scoring deterministik dari database inventory, deck meta, turnamen, dan harga. Jangan mengubah angka ranking; jelaskan alasannya dan beri saran praktis."
	if researchContext != "" {
		systemContext += "\n\nData:\n" + researchContext
	}

	answer, err := s.aiService.AskWithContext(ctx, systemContext, question)
	if err != nil {
		answer = "AI advisor belum tersedia, tetapi scoring deterministik PokeLab tetap bisa digunakan. Gunakan rekomendasi, gap kartu, dan estimasi biaya sebagai sumber utama keputusan."
	}

	return &models.AIResearchAdvice{
		Question: question,
		Answer:   answer,
		Context:  researchContext,
	}, nil
}

func (s *ResearchService) ensureCollectionOwner(ctx context.Context, userID, collectionID string) error {
	if strings.TrimSpace(collectionID) == "" {
		return fmt.Errorf("collection_id is required")
	}

	var owner string
	err := s.db.QueryRowContext(ctx, `SELECT user_id FROM collections WHERE id = ?`, collectionID).Scan(&owner)
	if err == sql.ErrNoRows {
		return fmt.Errorf("collection not found")
	}
	if err != nil {
		return err
	}
	if owner != userID {
		return fmt.Errorf("collection not found")
	}
	return nil
}

func (s *ResearchService) loadCollectionInventory(ctx context.Context, collectionID string) (map[string]int, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT card_id, COALESCE(SUM(quantity), 0)
		FROM collection_items
		WHERE collection_id = ?
		GROUP BY card_id
	`, collectionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	inventory := map[string]int{}
	for rows.Next() {
		var cardID string
		var quantity int
		if err := rows.Scan(&cardID, &quantity); err == nil {
			inventory[cardID] = quantity
		}
	}
	return inventory, nil
}

func (s *ResearchService) loadMetaDecks(ctx context.Context, limit int) ([]models.Deck, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, name, COALESCE(archetype, ''), COALESCE(format, 'Standard'),
		       COALESCE(tournament_count, 0), COALESCE(win_count, 0), COALESCE(top8_count, 0)
		FROM decks
		WHERE user_id IS NULL
		ORDER BY tournament_count DESC, win_count DESC, top8_count DESC, name ASC
		LIMIT ?
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	decks := make([]models.Deck, 0)
	for rows.Next() {
		var deck models.Deck
		if err := rows.Scan(&deck.ID, &deck.Name, &deck.Archetype, &deck.Format, &deck.TournamentCount, &deck.WinCount, &deck.Top8Count); err != nil {
			continue
		}
		decks = append(decks, deck)
	}
	return decks, nil
}

func (s *ResearchService) getDeck(ctx context.Context, deckID string) (models.Deck, error) {
	var deck models.Deck
	err := s.db.QueryRowContext(ctx, `
		SELECT id, name, COALESCE(archetype, ''), COALESCE(format, 'Standard'),
		       COALESCE(tournament_count, 0), COALESCE(win_count, 0), COALESCE(top8_count, 0)
		FROM decks
		WHERE id = ?
	`, deckID).Scan(&deck.ID, &deck.Name, &deck.Archetype, &deck.Format, &deck.TournamentCount, &deck.WinCount, &deck.Top8Count)
	if err == sql.ErrNoRows {
		return deck, fmt.Errorf("deck not found")
	}
	return deck, err
}

func (s *ResearchService) loadRepresentativeDeckCards(ctx context.Context, deckID string) ([]models.DeckCard, error) {
	cards, err := s.loadDeckCards(ctx, deckID)
	if err != nil {
		return nil, err
	}
	if len(cards) > 0 {
		return cards, nil
	}

	var decklistID string
	err = s.db.QueryRowContext(ctx, `
		SELECT id
		FROM decklists
		WHERE deck_id = ?
		ORDER BY CASE WHEN placement > 0 THEN 0 ELSE 1 END, placement ASC, created_at DESC
		LIMIT 1
	`, deckID).Scan(&decklistID)
	if err != nil {
		return nil, nil
	}

	return s.loadDeckCards(ctx, decklistID)
}

func (s *ResearchService) loadDeckCards(ctx context.Context, deckOrListID string) ([]models.DeckCard, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT dc.card_id, COALESCE(c.name_id, dc.card_id), COALESCE(c.category, ''),
		       COALESCE(c.card_type, ''), COALESCE(dc.count, 0),
		       COALESCE(dc.is_pokemon, c.category = 'Pokemon')
		FROM deck_cards dc
		LEFT JOIN cards c ON c.id = dc.card_id
		WHERE dc.deck_id = ?
	`, deckOrListID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	cards := make([]models.DeckCard, 0)
	for rows.Next() {
		var card models.DeckCard
		if err := rows.Scan(&card.CardID, &card.CardName, &card.Category, &card.CardType, &card.Count, &card.IsPokemon); err != nil {
			continue
		}
		cards = append(cards, card)
	}
	return cards, nil
}

func (s *ResearchService) scoreDeck(deck models.Deck, cards []models.DeckCard, inventory map[string]int) models.ResearchDeckRecommendation {
	required := 0
	owned := 0
	missing := make([]models.MissingCard, 0)
	seen := map[string]models.MissingCard{}

	for _, card := range cards {
		if card.Count <= 0 {
			continue
		}
		required += card.Count
		ownedCount := inventory[card.CardID]
		if ownedCount > card.Count {
			ownedCount = card.Count
		}
		owned += ownedCount

		missingCount := card.Count - ownedCount
		if missingCount <= 0 {
			continue
		}

		price := s.bestPriceIDR(context.Background(), card.CardID)
		item := models.MissingCard{
			CardID:                card.CardID,
			CardName:              card.CardName,
			Category:              cardCategory(card),
			RequiredCount:         card.Count,
			OwnedCount:            ownedCount,
			MissingCount:          missingCount,
			EstimatedPriceIDR:     price,
			TotalEstimatedIDR:     price * float64(missingCount),
			BuyPriority:           buyPriority(card, missingCount, deck),
			SubstituteSuggestions: substituteSuggestions(card),
		}
		if existing, ok := seen[card.CardID]; ok {
			existing.RequiredCount += item.RequiredCount
			existing.MissingCount += item.MissingCount
			existing.TotalEstimatedIDR += item.TotalEstimatedIDR
			seen[card.CardID] = existing
		} else {
			seen[card.CardID] = item
		}
	}

	for _, item := range seen {
		missing = append(missing, item)
	}
	sort.SliceStable(missing, func(i, j int) bool {
		return priorityRank(missing[i].BuyPriority) > priorityRank(missing[j].BuyPriority)
	})

	completeness := 0.0
	if required > 0 {
		completeness = float64(owned) / float64(required) * 100
	}

	cost := 0.0
	for _, item := range missing {
		cost += item.TotalEstimatedIDR
	}

	return models.ResearchDeckRecommendation{
		DeckID:                  deck.ID,
		DeckName:                deck.Name,
		Archetype:               deck.Archetype,
		Tier:                    tierFromScore(s.metaScore(deck)),
		CompletenessPct:         round(completeness),
		OwnedCards:              owned,
		RequiredCards:           required,
		MissingCards:            missing,
		EstimatedUpgradeCostIDR: round(cost),
		MetaScore:               round(s.metaScore(deck)),
		RecommendationReason:    recommendationReason(deck, completeness, cost),
	}
}

func (s *ResearchService) buildDeckAnalysis(ctx context.Context, collectionID string, deck models.Deck, cards []models.DeckCard, inventory map[string]int) models.ResearchDeckAnalysis {
	aggregated := aggregateDeckCards(cards)
	rec := s.scoreDeck(deck, aggregated, inventory)
	breakdownMap := map[string]*models.ResearchCategoryBreakdown{}
	cardUsage := make([]models.ResearchCardUsage, 0, len(aggregated))
	warnings := make([]string, 0)
	stats := models.ResearchDeckStatistics{UniqueCards: len(aggregated)}
	priceGaps := 0
	priceKnownCards := 0
	consistencyCopies := 0

	for _, card := range aggregated {
		if card.Count <= 0 {
			continue
		}

		category := cardCategory(card)
		ownedCount := inventory[card.CardID]
		if ownedCount > card.Count {
			ownedCount = card.Count
		}
		missingCount := card.Count - ownedCount
		if missingCount < 0 {
			missingCount = 0
		}

		price := s.bestPriceIDR(ctx, card.CardID)
		if price == 0 && missingCount > 0 {
			priceGaps++
		}
		if price > 0 {
			priceKnownCards++
		}
		role := cardRole(card)
		metaAppearances, metaTotalCopies := s.cardMetaStats(ctx, card.CardID)
		coverage := 100.0
		if card.Count > 0 {
			coverage = float64(ownedCount) / float64(card.Count) * 100
		}
		if role == "engine" || role == "search" || role == "draw" {
			consistencyCopies += card.Count
		}
		stats.TotalCopies += card.Count
		stats.DeckValueIDR += price * float64(card.Count)
		stats.OwnedValueIDR += price * float64(ownedCount)
		stats.MissingValueIDR += price * float64(missingCount)
		if card.Count > stats.MaxCopies {
			stats.MaxCopies = card.Count
		}
		if missingCount > 0 {
			stats.MissingUniqueCards++
			stats.MissingCopies += missingCount
		}
		switch category {
		case "Pokemon":
			stats.PokemonCopies += card.Count
		case "Energy":
			stats.EnergyCopies += card.Count
		default:
			stats.TrainerCopies += card.Count
		}

		usage := models.ResearchCardUsage{
			CardID:              card.CardID,
			CardName:            card.CardName,
			Category:            category,
			CardType:            card.CardType,
			RequiredCount:       card.Count,
			OwnedCount:          ownedCount,
			MissingCount:        missingCount,
			CoveragePct:         round(coverage),
			EstimatedPriceIDR:   price,
			TotalMissingCostIDR: round(price * float64(missingCount)),
			Role:                role,
			ImportanceScore:     importanceScore(card, role, metaAppearances),
			MetaFrequency:       metaAppearances,
			BuyPriority:         buyPriority(card, missingCount, deck),
			Substitutes:         substituteSuggestions(card),
			UsageNote:           usageNote(card, role, metaAppearances),
			Statistics: models.ResearchCardStatistics{
				DeckSharePct:        percent(card.Count, rec.RequiredCards),
				OwnedSharePct:       percent(ownedCount, rec.OwnedCards),
				AvgCopiesWhenSeen:   avgCopies(metaTotalCopies, metaAppearances),
				MetaDeckAppearances: metaAppearances,
				MetaTotalCopies:     metaTotalCopies,
				CopyDelta:           ownedCount - card.Count,
				OwnershipStatus:     ownershipStatus(ownedCount, card.Count),
			},
		}
		cardUsage = append(cardUsage, usage)
		if usage.BuyPriority == "high" && missingCount > 0 {
			stats.HighPriorityMissingCards++
		}

		breakdown := breakdownMap[category]
		if breakdown == nil {
			breakdown = &models.ResearchCategoryBreakdown{Category: category}
			breakdownMap[category] = breakdown
		}
		breakdown.RequiredCount += card.Count
		breakdown.OwnedCount += ownedCount
		breakdown.MissingCount += missingCount
	}

	for _, item := range breakdownMap {
		if item.RequiredCount > 0 {
			item.CompletenessPct = round(float64(item.OwnedCount) / float64(item.RequiredCount) * 100)
		}
	}

	sort.SliceStable(cardUsage, func(i, j int) bool {
		if cardUsage[i].ImportanceScore == cardUsage[j].ImportanceScore {
			return cardUsage[i].CardName < cardUsage[j].CardName
		}
		return cardUsage[i].ImportanceScore > cardUsage[j].ImportanceScore
	})
	applyCardStatisticRanks(cardUsage, stats.MissingCopies, stats.MissingValueIDR)

	if stats.UniqueCards > 0 {
		stats.AverageCopiesPerCard = round(float64(stats.TotalCopies) / float64(stats.UniqueCards))
		stats.PriceCoveragePct = round(float64(priceKnownCards) / float64(stats.UniqueCards) * 100)
	}
	if stats.TotalCopies > 0 {
		stats.ConsistencyScore = round(float64(consistencyCopies) / float64(stats.TotalCopies) * 100)
	}
	stats.DeckValueIDR = round(stats.DeckValueIDR)
	stats.OwnedValueIDR = round(stats.OwnedValueIDR)
	stats.MissingValueIDR = round(stats.MissingValueIDR)

	categoryBreakdown := make([]models.ResearchCategoryBreakdown, 0, len(breakdownMap))
	for _, category := range []string{"Pokemon", "Trainer", "Energy"} {
		if item, ok := breakdownMap[category]; ok {
			categoryBreakdown = append(categoryBreakdown, *item)
			delete(breakdownMap, category)
		}
	}
	for _, item := range breakdownMap {
		categoryBreakdown = append(categoryBreakdown, *item)
	}

	if rec.RequiredCards == 0 {
		warnings = append(warnings, "Representative decklist belum punya data kartu terstruktur.")
	} else if rec.RequiredCards < 60 {
		warnings = append(warnings, fmt.Sprintf("Representative decklist baru memuat %d/60 kartu; analisis tetap ditampilkan dengan data parsial.", rec.RequiredCards))
	}
	if priceGaps > 0 {
		warnings = append(warnings, fmt.Sprintf("%d missing card belum punya harga IDR, jadi estimasi upgrade bisa lebih rendah dari kondisi pasar.", priceGaps))
	}

	return models.ResearchDeckAnalysis{
		CollectionID:            collectionID,
		DeckID:                  deck.ID,
		DeckName:                deck.Name,
		Archetype:               deck.Archetype,
		Tier:                    rec.Tier,
		MetaScore:               rec.MetaScore,
		CompletenessPct:         rec.CompletenessPct,
		OwnedCards:              rec.OwnedCards,
		RequiredCards:           rec.RequiredCards,
		EstimatedUpgradeCostIDR: rec.EstimatedUpgradeCostIDR,
		TournamentStats: models.ResearchTournamentStats{
			TournamentCount: deck.TournamentCount,
			WinCount:        deck.WinCount,
			Top8Count:       deck.Top8Count,
		},
		DeckSource:          s.deckSource(ctx, deck.ID),
		DeckStatistics:      stats,
		CategoryBreakdown:   categoryBreakdown,
		CardUsage:           cardUsage,
		MissingCards:        rec.MissingCards,
		UpgradePlan:         upgradePlanFromUsage(cardUsage),
		TacticalProfile:     tacticalProfile(deck, cardUsage),
		DataQualityWarnings: warnings,
	}
}

func (s *ResearchService) deckSource(ctx context.Context, deckID string) models.ResearchDeckSource {
	source := models.ResearchDeckSource{}
	_ = s.db.QueryRowContext(ctx, `
		SELECT dl.id, COALESCE(dl.name, ''), COALESCE(dl.player_name, ''),
		       COALESCE(t.name, ''), COALESCE(t.date, ''), COALESCE(dl.placement, 0)
		FROM decklists dl
		LEFT JOIN tournaments t ON t.id = dl.tournament_id
		WHERE dl.deck_id = ?
		ORDER BY CASE WHEN dl.placement > 0 THEN 0 ELSE 1 END, dl.placement ASC, dl.created_at DESC
		LIMIT 1
	`, deckID).Scan(
		&source.DecklistID,
		&source.DecklistName,
		&source.PlayerName,
		&source.TournamentName,
		&source.TournamentDate,
		&source.Placement,
	)
	return source
}

func aggregateDeckCards(cards []models.DeckCard) []models.DeckCard {
	ordered := make([]models.DeckCard, 0, len(cards))
	index := map[string]int{}
	for _, card := range cards {
		if card.Count <= 0 {
			continue
		}
		if position, ok := index[card.CardID]; ok {
			ordered[position].Count += card.Count
			if ordered[position].CardName == "" {
				ordered[position].CardName = card.CardName
			}
			if ordered[position].Category == "" {
				ordered[position].Category = card.Category
			}
			if ordered[position].CardType == "" {
				ordered[position].CardType = card.CardType
			}
			ordered[position].IsPokemon = ordered[position].IsPokemon || card.IsPokemon
			continue
		}
		index[card.CardID] = len(ordered)
		ordered = append(ordered, card)
	}
	return ordered
}

func (s *ResearchService) bestPriceIDR(ctx context.Context, cardID string) float64 {
	var price sql.NullFloat64
	_ = s.db.QueryRowContext(ctx, `
		SELECT MIN(price_idr)
		FROM card_prices
		WHERE card_id = ? AND price_idr IS NOT NULL AND price_idr > 0
	`, cardID).Scan(&price)
	if price.Valid {
		return price.Float64
	}
	return 0
}

func (s *ResearchService) cardMetaFrequency(ctx context.Context, cardID string) int {
	var frequency int
	_ = s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM deck_cards WHERE card_id = ?`, cardID).Scan(&frequency)
	return frequency
}

func (s *ResearchService) cardMetaStats(ctx context.Context, cardID string) (int, int) {
	var appearances int
	var totalCopies sql.NullInt64
	_ = s.db.QueryRowContext(ctx, `
		SELECT COUNT(*), COALESCE(SUM(count), 0)
		FROM deck_cards
		WHERE card_id = ?
	`, cardID).Scan(&appearances, &totalCopies)
	if totalCopies.Valid {
		return appearances, int(totalCopies.Int64)
	}
	return appearances, 0
}

func (s *ResearchService) metaScore(deck models.Deck) float64 {
	score := float64(deck.TournamentCount)*4 + float64(deck.WinCount)*12 + float64(deck.Top8Count)*8
	if score == 0 {
		score = 35
	}
	return math.Min(100, score)
}

func (s *ResearchService) counterBonus(target, candidate models.Deck) float64 {
	targetText := strings.ToLower(target.Name + " " + target.Archetype)
	candidateText := strings.ToLower(candidate.Name + " " + candidate.Archetype)
	bonus := 0.0

	switch {
	case strings.Contains(targetText, "dragapult"):
		if strings.Contains(candidateText, "charizard") || strings.Contains(candidateText, "froslass") {
			bonus += 22
		}
	case strings.Contains(targetText, "charizard"):
		if strings.Contains(candidateText, "raging") || strings.Contains(candidateText, "ogerpon") || strings.Contains(candidateText, "water") {
			bonus += 22
		}
	case strings.Contains(targetText, "gardevoir") || strings.Contains(targetText, "alakazam"):
		if strings.Contains(candidateText, "zoroark") || strings.Contains(candidateText, "dark") {
			bonus += 24
		}
	}

	if strings.Contains(candidateText, "anti") || strings.Contains(candidateText, "control") || strings.Contains(candidateText, "froslass") {
		bonus += 12
	}
	return bonus
}

func (s *ResearchService) techCardsForTarget(target models.Deck) []string {
	text := strings.ToLower(target.Name + " " + target.Archetype)
	switch {
	case strings.Contains(text, "dragapult"):
		return []string{"Jimat Keberanian", "Tandu Malam", "Judge", "Noctowl engine"}
	case strings.Contains(text, "charizard"):
		return []string{"Boss's Orders", "Energy denial", "Water attacker", "Tool Scrapper"}
	case strings.Contains(text, "gardevoir"):
		return []string{"Darkness attacker", "Judge", "Hand disruption", "Bench pressure"}
	default:
		return []string{"Judge", "Boss's Orders", "Enhanced Hammer", "Flexible ACE SPEC"}
	}
}

func (s *ResearchService) matchupNotes(target, candidate models.Deck) []string {
	return []string{
		fmt.Sprintf("%s dipilih karena punya tekanan meta tinggi melawan %s.", candidate.Name, target.Name),
		"Prioritaskan setup konsisten sebelum mengejar knockout cepat.",
		"Gunakan tech cards untuk memaksa lawan keluar dari pola permainan utama.",
	}
}

func (s *ResearchService) fallbackPredictions(category string, limit int) []models.MetaPrediction {
	seeds := []models.MetaPrediction{
		{CardName: "Ketetapan Hati Lillie", Category: "Trainer", CardType: "Supporter", Appearances: 4, TotalCopies: 16},
		{CardName: "Poffin Bersahabat", Category: "Trainer", CardType: "Item", Appearances: 4, TotalCopies: 16},
		{CardName: "Fezandipiti ex", Category: "Pokemon", CardType: "Darkness", Appearances: 4, TotalCopies: 4},
		{CardName: "Dragapult ex", Category: "Pokemon", CardType: "Dragon", Appearances: 3, TotalCopies: 9},
		{CardName: "Judge", Category: "Trainer", CardType: "Supporter", Appearances: 3, TotalCopies: 10},
	}

	filtered := make([]models.MetaPrediction, 0)
	for i, seed := range seeds {
		if category != "" && seed.Category != category && seed.CardType != category {
			continue
		}
		seed.CardID = fmt.Sprintf("seed-%d", i+1)
		seed = s.enrichCardPrediction(seed, 6)
		seed.Reason = seed.CardName + " muncul sebagai seed PokeLab karena kuat sebagai staple meta saat data structured belum cukup."
		seed.Factors = append(seed.Factors, "Seed dari panduan meta lokal")
		filtered = append(filtered, seed)
	}

	if len(filtered) > limit {
		return filtered[:limit]
	}
	return filtered
}

func cardCategory(card models.DeckCard) string {
	category := strings.TrimSpace(card.Category)
	lowerCategory := strings.ToLower(category)
	lowerName := strings.ToLower(card.CardName)
	lowerType := strings.ToLower(card.CardType)

	switch {
	case strings.Contains(lowerCategory, "pokemon") || card.IsPokemon:
		return "Pokemon"
	case strings.Contains(lowerCategory, "energy") || strings.Contains(lowerType, "energy") || strings.Contains(lowerName, "energy") || strings.Contains(lowerName, "energi"):
		return "Energy"
	case category != "":
		return category
	default:
		return "Trainer"
	}
}

func cardRole(card models.DeckCard) string {
	name := strings.ToLower(card.CardName)
	cardType := strings.ToLower(card.CardType)
	category := cardCategory(card)

	if category == "Energy" {
		return "energy"
	}
	if category == "Pokemon" {
		switch {
		case strings.Contains(name, "pidgeot") || strings.Contains(name, "bibarel") || strings.Contains(name, "rotom") || strings.Contains(name, "fezandipiti") || strings.Contains(name, "noctowl") || strings.Contains(name, "lumineon"):
			return "engine"
		case card.Count >= 2 || strings.Contains(name, " ex") || strings.Contains(name, "vstar") || strings.Contains(name, "vmax") || strings.Contains(name, "charizard") || strings.Contains(name, "dragapult") || strings.Contains(name, "gardevoir"):
			return "attacker"
		default:
			return "support"
		}
	}

	switch {
	case strings.Contains(name, "boss") || strings.Contains(name, "perintah bos") || strings.Contains(name, "counter catcher") || strings.Contains(name, "catcher"):
		return "gust"
	case strings.Contains(name, "judge") || strings.Contains(name, "iono") || strings.Contains(name, "hammer") || strings.Contains(name, "vacuum") || strings.Contains(name, "stamp"):
		return "disruption"
	case strings.Contains(name, "ultra ball") || strings.Contains(name, "nest ball") || strings.Contains(name, "poffin") || strings.Contains(name, "arven") || strings.Contains(name, "irida") || strings.Contains(name, "bola"):
		return "search"
	case strings.Contains(name, "professor") || strings.Contains(name, "research") || strings.Contains(name, "lillie") || strings.Contains(name, "draw"):
		return "draw"
	case strings.Contains(name, "switch") || strings.Contains(name, "escape") || strings.Contains(name, "tukar"):
		return "switch"
	case strings.Contains(name, "stadium") || strings.Contains(cardType, "stadium") || strings.Contains(name, "city") || strings.Contains(name, "temple"):
		return "stadium"
	default:
		return "support"
	}
}

func importanceScore(card models.DeckCard, role string, frequency int) float64 {
	score := 20.0 + float64(card.Count)*8 + math.Min(30, float64(frequency)*1.5)
	switch role {
	case "attacker", "engine":
		score += 22
	case "search", "draw":
		score += 18
	case "gust", "disruption":
		score += 14
	case "energy":
		score += 6
	}
	if strings.Contains(strings.ToLower(card.CardName), "ex") {
		score += 10
	}
	return round(math.Min(100, score))
}

func usageNote(card models.DeckCard, role string, frequency int) string {
	name := card.CardName
	switch role {
	case "attacker":
		return fmt.Sprintf("%s adalah win condition atau pressure utama; jumlah copy menentukan konsistensi serangan.", name)
	case "engine":
		return fmt.Sprintf("%s menjaga setup dan refill resource agar deck tidak kehabisan tempo.", name)
	case "search":
		return fmt.Sprintf("%s mempercepat akses kartu kunci; biasanya diprioritaskan sebelum tech situasional.", name)
	case "draw":
		return fmt.Sprintf("%s menjaga flow kartu dan membantu menemukan line permainan berikutnya.", name)
	case "gust":
		return fmt.Sprintf("%s membuka jalur knockout ke target penting di bench lawan.", name)
	case "disruption":
		return fmt.Sprintf("%s mengganggu tangan, energi, atau tempo lawan ketika game mulai stabil.", name)
	case "stadium":
		return fmt.Sprintf("%s mengubah board state dan membantu matchup tertentu.", name)
	case "energy":
		return fmt.Sprintf("%s adalah resource dasar untuk menjalankan attacker dan tempo deck.", name)
	default:
		if frequency > 8 {
			return fmt.Sprintf("%s sering muncul di deck meta lain, jadi nilainya tinggi sebagai staple fleksibel.", name)
		}
		return fmt.Sprintf("%s mengisi paket support deck dan menjaga rencana utama tetap konsisten.", name)
	}
}

func upgradePlanFromUsage(cardUsage []models.ResearchCardUsage) []models.ResearchUpgradeStep {
	steps := make([]models.ResearchUpgradeStep, 0)
	for _, card := range cardUsage {
		if card.MissingCount <= 0 {
			continue
		}
		steps = append(steps, models.ResearchUpgradeStep{
			Priority:         card.BuyPriority,
			CardID:           card.CardID,
			CardName:         card.CardName,
			MissingCount:     card.MissingCount,
			EstimatedCostIDR: card.TotalMissingCostIDR,
			Reason:           upgradeReason(card),
		})
	}
	sort.SliceStable(steps, func(i, j int) bool {
		if priorityRank(steps[i].Priority) == priorityRank(steps[j].Priority) {
			return steps[i].EstimatedCostIDR > steps[j].EstimatedCostIDR
		}
		return priorityRank(steps[i].Priority) > priorityRank(steps[j].Priority)
	})
	if len(steps) > 12 {
		return steps[:12]
	}
	return steps
}

func upgradeReason(card models.ResearchCardUsage) string {
	switch card.Role {
	case "attacker", "engine":
		return "Core deck piece; missing copy langsung menurunkan konsistensi game plan."
	case "search", "draw":
		return "Consistency card; beli lebih awal agar setup awal lebih stabil."
	case "gust", "disruption":
		return "Matchup tool; penting setelah core engine dan attacker aman."
	default:
		return "Lengkapi jika budget masih tersedia setelah kartu prioritas tinggi."
	}
}

func tacticalProfile(deck models.Deck, cardUsage []models.ResearchCardUsage) models.ResearchTacticalProfile {
	text := strings.ToLower(deck.Name + " " + deck.Archetype)
	playstyle := "Balanced tempo"
	if strings.Contains(text, "control") || strings.Contains(text, "stall") {
		playstyle = "Control and resource denial"
	} else if strings.Contains(text, "raging") || strings.Contains(text, "miraidon") || strings.Contains(text, "turbo") {
		playstyle = "Aggressive tempo"
	} else if strings.Contains(text, "charizard") || strings.Contains(text, "gardevoir") || strings.Contains(text, "dragapult") {
		playstyle = "Setup midrange"
	}

	keyCards := make([]string, 0, 5)
	for _, card := range cardUsage {
		if len(keyCards) >= 5 {
			break
		}
		if card.Role == "attacker" || card.Role == "engine" || card.ImportanceScore >= 75 {
			keyCards = append(keyCards, card.CardName)
		}
	}

	return models.ResearchTacticalProfile{
		Playstyle: playstyle,
		GamePlan: []string{
			"Stabilkan setup awal dengan kartu search dan draw sebelum mengejar prize trade.",
			"Prioritaskan core attacker dan engine yang punya importance score tertinggi.",
			"Simpan gust atau disruption untuk turn yang mengubah tempo, bukan sekadar playable card.",
		},
		Strengths: []string{
			fmt.Sprintf("Meta score %.0f menunjukkan deck ini punya sinyal turnamen yang layak diuji.", deckMetaScore(deck)),
			"Representative list sudah bisa dipetakan ke role kartu sehingga mudah menentukan prioritas latihan.",
		},
		Weaknesses: []string{
			"Missing core card akan terasa lebih berat daripada missing tech card.",
			"Data matchup detail masih berbasis rule PokeLab dan perlu dikonfirmasi lewat playtest lokal.",
		},
		KeyCards:     keyCards,
		MatchupNotes: matchupNotesForDeck(deck),
	}
}

func matchupNotesForDeck(deck models.Deck) []string {
	text := strings.ToLower(deck.Name + " " + deck.Archetype)
	switch {
	case strings.Contains(text, "charizard"):
		return []string{"Latih sequence Rare Candy dan timing evolusi.", "Waspadai disruption hand sebelum setup attacker kedua."}
	case strings.Contains(text, "dragapult"):
		return []string{"Manfaatkan spread damage untuk memaksa bench lawan tidak aman.", "Jaga resource switching agar attacker utama tidak terkunci."}
	case strings.Contains(text, "gardevoir"):
		return []string{"Kelola discard pile sebagai resource, bukan tempat buang kartu acak.", "Perhatikan prize map saat memakai attacker kecil."}
	default:
		return []string{"Uji 5 game melawan deck paling sering di lokal sebelum membeli tech mahal.", "Catat kartu yang sering mati di tangan untuk evaluasi substitution."}
	}
}

func deckMetaScore(deck models.Deck) float64 {
	score := float64(deck.TournamentCount)*4 + float64(deck.WinCount)*12 + float64(deck.Top8Count)*8
	if score == 0 {
		return 35
	}
	return math.Min(100, score)
}

func applyCardStatisticRanks(cardUsage []models.ResearchCardUsage, totalMissingCopies int, totalMissingValue float64) {
	categoryRank := map[string]int{}
	for i := range cardUsage {
		cardUsage[i].Statistics.OverallRank = i + 1
		categoryRank[cardUsage[i].Category]++
		cardUsage[i].Statistics.CategoryRank = categoryRank[cardUsage[i].Category]
		cardUsage[i].Statistics.MissingSharePct = percent(cardUsage[i].MissingCount, totalMissingCopies)
		if totalMissingValue > 0 {
			cardUsage[i].Statistics.MissingCostSharePct = round(cardUsage[i].TotalMissingCostIDR / totalMissingValue * 100)
		}
	}
}

func ownershipStatus(owned, required int) string {
	switch {
	case required <= 0:
		return "unknown"
	case owned <= 0:
		return "missing"
	case owned < required:
		return "partial"
	case owned == required:
		return "complete"
	default:
		return "extra"
	}
}

func avgCopies(totalCopies, appearances int) float64 {
	if appearances <= 0 {
		return 0
	}
	return round(float64(totalCopies) / float64(appearances))
}

func percent(part, total int) float64 {
	if total <= 0 {
		return 0
	}
	return round(float64(part) / float64(total) * 100)
}

func buyPriority(card models.DeckCard, missingCount int, deck models.Deck) string {
	if missingCount <= 0 {
		return "low"
	}
	name := strings.ToLower(card.CardName)
	if card.IsPokemon || strings.Contains(name, "ace spec") || strings.Contains(name, "ex") || deck.WinCount > 0 {
		return "high"
	}
	if missingCount >= 3 || strings.Contains(name, "poffin") || strings.Contains(name, "judge") || strings.Contains(name, "lillie") {
		return "medium"
	}
	return "low"
}

func substituteSuggestions(card models.DeckCard) []string {
	name := strings.ToLower(card.CardName)
	switch {
	case strings.Contains(name, "boss") || strings.Contains(name, "perintah"):
		return []string{"Pokemon Catcher", "Counter Catcher"}
	case strings.Contains(name, "poffin"):
		return []string{"Bola Nest", "Bola Ultra"}
	case strings.Contains(name, "rare candy") || strings.Contains(name, "permen"):
		return []string{"Evolution line ekstra", "Item search tambahan"}
	default:
		return nil
	}
}

func recommendationReason(deck models.Deck, completeness, cost float64) string {
	if completeness >= 90 {
		return fmt.Sprintf("%s hampir siap dimainkan dari koleksi kamu; upgrade cost rendah dan meta score kuat.", deck.Name)
	}
	if completeness >= 70 {
		return fmt.Sprintf("%s punya fondasi inventory bagus; fokus beli kartu prioritas tinggi dulu.", deck.Name)
	}
	if cost > 0 {
		return fmt.Sprintf("%s menarik secara meta, tapi masih butuh investasi sekitar Rp%.0f.", deck.Name, cost)
	}
	return fmt.Sprintf("%s punya sinyal meta bagus, namun data harga/missing card masih terbatas.", deck.Name)
}

func tierFromScore(score float64) string {
	switch {
	case score >= 85:
		return "S"
	case score >= 65:
		return "A"
	case score >= 45:
		return "B"
	default:
		return "C"
	}
}

func trendLabel(score float64) string {
	switch {
	case score >= 75:
		return "rising"
	case score >= 45:
		return "watch"
	default:
		return "stable"
	}
}

func priorityRank(priority string) int {
	switch priority {
	case "high":
		return 3
	case "medium":
		return 2
	default:
		return 1
	}
}

func round(v float64) float64 {
	return math.Round(v*10) / 10
}
