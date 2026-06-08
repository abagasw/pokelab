package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"math/rand"
	"pokemon-tcg-indonesia/internal/models"
	"time"

	"github.com/google/uuid"
)

// CollectionService handles collection management
type CollectionService struct {
	db       *sql.DB
	priceSvc *PriceService
}

// NewCollectionService creates a new CollectionService
func NewCollectionService(db *sql.DB, priceSvc *PriceService) *CollectionService {
	return &CollectionService{db: db, priceSvc: priceSvc}
}

// CreateCollection creates a new collection for a user
func (s *CollectionService) CreateCollection(ctx context.Context, userID string, name string, isDefault bool) (*models.Collection, error) {
	collectionID := uuid.New().String()
	now := time.Now()

	_, err := s.db.ExecContext(ctx, `
		INSERT INTO collections (id, user_id, name, is_default, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?)
	`, collectionID, userID, name, isDefault, now, now)

	if err != nil {
		return nil, fmt.Errorf("failed to create collection: %w", err)
	}

	return &models.Collection{
		ID:        collectionID,
		UserID:    userID,
		Name:      name,
		CreatedAt: now,
		UpdatedAt: now,
	}, nil
}

// GetCollections gets all collections for a user
func (s *CollectionService) GetCollections(ctx context.Context, userID string) ([]models.Collection, error) {
	collections := []models.Collection{}
	rows, err := s.db.QueryContext(ctx, `
		SELECT c.id, c.user_id, c.name, c.is_default, c.created_at, c.updated_at,
		       COALESCE(SUM(ci.quantity), 0) AS total_cards,
		       COALESCE(SUM(COALESCE(cp.price_idr, ci.purchase_price, 0) * ci.quantity), 0) AS total_value_idr
		FROM collections c
		LEFT JOIN collection_items ci ON ci.collection_id = c.id
		LEFT JOIN (
			SELECT card_id, MAX(price_idr) AS price_idr
			FROM card_prices
			WHERE price_idr IS NOT NULL
			GROUP BY card_id
		) cp ON cp.card_id = ci.card_id
		WHERE c.user_id = ?
		GROUP BY c.id, c.user_id, c.name, c.is_default, c.created_at, c.updated_at
		ORDER BY c.is_default DESC, c.created_at DESC
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to query collections: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var c models.Collection
		var isDefault bool
		err := rows.Scan(&c.ID, &c.UserID, &c.Name, &isDefault, &c.CreatedAt, &c.UpdatedAt, &c.TotalCards, &c.TotalValueIDR)
		if err != nil {
			continue
		}
		collections = append(collections, c)
	}

	return collections, nil
}

// GetCollection gets a collection by ID with items
func (s *CollectionService) GetCollection(ctx context.Context, collectionID string) (*models.Collection, error) {
	var c models.Collection
	var isDefault bool
	err := s.db.QueryRowContext(ctx, `
		SELECT id, user_id, name, is_default, created_at, updated_at
		FROM collections
		WHERE id = ?
	`, collectionID).Scan(&c.ID, &c.UserID, &c.Name, &isDefault, &c.CreatedAt, &c.UpdatedAt)

	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("collection not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get collection: %w", err)
	}

	// Get collection items
	items, err := s.getCollectionItems(ctx, collectionID)
	if err != nil {
		return nil, err
	}
	c.Items = items
	for _, item := range items {
		c.TotalCards += item.Quantity
		if item.PurchasePrice != nil {
			c.TotalValueIDR += *item.PurchasePrice * float64(item.Quantity)
		}
	}

	return &c, nil
}

// GetCollectionForUser gets a collection only when it belongs to the user.
func (s *CollectionService) GetCollectionForUser(ctx context.Context, collectionID string, userID string) (*models.Collection, error) {
	collection, err := s.GetCollection(ctx, collectionID)
	if err != nil {
		return nil, err
	}
	if collection.UserID != userID {
		return nil, fmt.Errorf("collection not found")
	}
	return collection, nil
}

// UpdateCollection updates collection name
func (s *CollectionService) UpdateCollection(ctx context.Context, collectionID string, name string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE collections
		SET name = ?, updated_at = ?
		WHERE id = ?
	`, name, time.Now(), collectionID)

	if err != nil {
		return fmt.Errorf("failed to update collection: %w", err)
	}

	return nil
}

