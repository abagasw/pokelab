package services

import (
	"context"
	"database/sql"
	"fmt"
	"testing"

	"pokemon-tcg-indonesia/internal/models"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	_ "modernc.org/sqlite"
)

func setupTestDB(t *testing.T) *sql.DB {
	db, err := sql.Open("sqlite", ":memory:")
	require.NoError(t, err)

	// Create test schema
	schema := `
	CREATE TABLE IF NOT EXISTS cards (
		id TEXT PRIMARY KEY,
		external_id INTEGER,
		name_id TEXT NOT NULL,
		name_en TEXT,
		category TEXT NOT NULL,
		expansion_code TEXT,
		collector_number TEXT,
		regulation_mark TEXT,
		rarity TEXT,
		illustrator TEXT,
		image_url TEXT,
		hp INTEGER,
		card_type TEXT,
		evolution_stage TEXT,
		evolves_from TEXT,
		retreat_cost INTEGER,
		attacks TEXT,
		abilities TEXT,
		weakness TEXT,
		resistance TEXT,
		pokedex TEXT,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS expansions (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		code TEXT UNIQUE NOT NULL,
		name_id TEXT,
		name_en TEXT,
		series_id INTEGER,
		series_name_en TEXT,
		series_name_id TEXT,
		product_type TEXT,
		total_cards INTEGER,
		released_at DATE,
		pack_image_url TEXT,
		set_symbol_url TEXT,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);
	`
	_, err = db.Exec(schema)
	require.NoError(t, err)

	return db
}

func TestCardService_SearchCards(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	service := NewCardService(db, nil)
	ctx := context.Background()

	// Insert test data
	_, err := db.Exec(`
		INSERT INTO cards (id, name_id, name_en, category, expansion_code, rarity)
		VALUES 
			('card-001', 'Pikachu', 'Pikachu', 'Pokemon', 'SV1', 'C'),
			('card-002', 'Charizard', 'Charizard', 'Pokemon', 'SV1', 'R'),
			('card-003', 'Potion', 'Potion', 'Trainer', 'SV1', 'C')
	`)
	require.NoError(t, err)

	tests := []struct {
		name     string
		req      models.CardSearchRequest
		expected int
	}{
		{
			name:     "Search all cards",
			req:      models.CardSearchRequest{Page: 1, Limit: 10},
			expected: 3,
		},
		{
			name:     "Search by query",
			req:      models.CardSearchRequest{Query: "Pika", Page: 1, Limit: 10},
			expected: 1,
		},
		{
			name:     "Search by category",
			req:      models.CardSearchRequest{Category: "Trainer", Page: 1, Limit: 10},
			expected: 1,
		},
		{
			name:     "Search with no results",
			req:      models.CardSearchRequest{Query: "NonExistent", Page: 1, Limit: 10},
			expected: 0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := service.SearchCards(ctx, tt.req)
			require.NoError(t, err)
			assert.Len(t, result.Cards, tt.expected)
		})
	}
}

func TestCardService_GetCardByID(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	service := NewCardService(db, nil)
	ctx := context.Background()

	// Insert test card
	_, err := db.Exec(`
		INSERT INTO cards (id, name_id, name_en, category, hp, card_type)
		VALUES ('card-001', 'Pikachu', 'Pikachu', 'Pokemon', 60, 'Lightning')
	`)
	require.NoError(t, err)

	t.Run("Get existing card", func(t *testing.T) {
		card, err := service.GetCardByID(ctx, "card-001")
		require.NoError(t, err)
		assert.NotNil(t, card)
		assert.Equal(t, "Pikachu", card.NameID)
		assert.Equal(t, "Pokemon", card.Category)
	})

	t.Run("Get non-existent card", func(t *testing.T) {
		_, err := service.GetCardByID(ctx, "non-existent")
		assert.Error(t, err)
	})
}

func TestCardService_GetExpansions(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	service := NewCardService(db, nil)
	ctx := context.Background()

	// Insert test expansions
	_, err := db.Exec(`
		INSERT INTO expansions (code, name_id, name_en, total_cards)
		VALUES 
			('SV1', 'Scarlet & Violet', 'Scarlet & Violet', 198),
			('SV2', 'Paldea Evolved', 'Paldea Evolved', 279)
	`)
	require.NoError(t, err)

	expansions, err := service.GetExpansions(ctx)
	require.NoError(t, err)
	assert.Len(t, expansions, 2)
	assert.Equal(t, "SV1", expansions[0].Code)
}

func TestCardService_CalculateTypeAdvantage(t *testing.T) {
	service := NewCardService(nil, nil)

	tests := []struct {
		attacker      string
		defender      string
		expectedMult  float64
		effectiveness string
	}{
		{"Fire", "Grass", 2.0, "super effective"},
		{"Water", "Fire", 2.0, "super effective"},
		{"Fire", "Water", 0.5, "not very effective"},
		{"Fire", "Fire", 0.5, "not very effective"},
		{"Electric", "Ground", 0.0, "no effect"},
		{"Normal", "Normal", 1.0, "normal"},
	}

	for _, tt := range tests {
		t.Run(fmt.Sprintf("%s vs %s", tt.attacker, tt.defender), func(t *testing.T) {
			mult, effectiveness := service.CalculateTypeAdvantage(tt.attacker, tt.defender)
			assert.Equal(t, tt.expectedMult, mult)
			assert.Equal(t, tt.effectiveness, effectiveness)
		})
	}
}
