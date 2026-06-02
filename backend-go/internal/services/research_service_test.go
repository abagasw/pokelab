package services

import (
	"context"
	"database/sql"
	"pokemon-tcg-indonesia/internal/models"
	"testing"

	_ "modernc.org/sqlite"
)

func TestTierFromScore(t *testing.T) {
	tests := []struct {
		score float64
		want  string
	}{
		{90, "S"},
		{70, "A"},
		{50, "B"},
		{10, "C"},
	}

	for _, test := range tests {
		if got := tierFromScore(test.score); got != test.want {
			t.Fatalf("tierFromScore(%v) = %s, want %s", test.score, got, test.want)
		}
	}
}

func TestBuyPriorityNeverNegative(t *testing.T) {
	card := models.DeckCard{CardName: "Poffin Bersahabat", Count: 4}
	deck := models.Deck{Name: "Test Deck"}

	if got := buyPriority(card, 3, deck); got != "medium" {
		t.Fatalf("buyPriority() = %s, want medium", got)
	}
}

func TestSubstituteSuggestions(t *testing.T) {
	card := models.DeckCard{CardName: "Perintah Bos"}
	got := substituteSuggestions(card)

	if len(got) == 0 {
		t.Fatal("expected substitute suggestions for Boss effect")
	}
}

func TestBuildDeckAnalysisIncludesAllCardsAndBreakdown(t *testing.T) {
	db := setupResearchTestDB(t)
	defer db.Close()

	service := NewResearchService(db, nil)
	ctx := context.Background()
	seedResearchAnalysisData(t, db)

	analysis, err := service.GetDeckAnalysis(ctx, "user-1", "collection-1", "deck-1")
	if err != nil {
		t.Fatalf("GetDeckAnalysis() error = %v", err)
	}

	if len(analysis.CardUsage) != 4 {
		t.Fatalf("CardUsage length = %d, want 4", len(analysis.CardUsage))
	}
	if analysis.RequiredCards != 10 {
		t.Fatalf("RequiredCards = %d, want 10", analysis.RequiredCards)
	}
	if analysis.OwnedCards != 7 {
		t.Fatalf("OwnedCards = %d, want 7", analysis.OwnedCards)
	}
	if analysis.DeckStatistics.UniqueCards != 4 {
		t.Fatalf("UniqueCards = %d, want 4", analysis.DeckStatistics.UniqueCards)
	}
	if analysis.DeckStatistics.MissingCopies != 3 {
		t.Fatalf("MissingCopies = %d, want 3", analysis.DeckStatistics.MissingCopies)
	}
	if analysis.DeckStatistics.TrainerCopies != 5 {
		t.Fatalf("TrainerCopies = %d, want 5", analysis.DeckStatistics.TrainerCopies)
	}

	breakdownTotal := 0
	for _, item := range analysis.CategoryBreakdown {
		breakdownTotal += item.RequiredCount
	}
	if breakdownTotal != analysis.RequiredCards {
		t.Fatalf("breakdown total = %d, want %d", breakdownTotal, analysis.RequiredCards)
	}

	var charizard models.ResearchCardUsage
	for _, item := range analysis.CardUsage {
		if item.CardID == "card-pokemon" {
			charizard = item
			break
		}
	}
	if charizard.CardID == "" {
		t.Fatal("expected pokemon card usage")
	}
	if charizard.MissingCount != 0 {
		t.Fatalf("MissingCount = %d, want 0 because owned copies exceed requirement", charizard.MissingCount)
	}
	if charizard.Role != "attacker" {
		t.Fatalf("Role = %s, want attacker", charizard.Role)
	}
	if charizard.Statistics.OwnershipStatus != "complete" {
		t.Fatalf("OwnershipStatus = %s, want complete", charizard.Statistics.OwnershipStatus)
	}
	if charizard.Statistics.OverallRank <= 0 {
		t.Fatalf("OverallRank = %d, want positive rank", charizard.Statistics.OverallRank)
	}
}

func TestGetDeckAnalysisRejectsOtherUsersCollection(t *testing.T) {
	db := setupResearchTestDB(t)
	defer db.Close()

	service := NewResearchService(db, nil)
	seedResearchAnalysisData(t, db)

	_, err := service.GetDeckAnalysis(context.Background(), "user-2", "collection-1", "deck-1")
	if err == nil || err.Error() != "collection not found" {
		t.Fatalf("GetDeckAnalysis() error = %v, want collection not found", err)
	}
}

func setupResearchTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}

	schema := `
	CREATE TABLE collections (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL,
		name TEXT
	);
	CREATE TABLE collection_items (
		id TEXT PRIMARY KEY,
		collection_id TEXT NOT NULL,
		card_id TEXT NOT NULL,
		quantity INTEGER NOT NULL
	);
	CREATE TABLE decks (
		id TEXT PRIMARY KEY,
		user_id TEXT,
		name TEXT NOT NULL,
		archetype TEXT,
		format TEXT,
		tournament_count INTEGER DEFAULT 0,
		win_count INTEGER DEFAULT 0,
		top8_count INTEGER DEFAULT 0
	);
	CREATE TABLE deck_cards (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		deck_id TEXT NOT NULL,
		card_id TEXT NOT NULL,
		count INTEGER NOT NULL DEFAULT 1,
		is_pokemon BOOLEAN DEFAULT FALSE
	);
	CREATE TABLE cards (
		id TEXT PRIMARY KEY,
		name_id TEXT NOT NULL,
		category TEXT NOT NULL,
		card_type TEXT,
		rarity TEXT
	);
	CREATE TABLE card_prices (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		card_id TEXT NOT NULL,
		price_idr REAL
	);
	`
	if _, err := db.Exec(schema); err != nil {
		t.Fatalf("create schema: %v", err)
	}
	return db
}

func seedResearchAnalysisData(t *testing.T, db *sql.DB) {
	t.Helper()
	statements := []string{
		`INSERT INTO collections (id, user_id, name) VALUES ('collection-1', 'user-1', 'Main')`,
		`INSERT INTO decks (id, name, archetype, format, tournament_count, win_count, top8_count) VALUES ('deck-1', 'Charizard ex', 'Fire Midrange', 'Standard', 4, 2, 1)`,
		`INSERT INTO cards (id, name_id, category, card_type, rarity) VALUES
			('card-pokemon', 'Charizard ex', 'Pokemon', 'Fire', 'Double Rare'),
			('card-search', 'Poffin Bersahabat', 'Trainer', 'Item', 'Uncommon'),
			('card-gust', 'Perintah Bos', 'Trainer', 'Supporter', 'Rare'),
			('card-energy', 'Basic Fire Energy', 'Energy', 'Basic Energy', 'Common')`,
		`INSERT INTO deck_cards (deck_id, card_id, count, is_pokemon) VALUES
			('deck-1', 'card-pokemon', 3, true),
			('deck-1', 'card-search', 4, false),
			('deck-1', 'card-gust', 1, false),
			('deck-1', 'card-energy', 2, false)`,
		`INSERT INTO collection_items (id, collection_id, card_id, quantity) VALUES
			('ci-1', 'collection-1', 'card-pokemon', 10),
			('ci-2', 'collection-1', 'card-search', 2),
			('ci-3', 'collection-1', 'card-energy', 2)`,
		`INSERT INTO card_prices (card_id, price_idr) VALUES
			('card-search', 15000),
			('card-gust', 8000)`,
	}
	for _, statement := range statements {
		if _, err := db.Exec(statement); err != nil {
			t.Fatalf("seed statement failed: %v", err)
		}
	}
}