// DeleteCollection deletes a collection and all its items
func (s *CollectionService) DeleteCollection(ctx context.Context, collectionID string) error {
	// Delete collection items first (foreign key constraint)
	_, err := s.db.ExecContext(ctx, `DELETE FROM collection_items WHERE collection_id = ?`, collectionID)
	if err != nil {
		return fmt.Errorf("failed to delete collection items: %w", err)
	}

	// Delete collection
	_, err = s.db.ExecContext(ctx, `DELETE FROM collections WHERE id = ?`, collectionID)
	if err != nil {
		return fmt.Errorf("failed to delete collection: %w", err)
	}

	return nil
}

// AddToCollection adds a card to collection
func (s *CollectionService) AddToCollection(ctx context.Context, collectionID string, req models.CollectionRequest) error {
	// Check if item already exists
	var existingID int
	var existingQty int
	err := s.db.QueryRowContext(ctx, `
		SELECT id, quantity FROM collection_items
		WHERE collection_id = ? AND card_id = ?
	`, collectionID, req.CardID).Scan(&existingID, &existingQty)

	if err == nil {
		// Update existing item
		newQty := existingQty + req.Quantity
		_, err = s.db.ExecContext(ctx, `
			UPDATE collection_items
			SET quantity = ?, condition = ?, updated_at = ?
			WHERE id = ?
		`, newQty, req.Condition, time.Now(), existingID)
		if err != nil {
			return fmt.Errorf("failed to update collection item: %w", err)
		}
	} else if err == sql.ErrNoRows {
		// Insert new item (id is auto-generated)
		now := time.Now()
		_, err = s.db.ExecContext(ctx, `
			INSERT INTO collection_items (
				collection_id, card_id, quantity, condition,
				purchase_price, purchase_currency, notes, created_at, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		`, collectionID, req.CardID, req.Quantity, req.Condition,
			req.PurchasePrice, req.PurchaseCurrency, req.Notes, now, now)
		if err != nil {
			return fmt.Errorf("failed to add to collection: %w", err)
		}
	} else {
		return fmt.Errorf("failed to check existing item: %w", err)
	}

	// Update collection updated_at
	_, _ = s.db.ExecContext(ctx, `UPDATE collections SET updated_at = ? WHERE id = ?`, time.Now(), collectionID)

	return nil
}

// RemoveFromCollection removes a card from collection
func (s *CollectionService) RemoveFromCollection(ctx context.Context, collectionID string, itemID string) error {
	_, err := s.db.ExecContext(ctx, `
		DELETE FROM collection_items
		WHERE id = ? AND collection_id = ?
	`, itemID, collectionID)

	if err != nil {
		return fmt.Errorf("failed to remove from collection: %w", err)
	}

	// Update collection updated_at
	_, _ = s.db.ExecContext(ctx, `UPDATE collections SET updated_at = ? WHERE id = ?`, time.Now(), collectionID)

	return nil
}

