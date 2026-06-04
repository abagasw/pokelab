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

// DeckService handles deck-related business logic
type DeckService struct {
	db        *sql.DB
	aiService *AIService
}

// NewDeckService creates a new DeckService
func NewDeckService(db *sql.DB, aiService *AIService) *DeckService {
	return &DeckService{db: db, aiService: aiService}
}

// GetDecks gets deck archetypes
func (s *DeckService) GetDecks(ctx context.Context, format string, queryText string, userID string, page, limit int) ([]models.Deck, int, error) {
	whereClause := "WHERE (user_id IS NULL"
	args := []interface{}{}

	if userID != "" {
		whereClause += " OR user_id = ?"
		args = append(args, userID)
	}
	whereClause += ")"

	if format != "" {
		whereClause += " AND format = ?"
		args = append(args, format)
	}
	if queryText != "" {
		whereClause += " AND (lower(name) LIKE ? OR lower(COALESCE(archetype, '')) LIKE ? OR lower(COALESCE(description, '')) LIKE ?)"
		searchTerm := "%" + strings.ToLower(queryText) + "%"
		args = append(args, searchTerm, searchTerm, searchTerm)
	}

	// Get total count
	var total int
	err := s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM decks "+whereClause, args...).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	// Get decks with pagination
	offset := (page - 1) * limit
	query := fmt.Sprintf(`
		SELECT id, user_id, external_id, name, description, format, archetype,
		       tournament_count, win_count, top8_count, created_at, updated_at
		FROM decks %s
		ORDER BY (user_id IS NOT NULL) DESC, tournament_count DESC, win_count DESC
		LIMIT ? OFFSET ?
	`, whereClause)

	rows, err := s.db.QueryContext(ctx, query, append(args, limit, offset)...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	decks := make([]models.Deck, 0)
	for rows.Next() {
		var d models.Deck
		var userID, externalID, description, format, archetype sql.NullString
		var tournamentCount, winCount, top8Count sql.NullInt64

		err := rows.Scan(
			&d.ID, &userID, &externalID, &d.Name, &description, &format, &archetype,
			&tournamentCount, &winCount, &top8Count, &d.CreatedAt, &d.UpdatedAt,
		)
		if err != nil {
			continue
		}

		if userID.Valid {
			d.UserID = userID.String
		}
		if externalID.Valid {
			d.ExternalID = externalID.String
		}
		if description.Valid {
			d.Description = description.String
		}
		if format.Valid {
			d.Format = format.String
		}
		if archetype.Valid {
			d.Archetype = archetype.String
		}
		if tournamentCount.Valid {
			d.TournamentCount = int(tournamentCount.Int64)
		}
		if winCount.Valid {
			d.WinCount = int(winCount.Int64)
		}
		if top8Count.Valid {
			d.Top8Count = int(top8Count.Int64)
		}

		decks = append(decks, d)
	}

	return decks, total, nil
}

// CreateDeck saves a custom deck
func (s *DeckService) CreateDeck(ctx context.Context, userID string, deck *models.Deck) (*models.Deck, error) {
	if deck.ID == "" {
		deck.ID = "custom-" + strings.ToLower(strings.ReplaceAll(deck.Name, " ", "-")) + "-" + fmt.Sprintf("%d", time.Now().Unix())
	}
	deck.UserID = userID
	deck.CreatedAt = time.Now()
	deck.UpdatedAt = time.Now()

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	_, err = tx.ExecContext(ctx, `
		INSERT INTO decks (id, user_id, name, archetype, format, description, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`, deck.ID, deck.UserID, deck.Name, deck.Archetype, deck.Format, deck.Description, deck.CreatedAt, deck.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("failed to insert deck: %w", err)
	}

	// Insert cards
	for _, card := range deck.Decklists[0].Cards { // Assuming cards are in first decklist or similar structure
		_, err = tx.ExecContext(ctx, `
			INSERT INTO deck_cards (deck_id, card_id, count, is_pokemon)
			VALUES (?, ?, ?, ?)
		`, deck.ID, card.CardID, card.Count, card.IsPokemon)
		if err != nil {
			return nil, fmt.Errorf("failed to insert deck card: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}

	return deck, nil
}

// GetDeckByID gets a deck by ID
func (s *DeckService) GetDeckByID(ctx context.Context, id string) (*models.Deck, error) {
	var d models.Deck
	var externalID, description, format, archetype sql.NullString
	var tournamentCount, winCount, top8Count sql.NullInt64

	err := s.db.QueryRowContext(ctx, `
		SELECT id, external_id, name, description, format, archetype,
		       tournament_count, win_count, top8_count, created_at, updated_at
		FROM decks WHERE id = ?
	`, id).Scan(
		&d.ID, &externalID, &d.Name, &description, &format, &archetype,
		&tournamentCount, &winCount, &top8Count, &d.CreatedAt, &d.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("deck not found")
	}
	if err != nil {
		return nil, err
	}

	if externalID.Valid {
		d.ExternalID = externalID.String
	}
	if description.Valid {
		d.Description = description.String
	}
	if format.Valid {
		d.Format = format.String
	}
	if archetype.Valid {
		d.Archetype = archetype.String
	}
	if tournamentCount.Valid {
		d.TournamentCount = int(tournamentCount.Int64)
	}
	if winCount.Valid {
		d.WinCount = int(winCount.Int64)
	}
	if top8Count.Valid {
		d.Top8Count = int(top8Count.Int64)
	}

	return &d, nil
}

// GetDeckDecklists gets decklists for a deck
func (s *DeckService) GetDeckDecklists(ctx context.Context, deckID string) ([]models.Decklist, error) {
	decklists, err := s.queryDecklists(ctx, `
		SELECT dl.id, dl.deck_id, dl.name, dl.player_name, dl.tournament_id, dl.placement,
		       dl.win_count, dl.loss_count, dl.tie_count, dl.points, dl.created_at,
		       COALESCE(t.name, ''), COALESCE(t.date, '')
		FROM decklists dl
		LEFT JOIN tournaments t ON t.id = dl.tournament_id
		WHERE dl.deck_id = ?
		ORDER BY dl.created_at DESC
	`, deckID)
	if err != nil {
		return nil, err
	}
	if len(decklists) > 0 {
		return decklists, nil
	}

	deck, err := s.GetDeckByID(ctx, deckID)
	if err != nil {
		return []models.Decklist{}, nil
	}

	searchTerm := deck.Archetype
	if searchTerm == "" {
		searchTerm = deck.Name
	}
	searchTerm = decklistSearchTerm(searchTerm)
	if searchTerm == "" {
		return []models.Decklist{}, nil
	}

	return s.queryDecklists(ctx, `
		SELECT dl.id, dl.deck_id, dl.name, dl.player_name, dl.tournament_id, dl.placement,
		       dl.win_count, dl.loss_count, dl.tie_count, dl.points, dl.created_at,
		       COALESCE(t.name, ''), COALESCE(t.date, '')
		FROM decklists dl
		JOIN decks d ON d.id = dl.deck_id
		LEFT JOIN tournaments t ON t.id = dl.tournament_id
		WHERE lower(d.name) LIKE ? OR lower(COALESCE(d.archetype, '')) LIKE ?
		ORDER BY
			CASE WHEN d.id LIKE '2026-%' THEN 0 ELSE 1 END,
			CASE WHEN dl.placement > 0 THEN 0 ELSE 1 END,
			dl.placement ASC,
			dl.created_at DESC
		LIMIT 8
	`, "%"+searchTerm+"%", "%"+searchTerm+"%")
}

func (s *DeckService) queryDecklists(ctx context.Context, query string, args ...interface{}) ([]models.Decklist, error) {
	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}

	decklists := make([]models.Decklist, 0)
	for rows.Next() {
		var dl models.Decklist
		var name, playerName, tournamentID, tournamentName, tournamentDate sql.NullString
		var placement, winCount, lossCount, tieCount, points sql.NullInt64

		err := rows.Scan(
			&dl.ID, &dl.DeckID, &name, &playerName, &tournamentID, &placement,
			&winCount, &lossCount, &tieCount, &points, &dl.CreatedAt, &tournamentName, &tournamentDate,
		)
		if err != nil {
			continue
		}

		if name.Valid {
			dl.Name = name.String
		}
		if playerName.Valid {
			dl.PlayerName = playerName.String
		}
		if tournamentID.Valid {
			dl.TournamentID = tournamentID.String
		}
		if tournamentName.Valid {
			dl.TournamentName = tournamentName.String
		}
		if tournamentDate.Valid {
			dl.TournamentDate = tournamentDate.String
		}
		if placement.Valid {
			dl.Placement = int(placement.Int64)
		}
		if winCount.Valid {
			dl.WinCount = int(winCount.Int64)
		}
		if lossCount.Valid {
			dl.LossCount = int(lossCount.Int64)
		}
		if tieCount.Valid {
			dl.TieCount = int(tieCount.Int64)
		}
		if points.Valid {
			dl.Points = int(points.Int64)
		}

		decklists = append(decklists, dl)
	}
	rows.Close()

	for i := range decklists {
		cards, err := s.getDecklistCards(ctx, decklists[i].ID)
		if err == nil {
			decklists[i].Cards = cards
		}
	}

	return decklists, nil
}

func decklistSearchTerm(value string) string {
	value = strings.ToLower(value)
	replacements := []string{" pokemon", " pokémon", " ex", " vstar", " vmax", " gx"}
	for _, replacement := range replacements {
		value = strings.ReplaceAll(value, replacement, "")
	}
	parts := strings.FieldsFunc(value, func(r rune) bool {
		return r == '(' || r == ')' || r == '-' || r == '/' || r == ':' || r == ','
	})
	if len(parts) == 0 {
		return strings.TrimSpace(value)
	}
	return strings.TrimSpace(parts[0])
}

// getDecklistCards gets cards for a decklist
func (s *DeckService) getDecklistCards(ctx context.Context, decklistID string) ([]models.DeckCard, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT dc.id, dc.deck_id, dc.card_id, dc.count, dc.is_pokemon,
		       COALESCE(c.name_id, dc.card_id), COALESCE(c.category, ''),
		       COALESCE(c.card_type, ''), COALESCE(c.image_url, ''),
		       (SELECT MIN(price_idr) FROM card_prices cp WHERE cp.card_id = dc.card_id AND cp.price_idr IS NOT NULL AND cp.price_idr > 0)
		FROM deck_cards dc
		LEFT JOIN cards c ON dc.card_id = c.id
		WHERE dc.deck_id = ?
		ORDER BY dc.is_pokemon DESC, c.category, c.name_id
	`, decklistID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	cards := make([]models.DeckCard, 0)
	for rows.Next() {
		var dc models.DeckCard
		var category, cardType, imageURL sql.NullString
		var isPokemon sql.NullBool
		var priceIDR sql.NullFloat64

		err := rows.Scan(
			&dc.ID, &dc.DeckID, &dc.CardID, &dc.Count, &isPokemon,
			&dc.CardName, &category, &cardType, &imageURL, &priceIDR,
		)
		if err != nil {
			continue
		}

		if isPokemon.Valid {
			dc.IsPokemon = isPokemon.Bool
		}
		if category.Valid {
			dc.Category = category.String
		}
		if cardType.Valid {
			dc.CardType = cardType.String
		}
		if imageURL.Valid {
			dc.ImageURL = imageURL.String
		}
		if priceIDR.Valid {
			dc.PriceIDR = &priceIDR.Float64
		}

		cards = append(cards, dc)
	}

	return cards, nil
}

// BuildDeck builds a deck using AI
func (s *DeckService) BuildDeck(ctx context.Context, req models.DeckBuildRequest) (*models.DeckBuildResponse, error) {
	availableCards := "[]"
	if req.UseInventory {
		var err error
		availableCards, err = s.getAvailableCardsForDeckBuild(ctx, req)
		if err != nil {
			// Fallback to template deck if query fails
			return s.buildFallbackDeck(ctx, req)
		}
	}

	prefJSON, _ := json.Marshal(req)
	aiResponse, err := s.buildDeckWithAITimeout(ctx, prefJSON, availableCards, 8*time.Second)

	if err != nil {
		// Fallback if AI fails
		return s.buildFallbackDeck(ctx, req)
	}

	// Parse AI response
	response := s.parseDeckBuildResponse(aiResponse, req)
	if response == nil {
		return s.buildFallbackDeck(ctx, req)
	}

	return response, nil
}

func (s *DeckService) buildDeckWithAITimeout(ctx context.Context, prefJSON []byte, availableCards string, timeout time.Duration) (string, error) {
	type aiResult struct {
		response string
		err      error
	}

	aiCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	resultCh := make(chan aiResult, 1)
	go func() {
		response, err := s.aiService.BuildDeck(aiCtx, map[string]interface{}{
			"preferences": string(prefJSON),
		}, availableCards)
		resultCh <- aiResult{response: response, err: err}
	}()

	select {
	case result := <-resultCh:
		return result.response, result.err
	case <-time.After(timeout):
		return "", fmt.Errorf("ai deck builder timed out after %s", timeout)
	case <-ctx.Done():
		return "", ctx.Err()
	}
}

// getAvailableCardsForDeckBuild queries cards from database for deck building
func (s *DeckService) getAvailableCardsForDeckBuild(ctx context.Context, req models.DeckBuildRequest) (string, error) {
	var query string
	args := []interface{}{}

	if req.UseInventory && req.CollectionID != "" {
		// Filter by cards in user collection
		query = `
			SELECT c.id, c.name_id, c.name_en, c.category, c.card_type, c.hp, c.expansion_code, c.regulation_mark, c.rarity, ci.quantity
			FROM cards c
			JOIN collection_items ci ON c.id = ci.card_id
			WHERE ci.collection_id = ? AND c.category IN ('Pokemon', 'Trainer', 'Energy')
		`
		args = append(args, req.CollectionID)
	} else {
		// General build from all cards
		query = `
			SELECT id, name_id, name_en, category, card_type, hp, expansion_code, regulation_mark, rarity, 4 as quantity
			FROM cards
			WHERE category IN ('Pokemon', 'Trainer', 'Energy')
		`
	}

	// Filter by regulation marks if specified
	if len(req.RegulationMarks) > 0 {
		placeholders := make([]string, len(req.RegulationMarks))
		for i, mark := range req.RegulationMarks {
			placeholders[i] = "?"
			args = append(args, mark)
		}
		query += " AND regulation_mark IN (" + joinStrings(placeholders, ",") + ")"
	}

	if req.UseInventory {
		query += " ORDER BY ci.quantity DESC, c.category, c.name_id LIMIT 1000"
	} else {
		query += " ORDER BY category, name_id LIMIT 500"
	}

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return "", err
	}
	defer rows.Close()

	type cardInfo struct {
		ID             string  `json:"id"`
		Name           string  `json:"name"`
		NameEN         *string `json:"name_en,omitempty"`
		Category       string  `json:"category"`
		Type           *string `json:"type,omitempty"`
		HP             *int    `json:"hp,omitempty"`
		ExpansionCode  *string `json:"expansion_code,omitempty"`
		RegulationMark *string `json:"regulation_mark,omitempty"`
		Rarity         *string `json:"rarity,omitempty"`
		AvailableCount int     `json:"available_count"`
	}

	var cards []cardInfo
	for rows.Next() {
		var c cardInfo
		var nameEN, cardType, expCode, regMark, rarity sql.NullString
		var hp sql.NullInt64

		err := rows.Scan(&c.ID, &c.Name, &nameEN, &c.Category, &cardType, &hp, &expCode, &regMark, &rarity, &c.AvailableCount)
		if err != nil {
			continue
		}

		if nameEN.Valid {
			c.NameEN = &nameEN.String
		}
		if cardType.Valid {
			c.Type = &cardType.String
		}
		if hp.Valid {
			hpInt := int(hp.Int64)
			c.HP = &hpInt
		}
		if expCode.Valid {
			c.ExpansionCode = &expCode.String
		}
		if regMark.Valid {
			c.RegulationMark = &regMark.String
		}
		if rarity.Valid {
			c.Rarity = &rarity.String
		}

		cards = append(cards, c)
	}

	cardsJSON, err := json.Marshal(cards)
	if err != nil {
		return "", err
	}

	return string(cardsJSON), nil
}

// parseDeckBuildResponse attempts to parse AI response into deck structure
func (s *DeckService) parseDeckBuildResponse(aiResponse string, req models.DeckBuildRequest) *models.DeckBuildResponse {
	response := &models.DeckBuildResponse{
		Name: req.Name,
	}

	// Try to find JSON in the response
	jsonStart := strings.Index(aiResponse, "{")
	jsonEnd := strings.LastIndex(aiResponse, "}")

	if jsonStart >= 0 && jsonEnd > jsonStart {
		jsonStr := aiResponse[jsonStart : jsonEnd+1]
		var parsed struct {
			Name        string `json:"name"`
			Archetype   string `json:"archetype"`
			Description string `json:"description"`
			Cards       struct {
				Pokemon []struct {
					CardID   string `json:"card_id"`
					CardName string `json:"card_name"`
					Count    int    `json:"count"`
					PriceIDR *int64 `json:"price_idr,omitempty"`
				} `json:"pokemon"`
				Trainer []struct {
					CardID   string `json:"card_id"`
					CardName string `json:"card_name"`
					Count    int    `json:"count"`
					PriceIDR *int64 `json:"price_idr,omitempty"`
				} `json:"trainer"`
				Energy []struct {
					CardID   string `json:"card_id"`
					CardName string `json:"card_name"`
					Count    int    `json:"count"`
					PriceIDR *int64 `json:"price_idr,omitempty"`
				} `json:"energy"`
			} `json:"cards"`
			TotalCards int `json:"total_cards"`
			Pricing    struct {
				TotalIDR     float64 `json:"total_idr"`
				TotalUSD     float64 `json:"total_usd"`
				WithinBudget bool    `json:"within_budget"`
			} `json:"pricing"`
			Analysis struct {
				Strengths         []string `json:"strengths"`
				Weaknesses        []string `json:"weaknesses"`
				KeyCards          []string `json:"key_cards"`
				Playstyle         string   `json:"playstyle"`
				CompetitiveRating float64  `json:"competitive_rating"`
			} `json:"analysis"`
		}

		if err := json.Unmarshal([]byte(jsonStr), &parsed); err == nil {
			response.Name = parsed.Name
			if response.Name == "" {
				response.Name = req.Name
			}
			response.Archetype = parsed.Archetype
			response.Description = parsed.Description
			response.TotalCards = parsed.TotalCards
			response.Pricing.TotalIDR = parsed.Pricing.TotalIDR
			response.Pricing.TotalUSD = parsed.Pricing.TotalUSD
			response.Pricing.WithinBudget = parsed.Pricing.WithinBudget
			response.Analysis = parsed.Analysis

			// Convert cards
			for _, c := range parsed.Cards.Pokemon {
				response.Cards.Pokemon = append(response.Cards.Pokemon, models.DeckCard{
					CardID:   c.CardID,
					CardName: c.CardName,
					Count:    c.Count,
				})
			}
			for _, c := range parsed.Cards.Trainer {
				response.Cards.Trainer = append(response.Cards.Trainer, models.DeckCard{
					CardID:   c.CardID,
					CardName: c.CardName,
					Count:    c.Count,
				})
			}
			for _, c := range parsed.Cards.Energy {
				response.Cards.Energy = append(response.Cards.Energy, models.DeckCard{
					CardID:   c.CardID,
					CardName: c.CardName,
					Count:    c.Count,
				})
			}

			return response
		}
	}

	// Fallback: try regex extraction for simple card lists
	response = s.parseDeckFromText(aiResponse, req)

	return response
}

// parseDeckFromText extracts deck info from plain text using regex/line parsing
func (s *DeckService) parseDeckFromText(text string, req models.DeckBuildRequest) *models.DeckBuildResponse {
	response := &models.DeckBuildResponse{
		Name: req.Name,
	}

	lines := strings.Split(text, "\n")
	currentSection := ""

	for _, line := range lines {
		line = strings.TrimSpace(line)
		lower := strings.ToLower(line)

		// Detect sections
		if strings.Contains(lower, "pokemon") && !strings.Contains(lower, "energy") {
			currentSection = "pokemon"
			continue
		}
		if strings.Contains(lower, "trainer") || strings.Contains(lower, "item") || strings.Contains(lower, "supporter") {
			currentSection = "trainer"
			continue
		}
		if strings.Contains(lower, "energy") {
			currentSection = "energy"
			continue
		}

		// Parse card lines like "2x Pikachu" or "2 Pikachu" or "- 2 Pikachu"
		line = strings.TrimPrefix(line, "-")
		line = strings.TrimPrefix(line, "•")
		line = strings.TrimSpace(line)

		var count int
		var name string

		if n, err := fmt.Sscanf(line, "%dx %s", &count, &name); n >= 1 && err == nil {
			// Extract name after count
			parts := strings.SplitN(line, " ", 2)
			if len(parts) == 2 {
				name = strings.TrimSpace(parts[1])
			}
		} else if n, err := fmt.Sscanf(line, "%d %s", &count, &name); n >= 1 && err == nil {
			parts := strings.SplitN(line, " ", 2)
			if len(parts) == 2 {
				name = strings.TrimSpace(parts[1])
			}
		} else {
			continue
		}

		if count <= 0 || name == "" {
			continue
		}

		card := models.DeckCard{
			CardName: name,
			Count:    count,
		}

		switch currentSection {
		case "pokemon":
			response.Cards.Pokemon = append(response.Cards.Pokemon, card)
		case "trainer":
			response.Cards.Trainer = append(response.Cards.Trainer, card)
		case "energy":
			response.Cards.Energy = append(response.Cards.Energy, card)
		}

		response.TotalCards += count
	}

	if response.TotalCards == 0 {
		return nil
	}

	return response
}

// buildFallbackDeck creates a template deck when AI fails
func (s *DeckService) buildFallbackDeck(_ context.Context, req models.DeckBuildRequest) (*models.DeckBuildResponse, error) {
	response := &models.DeckBuildResponse{
		Name:        req.Name,
		Description: "Template cepat saat AI belum tersedia. Gunakan sebagai starting point, lalu validasi dengan scout report dan deck analysis.",
		Archetype:   "AI Fallback Tempo",
	}

	pokemon := []models.DeckCard{
		{CardName: "Main Attacker ex", Count: 3},
		{CardName: "Basic Main Attacker", Count: 4},
		{CardName: "Backup Attacker", Count: 2},
		{CardName: "Draw Engine Pokemon", Count: 3},
		{CardName: "Setup Pokemon", Count: 3},
		{CardName: "Utility Pokemon", Count: 3},
	}
	trainer := []models.DeckCard{
		{CardName: "Professor's Research", Count: 4},
		{CardName: "Iono", Count: 4},
		{CardName: "Boss's Orders", Count: 3},
		{CardName: "Ultra Ball", Count: 4},
		{CardName: "Nest Ball", Count: 4},
		{CardName: "Rare Candy", Count: 4},
		{CardName: "Switch", Count: 2},
		{CardName: "Super Rod", Count: 2},
		{CardName: "Counter Catcher", Count: 2},
		{CardName: "Stadium Slot", Count: 3},
	}
	energy := []models.DeckCard{
		{CardName: "Basic Energy", Count: 10},
	}

	response.Cards.Pokemon = pokemon
	response.Cards.Trainer = trainer
	response.Cards.Energy = energy
	for _, card := range pokemon {
		response.TotalCards += card.Count
	}
	for _, card := range trainer {
		response.TotalCards += card.Count
	}
	for _, card := range energy {
		response.TotalCards += card.Count
	}

	response.Analysis.Playstyle = "Tempo setup"
	response.Analysis.CompetitiveRating = 5.0
	response.Analysis.Strengths = []string{
		"Respons cepat walau OpenRouter tidak tersedia.",
		"Rasio Pokemon, Trainer, dan Energy dibuat sebagai skeleton 60 kartu yang mudah diedit.",
	}
	response.Analysis.Weaknesses = []string{
		"Nama kartu masih placeholder saat AI atau inventory tidak tersedia.",
		"Perlu diganti dengan kartu legal dan diuji dari deck analysis sebelum dipakai turnamen.",
	}
	response.Analysis.KeyCards = []string{"Main Attacker ex", "Draw Engine Pokemon", "Professor's Research", "Iono"}
	response.Pricing.WithinBudget = true

	return response, nil
}

// joinStrings joins string slice with separator
func joinStrings(strs []string, sep string) string {
	return strings.Join(strs, sep)
}

// AnalyzeDeck analyzes a deck
func (s *DeckService) AnalyzeDeck(ctx context.Context, name string, cards []struct {
	CardID string `json:"card_id"`
	Count  int    `json:"count"`
}) (map[string]interface{}, error) {
	// Calculate deck stats
	totalCards := 0
	pokemonCount := 0
	trainerCount := 0
	energyCount := 0

	for _, c := range cards {
		totalCards += c.Count

		// Get card category
		var category string
		s.db.QueryRowContext(ctx, `SELECT category FROM cards WHERE id = ?`, c.CardID).Scan(&category)

		switch category {
		case "Pokemon":
			pokemonCount += c.Count
		case "Trainer":
			trainerCount += c.Count
		case "Energy":
			energyCount += c.Count
		}
	}

	// Generate analysis
	analysis := map[string]interface{}{
		"deck_name":       name,
		"total_cards":     totalCards,
		"pokemon_count":   pokemonCount,
		"trainer_count":   trainerCount,
		"energy_count":    energyCount,
		"valid":           totalCards >= 60,
		"recommendations": []string{},
	}

	// Add recommendations
	recommendations := []string{}
	if totalCards < 60 {
		recommendations = append(recommendations, "Deck should have at least 60 cards")
	}
	if pokemonCount < 6 {
		recommendations = append(recommendations, "Consider adding more Pokemon")
	}
	if trainerCount < 15 {
		recommendations = append(recommendations, "Consider adding more Trainer cards")
	}
	if energyCount < 10 {
		recommendations = append(recommendations, "Consider adding more Energy cards")
	}

	analysis["recommendations"] = recommendations

	return analysis, nil
}

// SuggestDecks suggests decks
func (s *DeckService) SuggestDecks(ctx context.Context, req struct {
	Budget         float64  `json:"budget,omitempty"`
	PlayStyle      string   `json:"play_style,omitempty"`
	PreferredTypes []string `json:"preferred_types,omitempty"`
}) ([]models.DeckBuildResponse, error) {
	// Query popular decks from database
	decks := []models.DeckBuildResponse{}

	rows, err := s.db.QueryContext(ctx, `
		SELECT id, name, archetype, tournament_count, win_count
		FROM decks
		WHERE 1=1
		ORDER BY tournament_count DESC, win_count DESC
		LIMIT 5
	`)
	if err != nil {
		return decks, nil
	}
	defer rows.Close()

	for rows.Next() {
		var id, name string
		var archetype sql.NullString
		var tournamentCount, winCount sql.NullInt64

		err := rows.Scan(&id, &name, &archetype, &tournamentCount, &winCount)
		if err != nil {
			continue
		}

		d := models.DeckBuildResponse{
			Name: name,
		}
		if archetype.Valid {
			d.Archetype = archetype.String
		}

		decks = append(decks, d)
	}

	return decks, nil
}

// GetTournaments gets tournaments
func (s *DeckService) GetTournaments(ctx context.Context, format string, limit int) ([]models.Tournament, error) {
	whereClause := "WHERE 1=1"
	args := []interface{}{}

	if format != "" {
		whereClause += " AND format = ?"
		args = append(args, format)
	}

	query := fmt.Sprintf(`
		SELECT id, external_id, name, date, format, location, player_count, created_at
		FROM tournaments %s
		ORDER BY date DESC
		LIMIT ?
	`, whereClause)

	rows, err := s.db.QueryContext(ctx, query, append(args, limit)...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	tournaments := make([]models.Tournament, 0)
	for rows.Next() {
		var t models.Tournament
		var externalID, date, format, location sql.NullString
		var playerCount sql.NullInt64

		err := rows.Scan(
			&t.ID, &externalID, &t.Name, &date, &format, &location, &playerCount, &t.CreatedAt,
		)
		if err != nil {
			continue
		}

		if externalID.Valid {
			t.ExternalID = externalID.String
		}
		if date.Valid {
			t.Date = date.String
		}
		if format.Valid {
			t.Format = format.String
		}
		if location.Valid {
			t.Location = location.String
		}
		if playerCount.Valid {
			t.PlayerCount = int(playerCount.Int64)
		}

		tournaments = append(tournaments, t)
	}

	return tournaments, nil
}

// GetTournamentByID gets a tournament by ID
func (s *DeckService) GetTournamentByID(ctx context.Context, id string) (*models.Tournament, error) {
	var t models.Tournament
	var externalID, date, format, location sql.NullString
	var playerCount sql.NullInt64

	err := s.db.QueryRowContext(ctx, `
		SELECT id, external_id, name, date, format, location, player_count, created_at
		FROM tournaments WHERE id = ?
	`, id).Scan(
		&t.ID, &externalID, &t.Name, &date, &format, &location, &playerCount, &t.CreatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("tournament not found")
	}
	if err != nil {
		return nil, err
	}

	if externalID.Valid {
		t.ExternalID = externalID.String
	}
	if date.Valid {
		t.Date = date.String
	}
	if format.Valid {
		t.Format = format.String
	}
	if location.Valid {
		t.Location = location.String
	}
	if playerCount.Valid {
		t.PlayerCount = int(playerCount.Int64)
	}

	return &t, nil
}

// GetTournamentStandings gets tournament standings
func (s *DeckService) GetTournamentStandings(ctx context.Context, tournamentID string, top int) ([]models.TournamentStanding, error) {
	query := `
		SELECT ts.id, ts.tournament_id, ts.decklist_id, ts.player_name, ts.placement,
		       ts.points, ts.win_count, ts.loss_count, ts.tie_count,
		       d.name as deck_name, d.archetype as deck_category
		FROM tournament_standings ts
		LEFT JOIN decklists dl ON ts.decklist_id = dl.id
		LEFT JOIN decks d ON dl.deck_id = d.id
		WHERE ts.tournament_id = ?
		ORDER BY ts.placement ASC
	`
	if top > 0 {
		query += fmt.Sprintf(" LIMIT %d", top)
	}

	rows, err := s.db.QueryContext(ctx, query, tournamentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	standings := make([]models.TournamentStanding, 0)
	for rows.Next() {
		var ts models.TournamentStanding
		var decklistID, playerName, deckName, deckCategory sql.NullString
		var placement, points, winCount, lossCount, tieCount sql.NullInt64

		err := rows.Scan(
			&ts.ID, &ts.TournamentID, &decklistID, &playerName, &placement,
			&points, &winCount, &lossCount, &tieCount, &deckName, &deckCategory,
		)
		if err != nil {
			continue
		}

		if decklistID.Valid {
			ts.DecklistID = decklistID.String
		}
		if playerName.Valid {
			ts.PlayerName = playerName.String
		}
		if placement.Valid {
			ts.Placement = int(placement.Int64)
		}
		if points.Valid {
			ts.Points = int(points.Int64)
		}
		if winCount.Valid {
			ts.WinCount = int(winCount.Int64)
		}
		if lossCount.Valid {
			ts.LossCount = int(lossCount.Int64)
		}
		if tieCount.Valid {
			ts.TieCount = int(tieCount.Int64)
		}
		if deckName.Valid {
			ts.DeckName = deckName.String
		}

		standings = append(standings, ts)
	}

	return standings, nil
}

// GetMetaOverview gets meta overview
func (s *DeckService) GetMetaOverview(ctx context.Context) (*models.MetaAnalysis, error) {
	meta := &models.MetaAnalysis{}

	// Get total tournaments and players
	var totalTournaments, totalPlayers int
	s.db.QueryRowContext(ctx, `SELECT COUNT(*), COALESCE(SUM(player_count), 0) FROM tournaments`).Scan(&totalTournaments, &totalPlayers)
	meta.TotalTournaments = totalTournaments
	meta.TotalPlayers = totalPlayers

	// Get deck popularity
	rows, err := s.db.QueryContext(ctx, `
		SELECT d.id, d.name, d.tournament_count,
		       CASE WHEN d.tournament_count > 0 THEN CAST(d.win_count AS FLOAT) / d.tournament_count * 100 ELSE 0 END as win_rate,
		       CASE WHEN d.tournament_count > 0 THEN CAST(d.top8_count AS FLOAT) / d.tournament_count * 100 ELSE 0 END as top8_rate
		FROM decks d
		ORDER BY d.tournament_count DESC
		LIMIT 10
	`)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var p struct {
				DeckID      string
				DeckName    string
				Appearances int
				WinRate     float64
				Top8Rate    float64
			}
			rows.Scan(&p.DeckID, &p.DeckName, &p.Appearances, &p.WinRate, &p.Top8Rate)

			// Populate deck_popularity (legacy)
			meta.DeckPopularity = append(meta.DeckPopularity, struct {
				DeckID      string  `json:"deck_id"`
				DeckName    string  `json:"deck_name"`
				Appearances int     `json:"appearances"`
				WinRate     float64 `json:"win_rate"`
				Top8Rate    float64 `json:"top8_rate"`
				AvgPriceIDR float64 `json:"avg_price_idr"`
				ValueScore  float64 `json:"value_score"`
			}{
				DeckID:      p.DeckID,
				DeckName:    p.DeckName,
				Appearances: p.Appearances,
				WinRate:     p.WinRate,
				Top8Rate:    p.Top8Rate,
			})

			// Populate top_decks (frontend)
			meta.TopDecks = append(meta.TopDecks, struct {
				DeckID     string  `json:"deck_id"`
				Name       string  `json:"name"`
				WinRate    float64 `json:"win_rate"`
				Popularity float64 `json:"popularity"`
			}{
				DeckID:     p.DeckID,
				Name:       p.DeckName,
				WinRate:    p.WinRate,
				Popularity: float64(p.Appearances) / float64(totalTournaments+1) * 100,
			})
		}
	}

	// Mock some format health data
	meta.FormatHealth.DiversityScore = 7.5
	meta.FormatHealth.Tier1DeckCount = 5

	return meta, nil
}

// GetDeckPopularity gets deck popularity
func (s *DeckService) GetDeckPopularity(ctx context.Context, format string, limit int) ([]map[string]interface{}, error) {
	query := `
		SELECT d.id, d.name, d.archetype, d.tournament_count, d.win_count, d.top8_count,
		       COUNT(dl.id) as decklist_count
		FROM decks d
		LEFT JOIN decklists dl ON d.id = dl.deck_id
		WHERE 1=1
	`
	args := []interface{}{}

	if format != "" {
		query += " AND d.format = ?"
		args = append(args, format)
	}

	query += `
		GROUP BY d.id
		ORDER BY d.tournament_count DESC, d.win_count DESC
		LIMIT ?
	`
	args = append(args, limit)

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	results := make([]map[string]interface{}, 0)
	for rows.Next() {
		var id, name, category string
		var tournamentCount, winCount, top8Count, decklistCount int

		err := rows.Scan(
			&id, &name, &category, &tournamentCount, &winCount, &top8Count, &decklistCount,
		)
		if err != nil {
			continue
		}

		winRate := 0.0
		if tournamentCount > 0 {
			winRate = float64(winCount) / float64(tournamentCount) * 100
		}

		results = append(results, map[string]interface{}{
			"deck_id":          id,
			"name":             name,
			"category":         category,
			"tournament_count": tournamentCount,
			"win_count":        winCount,
			"top8_count":       top8Count,
			"decklist_count":   decklistCount,
			"win_rate":         winRate,
		})
	}

	return results, nil
}

// GetValueAnalysis gets value analysis
func (s *DeckService) GetValueAnalysis(ctx context.Context, budget *float64) ([]map[string]interface{}, error) {
	results := []map[string]interface{}{}

	// Query decks with their estimated prices
	query := `
		SELECT d.id, d.name, d.archetype, d.tournament_count, d.win_count,
		       (SELECT COUNT(*) FROM deck_cards WHERE deck_id = d.id) as card_count
		FROM decks d
		WHERE 1=1
	`
	args := []interface{}{}

	if budget != nil && *budget > 0 {
		// For budget filtering, we'd need price data
		// For now, return all decks
		_ = budget
	}

	query += ` ORDER BY d.win_count DESC, d.tournament_count DESC LIMIT 10`

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return results, nil
	}
	defer rows.Close()

	for rows.Next() {
		var id, name, category string
		var tournamentCount, winCount, cardCount int

		err := rows.Scan(&id, &name, &category, &tournamentCount, &winCount, &cardCount)
		if err != nil {
			continue
		}

		// Calculate value score (win rate vs complexity)
		winRate := 0.0
		if tournamentCount > 0 {
			winRate = float64(winCount) / float64(tournamentCount) * 100
		}

		valueScore := winRate
		if cardCount > 0 && cardCount < 20 {
			valueScore *= 1.2 // Bonus for simpler decks
		}

		results = append(results, map[string]interface{}{
			"deck_id":        id,
			"name":           name,
			"category":       category,
			"card_count":     cardCount,
			"win_rate":       winRate,
			"value_score":    valueScore,
			"recommendation": s.getValueRecommendation(winRate, cardCount),
		})
	}

	return results, nil
}

func (s *DeckService) getValueRecommendation(winRate float64, cardCount int) string {
	if winRate >= 60 && cardCount <= 20 {
		return "High Value - Strong performance, easy to build"
	}
	if winRate >= 50 {
		return "Good Value - Solid performance"
	}
	if cardCount <= 15 {
		return "Budget Option - Affordable entry point"
	}
	return "Average - Consider other options"
}

// AskMetaQuestion asks AI about meta
func (s *DeckService) AskMetaQuestion(ctx context.Context, question string) (string, error) {
	// Get meta data
	metaOverview, _ := s.GetMetaOverview(ctx)
	popularity, _ := s.GetDeckPopularity(ctx, "", 5)

	// Build meta data
	metaData := map[string]interface{}{
		"total_tournaments": metaOverview.TotalTournaments,
		"total_players":     metaOverview.TotalPlayers,
		"top_decks":         popularity,
	}

	metaJSON, _ := json.Marshal(metaData)

	return s.aiService.AnalyzeMeta(ctx, string(metaJSON))
}
