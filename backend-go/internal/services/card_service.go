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

// CardService handles card-related business logic
type CardService struct {
	db        *sql.DB
	aiService *AIService
}

// NewCardService creates a new CardService
func NewCardService(db *sql.DB, aiService *AIService) *CardService {
	return &CardService{db: db, aiService: aiService}
}

// SearchCards searches cards with filters
func (s *CardService) SearchCards(ctx context.Context, req models.CardSearchRequest) (*models.CardSearchResponse, error) {
	// Build query
	whereClause := `
		WHERE NOT EXISTS (
			SELECT 1 FROM cards canonical
			WHERE canonical.id = CAST(c.external_id AS TEXT)
			  AND canonical.id <> c.id
		)
	`
	args := []interface{}{}

	if req.Query != "" {
		whereClause += " AND (c.name_id LIKE ? OR c.name_en LIKE ?)"
		searchTerm := "%" + req.Query + "%"
		args = append(args, searchTerm, searchTerm)
	}

	if req.ExpansionCode != "" {
		whereClause += " AND c.expansion_code = ?"
		args = append(args, req.ExpansionCode)
	}

	if req.Category != "" {
		whereClause += " AND c.category = ?"
		args = append(args, req.Category)
	}

	if req.CardType != "" {
		whereClause += " AND c.card_type = ?"
		args = append(args, req.CardType)
	}

	if req.RegulationMark != "" {
		whereClause += " AND c.regulation_mark = ?"
		args = append(args, req.RegulationMark)
	}

	if req.Rarity != "" {
		whereClause += " AND c.rarity = ?"
		args = append(args, req.Rarity)
	}

	// Get total count
	countQuery := "SELECT COUNT(*) FROM cards c " + whereClause
	var total int64
	err := s.db.QueryRowContext(ctx, countQuery, args...).Scan(&total)
	if err != nil {
		return nil, fmt.Errorf("failed to count cards: %w", err)
	}

	// Get cards with pagination
	offset := (req.Page - 1) * req.Limit
	orderBy := cardSearchOrderBy(req.SortBy, req.SortOrder)
	query := fmt.Sprintf(`
		SELECT c.id, COALESCE(c.external_id, 0), c.name_id, COALESCE(c.name_en, ''), COALESCE(c.category, ''), COALESCE(c.expansion_code, ''), 
		       COALESCE(c.collector_number, ''), COALESCE(c.regulation_mark, ''), COALESCE(c.rarity, ''), 
		       COALESCE(c.illustrator, ''), COALESCE(c.image_url, ''),
		       c.hp, c.card_type, c.evolution_stage, c.evolves_from, c.retreat_cost,
		       c.attacks, c.abilities, c.weakness, c.resistance, c.pokedex,
		       c.created_at, c.updated_at
		FROM cards c
		LEFT JOIN expansions e ON e.code = c.expansion_code
		%s
		ORDER BY %s
		LIMIT ? OFFSET ?
	`, whereClause, orderBy)

	rows, err := s.db.QueryContext(ctx, query, append(args, req.Limit, offset)...)
	if err != nil {
		return nil, fmt.Errorf("failed to query cards: %w", err)
	}
	defer rows.Close()

	cards := make([]models.Card, 0)
	for rows.Next() {
		var card models.Card
		var externalID int64
		var hp, retreatCost sql.NullInt64
		var cardType, evolutionStage, evolvesFrom sql.NullString
		var attacksJSON, abilitiesJSON, weaknessJSON, resistanceJSON, pokedexJSON []byte
		var createdAt, updatedAt sql.NullTime

		err := rows.Scan(
			&card.ID, &externalID, &card.NameID, &card.NameEN, &card.Category,
			&card.ExpansionCode, &card.CollectorNumber, &card.RegulationMark, &card.Rarity,
			&card.Illustrator, &card.ImageURL, &hp, &cardType,
			&evolutionStage, &evolvesFrom, &retreatCost,
			&attacksJSON, &abilitiesJSON, &weaknessJSON, &resistanceJSON, &pokedexJSON,
			&createdAt, &updatedAt,
		)
		if err != nil {
			fmt.Printf("Scan error: %v\n", err)
			continue
		}

		card.ExternalID = fmt.Sprintf("%d", externalID)

		// Convert nullable fields
		if hp.Valid {
			hpVal := int(hp.Int64)
			card.HP = &hpVal
		}
		if retreatCost.Valid {
			rcVal := int(retreatCost.Int64)
			card.RetreatCost = &rcVal
		}
		if cardType.Valid {
			card.CardType = &cardType.String
		}
		if evolutionStage.Valid {
			card.EvolutionStage = &evolutionStage.String
		}
		if evolvesFrom.Valid {
			card.EvolvesFrom = &evolvesFrom.String
		}
		if len(attacksJSON) > 0 {
			_ = json.Unmarshal(attacksJSON, &card.Attacks)
		}
		if len(abilitiesJSON) > 0 {
			_ = json.Unmarshal(abilitiesJSON, &card.Abilities)
		}
		if len(weaknessJSON) > 0 {
			_ = json.Unmarshal(weaknessJSON, &card.Weakness)
		}
		if len(resistanceJSON) > 0 {
			_ = json.Unmarshal(resistanceJSON, &card.Resistance)
		}
		if len(pokedexJSON) > 0 {
			_ = json.Unmarshal(pokedexJSON, &card.Pokedex)
		}
		if createdAt.Valid {
			card.CreatedAt = createdAt.Time
		}
		if updatedAt.Valid {
			card.UpdatedAt = updatedAt.Time
		}

		cards = append(cards, card)
	}

	if err = rows.Err(); err != nil {
		fmt.Printf("Rows error: %v\n", err)
	}

	totalPages := int((total + int64(req.Limit) - 1) / int64(req.Limit))

	return &models.CardSearchResponse{
		Cards:      cards,
		Total:      total,
		Page:       req.Page,
		Limit:      req.Limit,
		TotalPages: totalPages,
	}, nil
}