// UpdateCollectionItem updates collection item details
func (s *CollectionService) UpdateCollectionItem(ctx context.Context, collectionID string, itemID string, req models.CollectionRequest) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE collection_items
		SET quantity = ?, condition = ?, purchase_price = ?,
		    purchase_currency = ?, notes = ?, updated_at = ?
		WHERE id = ? AND collection_id = ?
	`, req.Quantity, req.Condition, req.PurchasePrice,
		req.PurchaseCurrency, req.Notes, time.Now(), itemID, collectionID)

	if err != nil {
		return fmt.Errorf("failed to update collection item: %w", err)
	}

	return nil
}

// GetCollectionSummary gets collection summary with stats
func (s *CollectionService) GetCollectionSummary(ctx context.Context, collectionID string) (*models.CollectionSummary, error) {
	// Get collection name
	var name string
	err := s.db.QueryRowContext(ctx, `SELECT name FROM collections WHERE id = ?`, collectionID).Scan(&name)
	if err != nil {
		return nil, fmt.Errorf("collection not found: %w", err)
	}

	summary := &models.CollectionSummary{
		CollectionID: collectionID,
		Name:         name,
	}

	// Get items with card details
	rows, err := s.db.QueryContext(ctx, `
		SELECT ci.id, ci.card_id, ci.quantity, ci.condition,
		       ci.purchase_price, ci.purchase_currency,
		       c.name_id, c.name_en, c.expansion_code, c.rarity, c.image_url
		FROM collection_items ci
		JOIN cards c ON ci.card_id = c.id
		WHERE ci.collection_id = ?
	`, collectionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var totalPurchaseCost float64
	expansionCount := make(map[string]int)

	for rows.Next() {
		var item struct {
			ID       int
			CardID   string
			Qty      int
			Cond     string
			PurPrice *float64
			PurCurr  string
			NameID   string
			NameEN   sql.NullString
			ExpCode  sql.NullString
			Rarity   sql.NullString
			ImgURL   sql.NullString
		}

		err := rows.Scan(&item.ID, &item.CardID, &item.Qty, &item.Cond,
			&item.PurPrice, &item.PurCurr,
			&item.NameID, &item.NameEN, &item.ExpCode, &item.Rarity, &item.ImgURL)
		if err != nil {
			continue
		}

		// Count cards
		summary.CardCount.Total += item.Qty
		summary.CardCount.Unique++

		// Track expansion distribution
		if item.ExpCode.Valid {
			expansionCount[item.ExpCode.String] += item.Qty
		}

		// Calculate purchase cost
		if item.PurPrice != nil {
			totalPurchaseCost += *item.PurPrice * float64(item.Qty)
		}

		// TODO: Get current price for value calculation
	}

	summary.Value.PurchaseCost = totalPurchaseCost

	// Build expansion distribution
	for code, count := range expansionCount {
		summary.Expansions = append(summary.Expansions, struct {
			Code  string `json:"code"`
			Name  string `json:"name"`
			Count int    `json:"count"`
		}{
			Code:  code,
			Name:  code, // Use code as name for now if name not available
			Count: count,
		})
	}

	return summary, nil
}

// CreatePriceAlert creates a price alert
func (s *CollectionService) CreatePriceAlert(ctx context.Context, userID string, cardID string, targetPrice float64, condition string) (*models.PriceAlert, error) {
	alertID := uuid.New().String()
	now := time.Now()

	_, err := s.db.ExecContext(ctx, `
		INSERT INTO alerts (id, user_id, card_id, alert_type, target_value, target_currency, condition, is_active, created_at)
		VALUES (?, ?, ?, 'price', ?, 'IDR', ?, 1, ?)
	`, alertID, userID, cardID, targetPrice, condition, now)

	if err != nil {
		return nil, fmt.Errorf("failed to create alert: %w", err)
	}

	return &models.PriceAlert{
		ID:             alertID,
		UserID:         userID,
		CardID:         cardID,
		TargetPrice:    targetPrice,
		TargetCurrency: "IDR",
		Condition:      condition,
		IsActive:       true,
		CreatedAt:      now,
	}, nil
}

// GetPriceAlerts gets user's price alerts
func (s *CollectionService) GetPriceAlerts(ctx context.Context, userID string) ([]models.PriceAlert, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT a.id, a.user_id, a.card_id, a.target_value, a.target_currency, 
		       a.condition, a.is_active, a.triggered_at, a.created_at,
		       c.name_id, c.image_url
		FROM alerts a
		JOIN cards c ON a.card_id = c.id
		WHERE a.user_id = ? AND a.alert_type = 'price'
		ORDER BY a.created_at DESC
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get alerts: %w", err)
	}
	defer rows.Close()

	var alerts []models.PriceAlert
	for rows.Next() {
		var a models.PriceAlert
		var triggeredAt sql.NullTime
		var cardName, imageURL sql.NullString

		err := rows.Scan(&a.ID, &a.UserID, &a.CardID, &a.TargetPrice, &a.TargetCurrency,
			&a.Condition, &a.IsActive, &triggeredAt, &a.CreatedAt,
			&cardName, &imageURL)
		if err != nil {
			continue
		}

		if triggeredAt.Valid {
			a.TriggeredAt = &triggeredAt.Time
		}

		if cardName.Valid {
			a.Card = &models.Card{NameID: cardName.String}
			if imageURL.Valid {
				a.Card.ImageURL = imageURL.String
			}
		}

		alerts = append(alerts, a)
	}

	return alerts, nil
}

// GetPortfolioInsight generates deep visual analysis for a collection
func (s *CollectionService) GetPortfolioInsight(ctx context.Context, collectionID string) (*models.PortfolioInsight, error) {
	insight := &models.PortfolioInsight{
		CollectionID:       collectionID,
		ValueHistory:       []models.ValuePoint{},
		TypeDistribution:   []models.TypeCount{},
		RarityDistribution: []models.RarityCount{},
		ExpansionProgress:  []models.ExpansionProgress{},
		NotableMovements:   []models.PriceMovement{},
	}

	// 1. Get Value History (Mocked for now based on current items)
	// In a real app, this would query a historical snapshots table
	now := time.Now()
	for i := 6; i >= 0; i-- {
		date := now.AddDate(0, 0, -i*5).Format("2006-01-02")
		// Simulate a slightly growing value
		insight.ValueHistory = append(insight.ValueHistory, models.ValuePoint{
			Date:  date,
			Value: 1250000 + float64(7-i)*50000 + (rand.Float64() * 20000),
		})
	}

	// 2. Get Type & Rarity Distribution
	rows, err := s.db.QueryContext(ctx, `
		SELECT c.card_type, c.rarity, COUNT(ci.id) as count
		FROM collection_items ci
		JOIN cards c ON ci.card_id = c.id
		WHERE ci.collection_id = ?
		GROUP BY c.card_type, c.rarity
	`, collectionID)

	if err == nil {
		defer rows.Close()
		typeMap := make(map[string]int)
		rarityMap := make(map[string]int)

		for rows.Next() {
			var t, r sql.NullString
			var count int
			rows.Scan(&t, &r, &count)

			if t.Valid && t.String != "" {
				typeMap[t.String] += count
			} else {
				typeMap["Other"] += count
			}

			if r.Valid && r.String != "" {
				rarityMap[r.String] += count
			} else {
				rarityMap["Unknown"] += count
			}
		}

		for t, c := range typeMap {
			insight.TypeDistribution = append(insight.TypeDistribution, models.TypeCount{
				Type:  t,
				Count: c,
			})
		}
		for r, c := range rarityMap {
			insight.RarityDistribution = append(insight.RarityDistribution, models.RarityCount{
				Rarity: r,
				Count:  c,
			})
		}
	}

	// 3. Get Expansion Progress
	expRows, err := s.db.QueryContext(ctx, `
		SELECT e.code, e.name_id, e.total_cards, COUNT(DISTINCT ci.card_id) as collected
		FROM collection_items ci
		JOIN cards c ON ci.card_id = c.id
		JOIN expansions e ON c.expansion_code = e.code
		WHERE ci.collection_id = ?
		GROUP BY e.code
		ORDER BY collected DESC
		LIMIT 5
	`, collectionID)

	if err == nil {
		defer expRows.Close()
		for expRows.Next() {
			var code, name string
			var total, collected int
			if err := expRows.Scan(&code, &name, &total, &collected); err == nil {
				if total == 0 {
					total = 200
				} // Fallback
				insight.ExpansionProgress = append(insight.ExpansionProgress, models.ExpansionProgress{
					Code:       code,
					Name:       name,
					Collected:  collected,
					TotalCards: total,
					Percentage: float64(collected) / float64(total) * 100,
				})
			}
		}
	}

	// 4. Notable Movements (Simulated gainers)
	insight.NotableMovements = []models.PriceMovement{
		{CardID: "sv8s-123", Name: "Pikachu ex", ChangePercent: 12.5, CurrentPrice: 450000, Trend: "up"},
		{CardID: "sv7s-045", Name: "Charizard ex", ChangePercent: -3.2, CurrentPrice: 1200000, Trend: "down"},
	}

	return insight, nil
}

// DeletePriceAlert deletes a price alert
func (s *CollectionService) DeletePriceAlert(ctx context.Context, alertID string, userID string) error {
	_, err := s.db.ExecContext(ctx, `
		DELETE FROM alerts
		WHERE id = ? AND user_id = ?
	`, alertID, userID)

	if err != nil {
		return fmt.Errorf("failed to delete alert: %w", err)
	}

	return nil
}

// Helper functions

func (s *CollectionService) getCollectionItems(ctx context.Context, collectionID string) ([]models.CollectionItem, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT ci.id, ci.collection_id, ci.card_id, ci.quantity, ci.condition,
		       ci.purchase_price, ci.purchase_currency, ci.purchase_date, ci.notes,
		       ci.created_at, ci.updated_at,
		       c.name_id, c.name_en, c.image_url, c.expansion_code, c.rarity
		FROM collection_items ci
		JOIN cards c ON ci.card_id = c.id
		WHERE ci.collection_id = ?
		ORDER BY c.name_id
	`, collectionID)
	if err != nil {
		return nil, fmt.Errorf("failed to query collection items: %w", err)
	}
	defer rows.Close()

	var items []models.CollectionItem
	for rows.Next() {
		var item models.CollectionItem
		item.Card = &models.Card{} // Initialize Card pointer
		var nameEN, imageURL, expCode, rarity sql.NullString
		var purchaseDate sql.NullTime

		err := rows.Scan(&item.ID, &item.CollectionID, &item.CardID, &item.Quantity, &item.Condition,
			&item.PurchasePrice, &item.PurchaseCurrency, &purchaseDate, &item.Notes,
			&item.CreatedAt, &item.UpdatedAt,
			&item.Card.NameID, &nameEN, &imageURL, &expCode, &rarity)
		if err != nil {
			continue
		}

		if purchaseDate.Valid {
			item.PurchaseDate = &purchaseDate.Time
		}

		if nameEN.Valid {
			item.Card.NameEN = nameEN.String
		}
		if imageURL.Valid {
			item.Card.ImageURL = imageURL.String
		}
		if expCode.Valid {
			item.Card.ExpansionCode = expCode.String
		}
		if rarity.Valid {
			item.Card.Rarity = rarity.String
		}

		items = append(items, item)
	}

	return items, nil
}

