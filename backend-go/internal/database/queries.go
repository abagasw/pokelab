package database

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"pokemon-tcg-indonesia/internal/models"
	"strings"
)

// Card queries

// GetCards gets all cards with pagination
func (db *DB) GetCards(limit, offset int) ([]models.Card, error) {
	query := `SELECT id, external_id, name_id, name_en, category, expansion_code, 
			  collector_number, regulation_mark, rarity, illustrator, image_url,
			  hp, card_type, evolution_stage, evolves_from, retreat_cost,
			  attacks, abilities, weakness, resistance, pokedex, created_at, updated_at
		  FROM cards 
		  ORDER BY name_id 
		  LIMIT ? OFFSET ?`
	
	rows, err := db.Query(query, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	return scanFullCards(rows)
}

// SearchCards searches cards with filters
func (db *DB) SearchCards(req models.CardSearchRequest) ([]models.Card, int64, error) {
	baseQuery := `FROM cards c WHERE 1=1`
	args := []interface{}{}
	
	if req.Query != "" {
		baseQuery += ` AND (c.name_id LIKE ? OR c.name_en LIKE ?)`
		args = append(args, "%"+req.Query+"%", "%"+req.Query+"%")
	}
	
	if req.ExpansionCode != "" {
		baseQuery += ` AND c.expansion_code = ?`
		args = append(args, req.ExpansionCode)
	}
	
	if req.Category != "" {
		baseQuery += ` AND c.category = ?`
		args = append(args, req.Category)
	}
	
	if req.CardType != "" {
		baseQuery += ` AND c.card_type = ?`
		args = append(args, req.CardType)
	}
	
	if req.RegulationMark != "" {
		baseQuery += ` AND c.regulation_mark = ?`
		args = append(args, req.RegulationMark)
	}
	
	if req.Rarity != "" {
		baseQuery += ` AND c.rarity = ?`
		args = append(args, req.Rarity)
	}
	
	// Get total count
	var total int64
	countQuery := "SELECT COUNT(*) " + baseQuery
	if err := db.QueryRow(countQuery, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	
	// Get cards
	query := `SELECT c.id, c.external_id, c.name_id, c.name_en, c.category, c.expansion_code,
			  c.collector_number, c.regulation_mark, c.rarity, c.illustrator, c.image_url,
			  c.hp, c.card_type, c.evolution_stage, c.evolves_from, c.retreat_cost,
			  c.attacks, c.abilities, c.weakness, c.resistance, c.pokedex, c.created_at, c.updated_at` + baseQuery
	
	// Add sorting
	sortField := req.SortBy
	if sortField == "" {
		sortField = "name_id"
	}
	sortOrder := req.SortOrder
	if sortOrder == "" {
		sortOrder = "asc"
	}
	query += fmt.Sprintf(" ORDER BY c.%s %s", sortField, sortOrder)
	
	// Add pagination
	limit := req.Limit
	if limit == 0 {
		limit = 20
	}
	page := req.Page
	if page == 0 {
		page = 1
	}
	offset := (page - 1) * limit
	query += " LIMIT ? OFFSET ?"
	args = append(args, limit, offset)
	
	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	
	cards, err := scanFullCards(rows)
	return cards, total, err
}

// GetCardByID gets a card by ID
func (db *DB) GetCardByID(id string) (*models.Card, error) {
	query := `SELECT id, external_id, name_id, name_en, category, expansion_code,
			  collector_number, regulation_mark, rarity, illustrator, image_url,
			  hp, card_type, evolution_stage, evolves_from, retreat_cost,
			  attacks, abilities, weakness, resistance, pokedex, created_at, updated_at
		  FROM cards WHERE id = ?`
	
	row := db.QueryRow(query, id)
	return scanFullCard(row)
}

// GetCardByExternalID gets a card by external ID
func (db *DB) GetCardByExternalID(externalID string) (*models.Card, error) {
	query := `SELECT id, external_id, name_id, name_en, category, expansion_code,
			  collector_number, regulation_mark, rarity, illustrator, image_url,
			  hp, card_type, evolution_stage, evolves_from, retreat_cost,
			  attacks, abilities, weakness, resistance, pokedex, created_at, updated_at
		  FROM cards WHERE external_id = ?`
	
	row := db.QueryRow(query, externalID)
	return scanFullCard(row)
}

// GetCardsByExpansion gets cards by expansion
func (db *DB) GetCardsByExpansion(code string, limit, offset int) ([]models.Card, error) {
	query := `SELECT id, external_id, name_id, name_en, category, expansion_code,
			  collector_number, regulation_mark, rarity, illustrator, image_url,
			  hp, card_type, evolution_stage, evolves_from, retreat_cost,
			  attacks, abilities, weakness, resistance, pokedex, created_at, updated_at
		  FROM cards WHERE expansion_code = ?
		  ORDER BY CAST(collector_number AS INTEGER), collector_number
		  LIMIT ? OFFSET ?`
	
	rows, err := db.Query(query, code, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	return scanFullCards(rows)
}

// GetExpansions gets all expansions
func (db *DB) GetExpansions() ([]models.Expansion, error) {
	query := `SELECT id, code, name_id, name_en, series_id, series_name_en, series_name_id,
			  product_type, total_cards, released_at, pack_image_url, set_symbol_url, created_at
		  FROM expansions ORDER BY released_at DESC`
	
	rows, err := db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	var expansions []models.Expansion
	for rows.Next() {
		var e models.Expansion
		var releasedAt sql.NullTime
		err := rows.Scan(&e.ID, &e.Code, &e.NameID, &e.NameEN, &e.SeriesID, &e.SeriesNameEN, &e.SeriesNameID,
			&e.ProductType, &e.TotalCards, &releasedAt, &e.PackImageURL, &e.SetSymbolURL, &e.CreatedAt)
		if err != nil {
			continue
		}
		if releasedAt.Valid {
			e.ReleasedAt = &releasedAt.Time
		}
		expansions = append(expansions, e)
	}
	
	return expansions, nil
}

// GetExpansionByCode gets expansion by code
func (db *DB) GetExpansionByCode(code string) (*models.Expansion, error) {
	query := `SELECT id, code, name_id, name_en, series_id, series_name_en, series_name_id,
			  product_type, total_cards, released_at, pack_image_url, set_symbol_url, created_at
		  FROM expansions WHERE code = ?`
	
	var e models.Expansion
	var releasedAt sql.NullTime
	err := db.QueryRow(query, code).Scan(&e.ID, &e.Code, &e.NameID, &e.NameEN, &e.SeriesID, &e.SeriesNameEN, &e.SeriesNameID,
		&e.ProductType, &e.TotalCards, &releasedAt, &e.PackImageURL, &e.SetSymbolURL, &e.CreatedAt)
	if err != nil {
		return nil, err
	}
	if releasedAt.Valid {
		e.ReleasedAt = &releasedAt.Time
	}
	
	return &e, nil
}

// Price queries

// GetCardPrices gets all prices for a card
func (db *DB) GetCardPrices(cardID string) ([]models.CardPrice, error) {
	query := `SELECT id, card_id, source, price_idr, price_usd, currency, condition, url, last_updated, created_at
		  FROM card_prices WHERE card_id = ? ORDER BY source, currency, condition`
	
	rows, err := db.Query(query, cardID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	var prices []models.CardPrice
	for rows.Next() {
		var p models.CardPrice
		err := rows.Scan(&p.ID, &p.CardID, &p.Source, &p.PriceIDR, &p.PriceUSD, &p.Currency, &p.Condition, &p.URL, &p.LastUpdated, &p.CreatedAt)
		if err != nil {
			continue
		}
		prices = append(prices, p)
	}
	
	return prices, nil
}

// GetPriceComparisons gets price comparisons for arbitrage
func (db *DB) GetPriceComparisons(minPrice float64) ([]models.ArbitrageComparison, error) {
	query := `SELECT c.id, c.name_id, c.name_en, c.expansion_code,
			  p_idr.price_idr, p_usd.price_usd
		  FROM cards c
		  JOIN card_prices p_idr ON c.id = p_idr.card_id AND p_idr.currency = 'IDR' AND p_idr.price_idr IS NOT NULL
		  JOIN card_prices p_usd ON c.id = p_usd.card_id AND p_usd.currency = 'USD' AND p_usd.price_usd IS NOT NULL
		  WHERE p_idr.price_idr >= ?
		  ORDER BY p_idr.price_idr DESC
		  LIMIT 100`
	
	rows, err := db.Query(query, minPrice)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	var comparisons []models.ArbitrageComparison
	for rows.Next() {
		var pc models.ArbitrageComparison
		var priceIDR, priceUSD float64
		var expansion string
		
		err := rows.Scan(&pc.CardID, &pc.CardName, &pc.NameEN, &expansion, &priceIDR, &priceUSD)
		if err != nil {
			continue
		}
		
		pc.PriceIDR = &priceIDR
		pc.PriceUSD = &priceUSD
		pc.Expansion = expansion
		pc.ExchangeRate = 16400.0
		
		// Calculate arbitrage metrics
		if priceUSD > 0 {
			pc.PriceIDREquivalent = priceUSD * pc.ExchangeRate
			pc.PriceDifference = pc.PriceIDREquivalent - priceIDR
			pc.PriceDifferencePct = (pc.PriceDifference / pc.PriceIDREquivalent) * 100
			
			if pc.PriceDifference > 0 {
				pc.CheaperIn = "ID"
			} else {
				pc.CheaperIn = "US"
			}
			pc.ArbitrageOpportunity = pc.PriceDifferencePct > 20
		}
		
		comparisons = append(comparisons, pc)
	}
	
	return comparisons, nil
}

// Deck queries

// GetDecks gets deck archetypes
func (db *DB) GetDecks(format string, limit, offset int) ([]models.Deck, error) {
	query := `SELECT id, external_id, name, description, format, 
			  tournament_count, win_count, top8_count, created_at, updated_at
		  FROM decks WHERE format = ? OR ? = ''
		  ORDER BY win_count DESC
		  LIMIT ? OFFSET ?`
	
	rows, err := db.Query(query, format, format, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	var decks []models.Deck
	for rows.Next() {
		var d models.Deck
		err := rows.Scan(&d.ID, &d.ExternalID, &d.Name, &d.Description, &d.Format,
			&d.TournamentCount, &d.WinCount, &d.Top8Count, &d.CreatedAt, &d.UpdatedAt)
		if err != nil {
			continue
		}
		decks = append(decks, d)
	}
	
	return decks, nil
}

// GetDeckByID gets a deck by ID
func (db *DB) GetDeckByID(id string) (*models.Deck, error) {
	query := `SELECT id, external_id, name, description, format,
			  tournament_count, win_count, top8_count, created_at, updated_at
		  FROM decks WHERE id = ?`
	
	var d models.Deck
	err := db.QueryRow(query, id).Scan(&d.ID, &d.ExternalID, &d.Name, &d.Description, &d.Format,
		&d.TournamentCount, &d.WinCount, &d.Top8Count, &d.CreatedAt, &d.UpdatedAt)
	if err != nil {
		return nil, err
	}
	
	return &d, nil
}

// Tournament queries

// GetTournaments gets tournaments
func (db *DB) GetTournaments(format string, limit int) ([]models.Tournament, error) {
	query := `SELECT id, external_id, name, date, format, location, player_count, created_at
		  FROM tournaments WHERE format = ? OR ? = ''
		  ORDER BY date DESC LIMIT ?`
	
	rows, err := db.Query(query, format, format, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	var tournaments []models.Tournament
	for rows.Next() {
		var t models.Tournament
		var date sql.NullTime
		err := rows.Scan(&t.ID, &t.ExternalID, &t.Name, &date, &t.Format, &t.Location, &t.PlayerCount, &t.CreatedAt)
		if err != nil {
			continue
		}
		if date.Valid {
			t.Date = date.Time.Format("2006-01-02")
		}
		tournaments = append(tournaments, t)
	}
	
	return tournaments, nil
}

// Insert functions

// InsertCard inserts a card
func (db *DB) InsertCard(card *models.Card) error {
	attacksJSON, _ := json.Marshal(card.Attacks)
	abilitiesJSON, _ := json.Marshal(card.Abilities)
	weaknessJSON, _ := json.Marshal(card.Weakness)
	resistanceJSON, _ := json.Marshal(card.Resistance)
	pokedexJSON, _ := json.Marshal(card.Pokedex)
	
	query := `INSERT INTO cards (id, external_id, name_id, name_en, category, expansion_code,
			  collector_number, regulation_mark, rarity, illustrator, image_url,
			  hp, card_type, evolution_stage, evolves_from, retreat_cost,
			  attacks, abilities, weakness, resistance, pokedex, created_at, updated_at)
		  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
		  ON CONFLICT(id) DO UPDATE SET
			  name_id = excluded.name_id,
			  name_en = excluded.name_en,
			  updated_at = CURRENT_TIMESTAMP`
	
	_, err := db.Exec(query, card.ID, card.ExternalID, card.NameID, card.NameEN, card.Category,
		card.ExpansionCode, card.CollectorNumber, card.RegulationMark, card.Rarity,
		card.Illustrator, card.ImageURL, card.HP, card.CardType, card.EvolutionStage,
		card.EvolvesFrom, card.RetreatCost, attacksJSON, abilitiesJSON, weaknessJSON, resistanceJSON, pokedexJSON)
	
	return err
}

// InsertExpansion inserts an expansion
func (db *DB) InsertExpansion(exp *models.Expansion) error {
	query := `INSERT INTO expansions (id, code, name_id, name_en, series_id, series_name_en, series_name_id,
			  product_type, total_cards, released_at, pack_image_url, set_symbol_url, created_at)
		  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
		  ON CONFLICT(code) DO UPDATE SET
			  name_id = excluded.name_id,
			  name_en = excluded.name_en,
			  total_cards = excluded.total_cards`
	
	_, err := db.Exec(query, exp.ID, exp.Code, exp.NameID, exp.NameEN, exp.SeriesID, exp.SeriesNameEN,
		exp.SeriesNameID, exp.ProductType, exp.TotalCards, exp.ReleasedAt, exp.PackImageURL, exp.SetSymbolURL)
	
	return err
}

// InsertPrice inserts a price
func (db *DB) InsertPrice(price *models.CardPrice) error {
	query := `INSERT INTO card_prices (id, card_id, source, price_idr, price_usd, currency, condition, url, last_updated, created_at)
		  VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
		  ON CONFLICT(card_id, source, currency, condition) DO UPDATE SET
			  price_idr = excluded.price_idr,
			  price_usd = excluded.price_usd,
			  last_updated = CURRENT_TIMESTAMP`
	
	_, err := db.Exec(query, price.ID, price.CardID, price.Source, price.PriceIDR, price.PriceUSD,
		price.Currency, price.Condition, price.URL)
	
	return err
}

// Helper functions

func scanFullCards(rows *sql.Rows) ([]models.Card, error) {
	var cards []models.Card
	for rows.Next() {
		card, err := scanCardFromRow(rows)
		if err != nil {
			continue
		}
		cards = append(cards, card)
	}
	return cards, nil
}

func scanFullCard(row *sql.Row) (*models.Card, error) {
	card, err := scanCardFromRow(row)
	return &card, err
}

func scanCardFromRow(scanner interface{}) (models.Card, error) {
	var c models.Card
	var attacksJSON, abilitiesJSON, weaknessJSON, resistanceJSON, pokedexJSON []byte
	
	var scanFunc func(dest ...interface{}) error
	switch s := scanner.(type) {
	case *sql.Rows:
		scanFunc = s.Scan
	case *sql.Row:
		scanFunc = s.Scan
	default:
		return c, fmt.Errorf("unsupported scanner type")
	}
	
	err := scanFunc(&c.ID, &c.ExternalID, &c.NameID, &c.NameEN, &c.Category, &c.ExpansionCode,
		&c.CollectorNumber, &c.RegulationMark, &c.Rarity, &c.Illustrator, &c.ImageURL,
		&c.HP, &c.CardType, &c.EvolutionStage, &c.EvolvesFrom, &c.RetreatCost,
		&attacksJSON, &abilitiesJSON, &weaknessJSON, &resistanceJSON, &pokedexJSON,
		&c.CreatedAt, &c.UpdatedAt)
	
	if err != nil {
		return c, err
	}
	
	// Unmarshal JSON fields
	if len(attacksJSON) > 0 {
		json.Unmarshal(attacksJSON, &c.Attacks)
	}
	if len(abilitiesJSON) > 0 {
		json.Unmarshal(abilitiesJSON, &c.Abilities)
	}
	if len(weaknessJSON) > 0 {
		json.Unmarshal(weaknessJSON, &c.Weakness)
	}
	if len(resistanceJSON) > 0 {
		json.Unmarshal(resistanceJSON, &c.Resistance)
	}
	if len(pokedexJSON) > 0 {
		json.Unmarshal(pokedexJSON, &c.Pokedex)
	}
	
	return c, nil
}

// GenerateCardID generates a unique card ID
func GenerateCardID(expansionCode, collectorNumber, name string) string {
	// Sanitize inputs
	name = strings.ToLower(strings.ReplaceAll(name, " ", "_"))
	return fmt.Sprintf("%s-%s-%s", expansionCode, collectorNumber, name)
}