func cardSearchOrderBy(sortBy, sortOrder string) string {
	order := strings.ToUpper(sortOrder)
	if order != "DESC" {
		order = "ASC"
	}

	switch strings.ToLower(sortBy) {
	case "name_id", "name":
		return "c.name_id " + order + ", COALESCE(e.released_at, '') DESC, c.expansion_code DESC, c.collector_number ASC"
	case "expansion":
		return "COALESCE(e.released_at, '') " + order + ", c.expansion_code " + order + ", c.collector_number ASC, c.name_id ASC"
	case "rarity":
		return "c.rarity " + order + ", COALESCE(e.released_at, '') DESC, c.name_id ASC"
	case "collector_number":
		return "c.collector_number " + order + ", c.name_id ASC"
	default:
		return "COALESCE(e.released_at, '') DESC, c.expansion_code DESC, c.collector_number ASC, c.name_id ASC"
	}
}

// GetCardByID gets a card by ID
func (s *CardService) GetCardByID(ctx context.Context, id string) (*models.Card, error) {
	var card models.Card
	var externalID sql.NullInt64
	var nameEN, category, expansionCode, collectorNumber, regulationMark, rarity, illustrator, imageURL sql.NullString
	var hp sql.NullInt64
	var cardType, evolutionStage, evolvesFrom sql.NullString
	var retreatCost sql.NullInt64
	var attacksJSON, abilitiesJSON, weaknessJSON, resistanceJSON, pokedexJSON []byte

	var createdAt, updatedAt sql.NullTime

	err := s.db.QueryRowContext(ctx, `
		SELECT id, external_id, name_id, name_en, category, expansion_code, 
		       collector_number, regulation_mark, rarity, illustrator, image_url,
		       hp, card_type, evolution_stage, evolves_from, retreat_cost,
		       attacks, abilities, weakness, resistance, pokedex,
		       created_at, updated_at
		FROM cards WHERE id = ?
	`, id).Scan(
		&card.ID, &externalID, &card.NameID, &nameEN, &category,
		&expansionCode, &collectorNumber, &regulationMark, &rarity,
		&illustrator, &imageURL, &hp, &cardType,
		&evolutionStage, &evolvesFrom, &retreatCost,
		&attacksJSON, &abilitiesJSON, &weaknessJSON, &resistanceJSON, &pokedexJSON,
		&createdAt, &updatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("card not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get card: %w", err)
	}

	// Handle NULL fields
	if externalID.Valid {
		card.ExternalID = fmt.Sprintf("%d", externalID.Int64)
	}
	if nameEN.Valid {
		card.NameEN = nameEN.String
	}
	if category.Valid {
		card.Category = category.String
	}
	if expansionCode.Valid {
		card.ExpansionCode = expansionCode.String
	}
	if collectorNumber.Valid {
		card.CollectorNumber = collectorNumber.String
	}
	if regulationMark.Valid {
		card.RegulationMark = regulationMark.String
	}
	if rarity.Valid {
		card.Rarity = rarity.String
	}
	if illustrator.Valid {
		card.Illustrator = illustrator.String
	}
	if imageURL.Valid {
		card.ImageURL = imageURL.String
	}
	if hp.Valid {
		hpInt := int(hp.Int64)
		card.HP = &hpInt
	}
	if cardType.Valid {
		card.CardType = &cardType.String
	}
	if evolutionStage.Valid {
		card.EvolutionStage = &evolutionStage.String
	}
	if evolvesFrom.Valid {
		card.EvolvesFrom = &evolvesFrom.String
	}
	if retreatCost.Valid {
		rcInt := int(retreatCost.Int64)
		card.RetreatCost = &rcInt
	}
	card.Attacks = decodeJSONValue(attacksJSON)
	card.Abilities = decodeJSONValue(abilitiesJSON)
	card.Weakness = decodeJSONValue(weaknessJSON)
	card.Resistance = decodeJSONValue(resistanceJSON)
	card.Pokedex = decodeJSONValue(pokedexJSON)
	if createdAt.Valid {
		card.CreatedAt = createdAt.Time
	}
	if updatedAt.Valid {
		card.UpdatedAt = updatedAt.Time
	}

	return &card, nil
}