// ImportCollection imports a collection from various formats
func (s *CollectionService) ImportCollection(ctx context.Context, userID string, collectionID string, data []byte, format string) (*models.ImportResult, error) {
	result := &models.ImportResult{
		Imported: 0,
		Errors:   []string{},
	}

	switch format {
	case "json":
		var items []models.CollectionRequest
		if err := json.Unmarshal(data, &items); err != nil {
			return nil, fmt.Errorf("failed to parse JSON: %w", err)
		}

		for _, item := range items {
			if err := s.AddToCollection(ctx, collectionID, item); err != nil {
				result.Errors = append(result.Errors, fmt.Sprintf("Failed to add card %s: %v", item.CardID, err))
			} else {
				result.Imported++
			}
		}

	case "csv":
		// TODO: Parse CSV
		return nil, fmt.Errorf("CSV import not yet implemented")

	default:
		return nil, fmt.Errorf("unsupported format: %s", format)
	}

	return result, nil
}

// ExportCollection exports a collection
func (s *CollectionService) ExportCollection(ctx context.Context, collectionID string, format string) ([]byte, error) {
	items, err := s.getCollectionItems(ctx, collectionID)
	if err != nil {
		return nil, err
	}

	switch format {
	case "json":
		return json.MarshalIndent(items, "", "  ")

	case "csv":
		// TODO: Generate CSV
		return nil, fmt.Errorf("CSV export not yet implemented")

	default:
		return nil, fmt.Errorf("unsupported format: %s", format)
	}
}