func decodeJSONValue(raw []byte) interface{} {
	if len(raw) == 0 {
		return nil
	}
	var decoded interface{}
	if err := json.Unmarshal(raw, &decoded); err != nil {
		return nil
	}
	return decoded
}

// GetCardPrices gets all prices for a card
func (s *CardService) GetCardPrices(ctx context.Context, cardID string) (map[string]interface{}, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT source, price_idr, price_usd, currency, condition, url, scraped_at
		FROM card_prices WHERE card_id = ?
	`, cardID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var prices []map[string]interface{}
	for rows.Next() {
		var p struct {
			Source    string   `json:"source"`
			PriceIDR  *float64 `json:"price_idr"`
			PriceUSD  *float64 `json:"price_usd"`
			Currency  string   `json:"currency"`
			Condition string   `json:"condition"`
			URL       string   `json:"url"`
			ScrapedAt *string  `json:"scraped_at"`
		}
		err := rows.Scan(&p.Source, &p.PriceIDR, &p.PriceUSD, &p.Currency, &p.Condition, &p.URL, &p.ScrapedAt)
		if err != nil {
			continue
		}
		prices = append(prices, map[string]interface{}{
			"source":    p.Source,
			"price_idr": p.PriceIDR,
			"price_usd": p.PriceUSD,
			"condition": p.Condition,
			"url":       p.URL,
		})
	}

	return map[string]interface{}{
		"card_id": cardID,
		"prices":  prices,
	}, nil
}

// GetExpansions gets all expansions
func (s *CardService) GetExpansions(ctx context.Context) ([]models.Expansion, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, code, name_id, name_en, series_id, series_name_en, series_name_id,
		       product_type, total_cards, released_at, pack_image_url, set_symbol_url
		FROM expansions ORDER BY released_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	expansions := make([]models.Expansion, 0)
	for rows.Next() {
		var e models.Expansion
		var seriesID, totalCards sql.NullInt64
		var nameEN, seriesNameEN, seriesNameID, productType, releasedAt, packImageURL, setSymbolURL sql.NullString

		err := rows.Scan(
			&e.ID, &e.Code, &e.NameID, &nameEN, &seriesID, &seriesNameEN, &seriesNameID,
			&productType, &totalCards, &releasedAt, &packImageURL, &setSymbolURL,
		)
		if err != nil {
			fmt.Printf("Expansion scan error: %v\n", err)
			continue
		}

		// Convert nullable fields
		if nameEN.Valid {
			e.NameEN = nameEN.String
		}
		if seriesID.Valid {
			sid := int(seriesID.Int64)
			e.SeriesID = &sid
		}
		if seriesNameEN.Valid {
			e.SeriesNameEN = seriesNameEN.String
		}
		if seriesNameID.Valid {
			e.SeriesNameID = seriesNameID.String
		}
		if productType.Valid {
			e.ProductType = productType.String
		}
		if totalCards.Valid {
			e.TotalCards = int(totalCards.Int64)
		}
		if releasedAt.Valid {
			// Parse date string to time.Time
			if t, err := time.Parse("2006-01-02", releasedAt.String); err == nil {
				e.ReleasedAt = &t
			}
		}
		if packImageURL.Valid {
			e.PackImageURL = packImageURL.String
		}
		if setSymbolURL.Valid {
			e.SetSymbolURL = setSymbolURL.String
		}

		expansions = append(expansions, e)
	}

	return expansions, nil
}

// GetExpansionByCode gets expansion by code
func (s *CardService) GetExpansionByCode(ctx context.Context, code string) (*models.ExpansionSummary, error) {
	var exp models.Expansion
	var seriesID, totalCards sql.NullInt64
	var nameEN, seriesNameEN, seriesNameID, productType, releasedAt, packImageURL, setSymbolURL sql.NullString

	err := s.db.QueryRowContext(ctx, `
		SELECT id, code, name_id, name_en, series_id, series_name_en, series_name_id,
		       product_type, total_cards, released_at, pack_image_url, set_symbol_url
		FROM expansions WHERE code = ?
	`, code).Scan(
		&exp.ID, &exp.Code, &exp.NameID, &nameEN, &seriesID, &seriesNameEN, &seriesNameID,
		&productType, &totalCards, &releasedAt, &packImageURL, &setSymbolURL,
	)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("expansion not found")
	}
	if err != nil {
		return nil, err
	}

	// Convert nullable fields
	if nameEN.Valid {
		exp.NameEN = nameEN.String
	}
	if seriesID.Valid {
		sid := int(seriesID.Int64)
		exp.SeriesID = &sid
	}
	if seriesNameEN.Valid {
		exp.SeriesNameEN = seriesNameEN.String
	}
	if seriesNameID.Valid {
		exp.SeriesNameID = seriesNameID.String
	}
	if productType.Valid {
		exp.ProductType = productType.String
	}
	if totalCards.Valid {
		exp.TotalCards = int(totalCards.Int64)
	}
	if releasedAt.Valid {
		// Parse date string to time.Time
		if t, err := time.Parse("2006-01-02", releasedAt.String); err == nil {
			exp.ReleasedAt = &t
		}
	}
	if packImageURL.Valid {
		exp.PackImageURL = packImageURL.String
	}
	if setSymbolURL.Valid {
		exp.SetSymbolURL = setSymbolURL.String
	}

	// Get card count
	var cardCount int
	s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM cards WHERE expansion_code = ?", code).Scan(&cardCount)

	return &models.ExpansionSummary{
		Expansion: exp,
		CardCount: cardCount,
	}, nil
}

// GetCardsByExpansion gets cards by expansion
func (s *CardService) GetCardsByExpansion(ctx context.Context, code string, page, limit int) (*models.CardSearchResponse, error) {
	req := models.CardSearchRequest{
		ExpansionCode: code,
		Page:          page,
		Limit:         limit,
	}
	return s.SearchCards(ctx, req)
}

// ExplainCard explains a card using AI
func (s *CardService) ExplainCard(ctx context.Context, cardID string) (string, error) {
	card, err := s.GetCardByID(ctx, cardID)
	if err != nil {
		return "", err
	}

	context := map[string]interface{}{
		"card":       card,
		"meta_usage": s.getCardMetaUsage(ctx, card),
	}
	cardData, _ := json.Marshal(context)
	explanation, err := s.aiService.ExplainCard(ctx, card.NameID, string(cardData))
	if err == nil && strings.TrimSpace(explanation) != "" {
		return explanation, nil
	}

	return localCardScoutReport(card, context["meta_usage"]), nil
}

func (s *CardService) getCardMetaUsage(ctx context.Context, card *models.Card) map[string]interface{} {
	usage := map[string]interface{}{
		"decklist_appearances": 0,
		"total_copies":         0,
		"top_sources":          []map[string]interface{}{},
	}

	var appearances, totalCopies int
	_ = s.db.QueryRowContext(ctx, `
		SELECT COUNT(DISTINCT dc.deck_id), COALESCE(SUM(dc.count), 0)
		FROM deck_cards dc
		LEFT JOIN cards c ON c.id = dc.card_id
		WHERE dc.card_id = ?
			OR LOWER(c.name_id) = LOWER(?)
			OR LOWER(c.name_en) = LOWER(?)
	`, card.ID, card.NameID, card.NameEN).Scan(&appearances, &totalCopies)
	usage["decklist_appearances"] = appearances
	usage["total_copies"] = totalCopies

	rows, err := s.db.QueryContext(ctx, `
		SELECT COALESCE(dl.player_name, ''), COALESCE(t.name, ''), COALESCE(t.date, ''),
			dl.placement, dc.count, COALESCE(d.name, ''), COALESCE(dl.name, ''), dc.deck_id
		FROM deck_cards dc
		LEFT JOIN cards c ON c.id = dc.card_id
		LEFT JOIN decklists dl ON dl.id = dc.deck_id OR dl.deck_id = dc.deck_id
		LEFT JOIN tournaments t ON t.id = dl.tournament_id
		LEFT JOIN decks d ON d.id = COALESCE(dl.deck_id, dc.deck_id)
		WHERE dc.card_id = ?
			OR LOWER(c.name_id) = LOWER(?)
			OR LOWER(c.name_en) = LOWER(?)
		ORDER BY CASE WHEN dl.placement > 0 THEN 0 ELSE 1 END, dl.placement ASC, dl.created_at DESC
		LIMIT 5
	`, card.ID, card.NameID, card.NameEN)
	if err != nil {
		return usage
	}
	defer rows.Close()

	sources := make([]map[string]interface{}, 0)
	for rows.Next() {
		var playerName, tournamentName, tournamentDate, deckName, decklistName, deckID sql.NullString
		var placement, count sql.NullInt64
		if err := rows.Scan(&playerName, &tournamentName, &tournamentDate, &placement, &count, &deckName, &decklistName, &deckID); err != nil {
			continue
		}
		source := map[string]interface{}{
			"player_name":     "",
			"tournament_name": "",
			"tournament_date": "",
			"placement":       0,
			"copies":          0,
			"deck_name":       "",
			"decklist_name":   "",
			"deck_id":         "",
		}
		if playerName.Valid {
			source["player_name"] = playerName.String
		}
		if tournamentName.Valid {
			source["tournament_name"] = tournamentName.String
		}
		if tournamentDate.Valid {
			source["tournament_date"] = tournamentDate.String
		}
		if placement.Valid {
			source["placement"] = int(placement.Int64)
		}
		if count.Valid {
			source["copies"] = int(count.Int64)
		}
		if deckName.Valid {
			source["deck_name"] = deckName.String
		}
		if decklistName.Valid {
			source["decklist_name"] = decklistName.String
		}
		if deckID.Valid {
			source["deck_id"] = deckID.String
		}
		sources = append(sources, source)
	}
	usage["top_sources"] = sources
	return usage
}

func localCardScoutReport(card *models.Card, metaUsage interface{}) string {
	var builder strings.Builder
	builder.WriteString("1. Ringkasan Fungsi\n")
	builder.WriteString(cardFunctionSummary(card))
	builder.WriteString("\n\n2. Peran di Deck\n")
	builder.WriteString(cardRoleSummary(card))
	builder.WriteString("\n\n3. Kapan Dipakai\n")
	builder.WriteString(cardTimingSummary(card))
	builder.WriteString("\n\n4. Sinergi\n")
	builder.WriteString(cardSynergySummary(card))
	builder.WriteString("\n\n5. Risiko\n")
	builder.WriteString(cardRiskSummary(card))
	builder.WriteString("\n\n6. Sinyal Meta\n")
	builder.WriteString(cardMetaUsageSummary(metaUsage))
	builder.WriteString("\n\n7. Rekomendasi Copy\n")
	builder.WriteString(cardCopySummary(card, metaUsage))
	builder.WriteString("\n\n8. Detail Rules dan Matchup\n")
	builder.WriteString(cardRulesSummary(card))
	builder.WriteString("\n\n9. Sumber Decklist\n")
	builder.WriteString(cardMetaSourcesSummary(metaUsage))
	return builder.String()
}

func cardFunctionSummary(card *models.Card) string {
	attacks := asSlice(card.Attacks)
	abilities := asSlice(card.Abilities)
	if len(abilities) > 0 {
		if ability, ok := abilities[0].(map[string]interface{}); ok {
			name := stringValue(ability["name"], "Ability")
			desc := stringValue(ability["description"], "")
			if desc != "" {
				return fmt.Sprintf("%s punya ability %s: %s", card.NameID, name, desc)
			}
		}
	}
	if len(attacks) > 0 {
		if attack, ok := attacks[0].(map[string]interface{}); ok {
			name := stringValue(attack["name"], "Attack")
			damage := stringValue(attack["damage"], "-")
			desc := stringValue(attack["description"], "")
			if desc != "" {
				return fmt.Sprintf("%s punya attack %s dengan damage %s. Efeknya: %s", card.NameID, name, damage, desc)
			}
			return fmt.Sprintf("%s punya attack %s dengan damage %s.", card.NameID, name, damage)
		}
	}
	return fmt.Sprintf("%s belum punya rules text lengkap di database, jadi evaluasi memakai kategori, tipe, rarity, dan data decklist.", card.NameID)
}

func cardRoleSummary(card *models.Card) string {
	if card.Category == "Energy" {
		return "Resource energy. Nilainya bergantung pada kebutuhan attack timing dan stabilitas attachment deck."
	}
	if card.Category == "Trainer" {
		name := strings.ToLower(card.NameID + " " + card.NameEN)
		switch {
		case strings.Contains(name, "ball"), strings.Contains(name, "search"):
			return "Search/consistency card. Biasanya dipakai untuk mengurangi brick dan mempercepat setup."
		case strings.Contains(name, "research"), strings.Contains(name, "iono"), strings.Contains(name, "draw"):
			return "Draw engine. Fungsi utamanya menjaga refill hand dan sequencing."
		case strings.Contains(name, "switch"), strings.Contains(name, "cart"):
			return "Mobility card. Dipakai untuk mengatur Active dan menjaga tempo."
		default:
			return "Utility Trainer. Perannya perlu dibaca dari efek dan matchup yang ditargetkan."
		}
	}
	if card.HP != nil && *card.HP >= 200 {
		return "Pokemon high-HP yang bisa menjadi pusat pressure atau prize trade."
	}
	if card.EvolutionStage != nil && *card.EvolutionStage != "" && *card.EvolutionStage != "Basic" {
		return "Bagian evolution line. Prioritasnya tergantung seberapa cepat deck harus mencapai stage ini."
	}
	return "Setup atau tech Pokemon. Copy idealnya ditentukan oleh apakah kartu ini ingin dibuka awal atau dicari saat matchup tertentu."
}

func cardTimingSummary(card *models.Card) string {
	attacks := asSlice(card.Attacks)
	if len(attacks) > 0 {
		if attack, ok := attacks[0].(map[string]interface{}); ok {
			desc := strings.ToLower(stringValue(attack["description"], ""))
			if strings.Contains(desc, "tidak dapat memainkan item") {
				return "Paling kuat dipakai early game untuk memperlambat setup lawan yang bergantung pada Item."
			}
			if strings.Contains(desc, "tukar") || strings.Contains(desc, "cadangan") {
				return "Dipakai saat ingin menyerang sambil keluar dari Active, menjaga Pokemon penting tetap aman di bench."
			}
		}
	}
	return "Dipakai saat efeknya selaras dengan board state. Untuk kartu yang belum terbukti meta, validasi lewat testing matchup lebih penting daripada langsung menaikkan copy."
}

func cardSynergySummary(card *models.Card) string {
	if card.CardType != nil && *card.CardType != "" {
		return fmt.Sprintf("Cocok dicoba pada deck yang sudah memakai engine %s atau membutuhkan Pokemon kecil dengan fungsi utility.", *card.CardType)
	}
	if card.Category == "Trainer" {
		return "Cocok di deck yang membutuhkan efek utility serupa, terutama jika slot Trainer masih fleksibel."
	}
	return "Cari sinergi dari role kartu: apakah membantu setup, disruption, mobility, atau damage plan deck."
}

func cardRiskSummary(card *models.Card) string {
	if card.HP != nil && *card.HP <= 70 && card.Category == "Pokemon" {
		return "HP rendah membuat kartu mudah menjadi target prize. Jangan naikkan copy tanpa alasan matchup atau konsistensi yang jelas."
	}
	if card.Category == "Trainer" {
		return "Risiko utamanya adalah slot pressure: terlalu banyak tech Trainer bisa mengurangi konsistensi engine utama."
	}
	return "Risiko utama adalah opportunity cost slot deck. Bandingkan dengan kartu staple sebelum menetapkan copy."
}

func cardMetaUsageSummary(metaUsage interface{}) string {
	usage, ok := metaUsage.(map[string]interface{})
	if !ok {
		return "Belum ada data pemakaian decklist yang bisa dibaca."
	}
	appearances := intValue(usage["decklist_appearances"])
	totalCopies := intValue(usage["total_copies"])
	if appearances == 0 {
		return "Belum muncul cukup kuat di decklist turnamen lokal/Limitless yang tersimpan. Statusnya watchlist, bukan staple."
	}
	return fmt.Sprintf("Terdeteksi di %d decklist dengan total %d copy. Ini memberi sinyal pemakaian nyata, tetapi tetap perlu dilihat konteks deck dan placement.", appearances, totalCopies)
}

func cardCopySummary(card *models.Card, metaUsage interface{}) string {
	usage, _ := metaUsage.(map[string]interface{})
	appearances := intValue(usage["decklist_appearances"])
	totalCopies := intValue(usage["total_copies"])
	if appearances > 0 {
		avg := float64(totalCopies) / float64(appearances)
		switch {
		case avg >= 3:
			return fmt.Sprintf("Mulai dari 3-4 copy jika kartu ini bagian core plan. Rata-rata data tersimpan %.1f copy saat muncul.", avg)
		case avg >= 2:
			return fmt.Sprintf("Mulai dari 2 copy untuk menjaga akses tanpa memenuhi slot deck. Rata-rata data tersimpan %.1f copy.", avg)
		default:
			return fmt.Sprintf("Mulai dari 1 copy sebagai tech. Rata-rata data tersimpan %.1f copy.", avg)
		}
	}
	if card.Category == "Pokemon" && card.HP != nil && *card.HP <= 70 {
		return "Mulai dari 1-2 copy sampai terbukti perlu lebih banyak. Untuk Pokemon kecil, copy tinggi harus dibenarkan oleh start rate atau efek disruption."
	}
	return "Mulai dari 1 copy untuk testing, lalu naikkan hanya jika sering dibutuhkan dalam game plan atau matchup tertentu."
}

func cardRulesSummary(card *models.Card) string {
	lines := make([]string, 0)

	for _, item := range asSlice(card.Abilities) {
		ability, ok := item.(map[string]interface{})
		if !ok {
			continue
		}
		name := stringValue(ability["name"], "Ability")
		desc := stringValue(ability["description"], "")
		if desc != "" {
			lines = append(lines, fmt.Sprintf("- Ability %s: %s", name, desc))
		}
	}

	for _, item := range asSlice(card.Attacks) {
		attack, ok := item.(map[string]interface{})
		if !ok {
			continue
		}
		name := stringValue(attack["name"], "Attack")
		damage := stringValue(attack["damage"], "-")
		desc := stringValue(attack["description"], "")
		cost := strings.Join(stringSliceValue(attack["energy_cost"]), ", ")
		if cost == "" {
			cost = "tanpa cost tercatat"
		}
		if desc != "" {
			lines = append(lines, fmt.Sprintf("- Attack %s (%s, damage %s): %s", name, cost, damage, desc))
		} else {
			lines = append(lines, fmt.Sprintf("- Attack %s (%s, damage %s).", name, cost, damage))
		}
	}

	weakness := modifierSummary(card.Weakness)
	if weakness != "" {
		lines = append(lines, "- Weakness: "+weakness)
	}
	resistance := modifierSummary(card.Resistance)
	if resistance != "" {
		lines = append(lines, "- Resistance: "+resistance)
	}
	if len(lines) == 0 {
		return "Rules text belum lengkap di database. Gunakan metadata kartu dan data decklist sebagai baseline sampai data resmi tersedia."
	}
	return strings.Join(lines, "\n")
}

func cardMetaSourcesSummary(metaUsage interface{}) string {
	usage, ok := metaUsage.(map[string]interface{})
	if !ok {
		return "Belum ada sumber decklist yang bisa dibaca."
	}
	sources := asSlice(usage["top_sources"])
	if len(sources) == 0 {
		return "Belum ada decklist turnamen tersimpan yang memakai kartu ini."
	}

	lines := make([]string, 0, len(sources))
	for _, sourceValue := range sources {
		source, ok := sourceValue.(map[string]interface{})
		if !ok {
			continue
		}
		player := stringValue(source["player_name"], "Player tidak tercatat")
		tournament := stringValue(source["tournament_name"], "Turnamen tidak tercatat")
		date := stringValue(source["tournament_date"], "")
		deckName := stringValue(source["deck_name"], "Deck tidak tercatat")
		decklistName := stringValue(source["decklist_name"], "")
		copies := intValue(source["copies"])
		placement := intValue(source["placement"])
		rank := "rank tidak tercatat"
		if placement > 0 {
			rank = fmt.Sprintf("rank #%d", placement)
		}
		if date != "" {
			tournament = fmt.Sprintf("%s (%s)", tournament, date)
		}
		if decklistName != "" {
			deckName = fmt.Sprintf("%s / %s", deckName, decklistName)
		}
		lines = append(lines, fmt.Sprintf("- %s memakai %dx di %s, %s, deck %s.", player, copies, tournament, rank, deckName))
	}
	if len(lines) == 0 {
		return "Belum ada sumber decklist yang bisa dibaca."
	}
	return strings.Join(lines, "\n")
}

func modifierSummary(value interface{}) string {
	parts := make([]string, 0)
	for _, item := range asSlice(value) {
		modifier, ok := item.(map[string]interface{})
		if !ok {
			continue
		}
		cardType := stringValue(modifier["type"], stringValue(modifier["card_type"], ""))
		amount := stringValue(modifier["modifier"], stringValue(modifier["value"], stringValue(modifier["amount"], "")))
		if cardType == "" && amount == "" {
			continue
		}
		if amount == "" {
			parts = append(parts, cardType)
		} else if cardType == "" {
			parts = append(parts, amount)
		} else {
			parts = append(parts, fmt.Sprintf("%s %s", cardType, amount))
		}
	}
	return strings.Join(parts, ", ")
}

func asSlice(value interface{}) []interface{} {
	switch typed := value.(type) {
	case []interface{}:
		return typed
	case []map[string]interface{}:
		result := make([]interface{}, 0, len(typed))
		for _, item := range typed {
			result = append(result, item)
		}
		return result
	case map[string]interface{}:
		if len(typed) == 0 {
			return nil
		}
		return []interface{}{typed}
	default:
		return nil
	}
}

func stringValue(value interface{}, fallback string) string {
	if text, ok := value.(string); ok && strings.TrimSpace(text) != "" {
		return text
	}
	return fallback
}

func stringSliceValue(value interface{}) []string {
	switch typed := value.(type) {
	case []string:
		return typed
	case []interface{}:
		result := make([]string, 0, len(typed))
		for _, item := range typed {
			if text, ok := item.(string); ok && strings.TrimSpace(text) != "" {
				result = append(result, text)
			}
		}
		return result
	default:
		return nil
	}
}

func intValue(value interface{}) int {
	switch typed := value.(type) {
	case int:
		return typed
	case int64:
		return int(typed)
	case float64:
		return int(typed)
	default:
		return 0
	}
}

// AskAI asks AI about Pokemon TCG
func (s *CardService) AskAI(ctx context.Context, question, context string) (string, error) {
	return s.aiService.AskWithContext(ctx, context, question)
}

// GetTypeChart returns the type advantage chart
func (s *CardService) GetTypeChart() map[string]map[string]float64 {
	// Pokemon type chart (simplified)
	// attacker -> defender -> multiplier
	return map[string]map[string]float64{
		"Fire":      {"Grass": 2.0, "Water": 0.5, "Fire": 0.5},
		"Water":     {"Fire": 2.0, "Grass": 0.5, "Water": 0.5},
		"Grass":     {"Water": 2.0, "Fire": 0.5, "Grass": 0.5},
		"Electric":  {"Water": 2.0, "Grass": 0.5, "Electric": 0.5, "Ground": 0.0},
		"Psychic":   {"Fighting": 2.0, "Psychic": 0.5},
		"Fighting":  {"Normal": 2.0, "Psychic": 0.5, "Flying": 0.5},
		"Ground":    {"Electric": 2.0, "Fire": 2.0, "Grass": 0.5, "Flying": 0.0},
		"Flying":    {"Grass": 2.0, "Electric": 0.5, "Fighting": 2.0},
		"Poison":    {"Grass": 2.0, "Ground": 0.5},
		"Rock":      {"Fire": 2.0, "Flying": 2.0, "Grass": 0.5, "Fighting": 0.5},
		"Bug":       {"Grass": 2.0, "Fire": 0.5, "Flying": 0.5},
		"Ghost":     {"Psychic": 2.0, "Normal": 0.0, "Fighting": 0.0},
		"Steel":     {"Rock": 2.0, "Fire": 0.5, "Water": 0.5, "Electric": 0.5},
		"Ice":       {"Grass": 2.0, "Water": 0.5, "Fire": 0.5},
		"Dragon":    {"Dragon": 2.0},
		"Dark":      {"Psychic": 2.0, "Fighting": 0.5},
		"Fairy":     {"Dark": 2.0, "Dragon": 2.0, "Steel": 0.5, "Poison": 0.5},
		"Normal":    {"Rock": 0.5, "Ghost": 0.0},
		"Colorless": {},
		"Darkness":  {"Psychic": 2.0, "Fighting": 0.5},
		"Metal":     {"Fairy": 2.0, "Fire": 0.5},
	}
}

// CalculateTypeAdvantage calculates type advantage
func (s *CardService) CalculateTypeAdvantage(attacker, defender string) (float64, string) {
	chart := s.GetTypeChart()

	attackerType := strings.Title(strings.ToLower(attacker))
	defenderType := strings.Title(strings.ToLower(defender))

	if defenderMultipliers, ok := chart[attackerType]; ok {
		if multiplier, ok := defenderMultipliers[defenderType]; ok {
			effectiveness := "normal"
			if multiplier > 1 {
				effectiveness = "super effective"
			} else if multiplier < 1 && multiplier > 0 {
				effectiveness = "not very effective"
			} else if multiplier == 0 {
				effectiveness = "no effect"
			}
			return multiplier, effectiveness
		}
	}

	return 1.0, "normal"
}