// BulkImportEntry represents a single entry in a bulk import
type BulkImportEntry struct {
	Name     string `json:"name"`
	Quantity int    `json:"quantity"`
}

// BulkImportResult represents the result of a bulk import
type BulkImportResult struct {
	Matched int      `json:"matched"`
	Failed  int      `json:"failed"`
	Errors  []string `json:"errors"`
}

// BulkImportByName searches for cards by name and adds them to a collection in bulk
func (s *CollectionService) BulkImportByName(ctx context.Context, collectionID string, entries []BulkImportEntry) (*BulkImportResult, error) {
	result := &BulkImportResult{Errors: []string{}}

	for _, entry := range entries {
		if entry.Name == "" || entry.Quantity <= 0 {
			continue
		}

		// Search card by name - strict: exact → starts-with → contains
		var cardID string
		err := s.db.QueryRowContext(ctx, `
			SELECT id FROM cards
			WHERE LOWER(name_id) = LOWER(?) OR LOWER(name_en) = LOWER(?)
			ORDER BY id DESC
			LIMIT 1
		`, entry.Name, entry.Name).Scan(&cardID)

		if err == sql.ErrNoRows {
			// Try starts-with match (prefer shorter names = closer match)
			err = s.db.QueryRowContext(ctx, `
				SELECT id FROM cards
				WHERE LOWER(name_id) LIKE LOWER(?) OR LOWER(name_en) LIKE LOWER(?)
				ORDER BY id DESC, LENGTH(name_id) ASC
				LIMIT 1
			`, entry.Name+"%", entry.Name+"%").Scan(&cardID)
		}

		if err == sql.ErrNoRows {
			// Try contains match as last resort
			err = s.db.QueryRowContext(ctx, `
				SELECT id FROM cards
				WHERE LOWER(name_id) LIKE LOWER(?) OR LOWER(name_en) LIKE LOWER(?)
				ORDER BY id DESC, LENGTH(name_id) ASC
				LIMIT 1
			`, "%"+entry.Name+"%", "%"+entry.Name+"%").Scan(&cardID)
		}

		if err != nil {
			result.Failed++
			result.Errors = append(result.Errors, fmt.Sprintf("%q - tidak ditemukan", entry.Name))
			continue
		}

		// Add to collection (upsert)
		req := models.CollectionRequest{
			CardID:   cardID,
			Quantity: entry.Quantity,
			Condition: "NM",
		}
		if err := s.AddToCollection(ctx, collectionID, req); err != nil {
			result.Failed++
			result.Errors = append(result.Errors, fmt.Sprintf("%q - error: %v", entry.Name, err))
			continue
		}

		result.Matched++
	}

	return result, nil
}
