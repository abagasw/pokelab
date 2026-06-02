package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

// Data structures for JSON parsing
type AllData struct {
	ExpansionsCount int                  `json:"expansions_count"`
	TotalCards      int                  `json:"total_cards"`
	ScrapedAt       string               `json:"scraped_at"`
	Data            []ExpansionWithCards `json:"data"`
}

type ExpansionWithCards struct {
	Expansion ExpansionData `json:"expansion"`
	Cards     []CardData    `json:"cards"`
}

type ExpansionData struct {
	ID           int        `json:"id"`
	Code         string     `json:"code"`
	NameID       string     `json:"name_id"`
	NameEN       string     `json:"name_en"`
	ProductType  string     `json:"product_type"`
	TotalCards   int        `json:"total_cards"`
	ReleasedAt   string     `json:"released_at"`
	PackImageURL string     `json:"pack_image_url"`
	SetSymbolURL string     `json:"set_symbol_url"`
	SeriesID     int        `json:"series_id"`
	Series       SeriesData `json:"series"`
}

type SeriesData struct {
	NameEN string `json:"name_en"`
	NameID string `json:"name_id"`
}

type CardData struct {
	ID              int             `json:"id"`
	Category        string          `json:"category"`
	NameID          string          `json:"name_id"`
	NameEN          string          `json:"name_en"`
	ExpansionCode   string          `json:"expansion_code"`
	CollectorNumber string          `json:"collector_number"`
	RegulationMark  string          `json:"regulation_mark"`
	Rarity          string          `json:"rarity"`
	Illustrator     string          `json:"illustrator"`
	ImageURL        string          `json:"image_url"`
	HP              *int            `json:"hp"`
	CardType        *string         `json:"card_type"`
	EvolutionStage  *string         `json:"evolution_stage"`
	EvolvesFrom     *string         `json:"evolves_from"`
	RetreatCost     *int            `json:"retreat_cost"`
	Attacks         json.RawMessage `json:"attacks"`
	Abilities       json.RawMessage `json:"abilities"`
	Weakness        json.RawMessage `json:"weakness"`
	Resistance      json.RawMessage `json:"resistance"`
	Pokedex         json.RawMessage `json:"pokedex"`
	Details         CardDetails     `json:"details"`
}

type CardDetails struct {
	HP             *int            `json:"hp"`
	CardType       *string         `json:"card_type"`
	EvolutionStage  *string         `json:"evolution_stage"`
	EvolvesFrom     *string         `json:"evolves_from"`
	RetreatCost     *int            `json:"retreat_cost"`
	Attacks         json.RawMessage `json:"attacks"`
	Abilities       json.RawMessage `json:"abilities"`
	Weakness        json.RawMessage `json:"weakness"`
	Resistance      json.RawMessage `json:"resistance"`
	Pokedex         json.RawMessage `json:"pokedex"`
}

// LimitlessTCG structures
type LimitlessData struct {
	Decks     int                   `json:"decks"`
	Decklists int                   `json:"decklists"`
	Results   []LimitlessDeckResult `json:"results"`
}

type LimitlessDeckResult struct {
	DeckID    string              `json:"deck_id"`
	DeckName  string              `json:"deck_name"`
	DeckURL   string              `json:"deck_url"`
	Decklists []LimitlessDecklist `json:"decklists"`
}

type LimitlessDecklist struct {
	ListID     string              `json:"list_id"`
	Cards      LimitlessCards      `json:"cards"`
	Tournament LimitlessTournament `json:"tournament"`
	Player     LimitlessPlayer     `json:"player"`
}

type LimitlessCards struct {
	Pokemon []LimitlessCardItem `json:"pokemon"`
	Trainer []LimitlessCardItem `json:"trainer"`
	Energy  []LimitlessCardItem `json:"energy"`
}

type LimitlessCardItem struct {
	Count    int     `json:"count"`
	Name     string  `json:"name"`
	PriceUSD float64 `json:"price_usd"`
}

type LimitlessTournament struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Date    string `json:"date"`
	Format  string `json:"format"`
	Country string `json:"country"`
}

type LimitlessPlayer struct {
	Name    string `json:"name"`
	Country string `json:"country"`
	Place   string `json:"place"`
}

// Cardtell structures
type CardtellBatch struct {
	Batch      int               `json:"batch"`
	StartIndex int               `json:"start_index"`
	Count      int               `json:"count"`
	Results    []CardtellProduct `json:"results"`
}

type CardtellProduct struct {
	Name        string   `json:"name"`
	Prices      []string `json:"prices"`
	CardtellURL string   `json:"cardtell_url"`
	Set         string   `json:"set"`
}

func main() {
	dataDir := "../data"
	if len(os.Args) > 1 {
		dataDir = os.Args[1]
	}

	dbPath := "pokemon_tcg.db"
	if len(os.Args) > 2 {
		dbPath = os.Args[2]
	}

	log.Printf("Creating database: %s", dbPath)

	// Open database
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		log.Fatalf("Failed to open database: %v", err)
	}
	defer db.Close()

	// Enable foreign keys
	if _, err := db.Exec("PRAGMA foreign_keys = ON"); err != nil {
		log.Fatalf("Failed to enable foreign keys: %v", err)
	}

	// Create schema
	log.Println("Creating schema...")
	if err := createSchema(db); err != nil {
		log.Fatalf("Failed to create schema: %v", err)
	}

	// Import expansions and cards
	cardDataPath := filepath.Join(dataDir, "data_card_indo", "all_data.json")
	if _, err := os.Stat(cardDataPath); err == nil {
		log.Println("Importing cards and expansions...")
		if err := importCardsAndExpansions(db, cardDataPath); err != nil {
			log.Printf("Warning: Failed to import cards: %v", err)
		}
	} else {
		log.Printf("Card data not found at %s", cardDataPath)
	}

	// Import decks and tournaments
	deckDataPath := filepath.Join(dataDir, "data_deck_limitlesstcg", "limitlesstcg_complete_all.json")
	if _, err := os.Stat(deckDataPath); err == nil {
		log.Println("Importing decks and tournaments...")
		if err := importDecksAndTournaments(db, deckDataPath); err != nil {
			log.Printf("Warning: Failed to import decks: %v", err)
		}
	} else {
		log.Printf("Deck data not found at %s", deckDataPath)
	}

	// Import Cardtell prices
	cardtellDir := filepath.Join(dataDir, "price_indo_cardtell")
	if _, err := os.Stat(cardtellDir); err == nil {
		log.Println("Importing Cardtell prices...")
		if err := importCardtellPrices(db, cardtellDir); err != nil {
			log.Printf("Warning: Failed to import Cardtell prices: %v", err)
		}
	}

	// Import PriceCharting prices
	pricechartingDir := filepath.Join(dataDir, "pricecharting")
	if _, err := os.Stat(pricechartingDir); err == nil {
		log.Println("Importing PriceCharting prices...")
		if err := importPriceChartingPrices(db, pricechartingDir); err != nil {
			log.Printf("Warning: Failed to import PriceCharting prices: %v", err)
		}
	}

	// Verify import
	verifyImport(db)

	log.Println("\nImport completed successfully!")
	log.Printf("Database saved to: %s", dbPath)
}

func createSchema(db *sql.DB) error {
	schema := `
CREATE TABLE IF NOT EXISTS expansions (
    id INTEGER PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name_id TEXT NOT NULL,
    name_en TEXT NOT NULL,
    series_id INTEGER,
    series_name_en TEXT,
    series_name_id TEXT,
    product_type TEXT,
    total_cards INTEGER DEFAULT 0,
    released_at DATE,
    pack_image_url TEXT,
    set_symbol_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cards (
    id TEXT PRIMARY KEY,
    external_id INTEGER,
    name_id TEXT NOT NULL,
    name_en TEXT NOT NULL,
    category TEXT NOT NULL,
    expansion_code TEXT REFERENCES expansions(code),
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

CREATE TABLE IF NOT EXISTS card_prices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    source TEXT NOT NULL,
    price_idr DECIMAL(15,2),
    price_usd DECIMAL(15,2),
    currency TEXT,
    condition TEXT DEFAULT 'NM',
    url TEXT,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS decks (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    external_id TEXT,
    name TEXT NOT NULL,
    archetype TEXT,
    description TEXT,
    format TEXT DEFAULT 'Standard',
    category TEXT,
    tournament_count INTEGER DEFAULT 0,
    win_count INTEGER DEFAULT 0,
    top8_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tournaments (
    id TEXT PRIMARY KEY,
    external_id TEXT,
    name TEXT NOT NULL,
    date DATE,
    format TEXT,
    location TEXT,
    player_count INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cards_expansion ON cards(expansion_code);
CREATE INDEX IF NOT EXISTS idx_cards_name ON cards(name_id);
CREATE INDEX IF NOT EXISTS idx_cards_category ON cards(category);
CREATE INDEX IF NOT EXISTS idx_cards_hp ON cards(hp);
CREATE INDEX IF NOT EXISTS idx_cards_type ON cards(card_type);
CREATE INDEX IF NOT EXISTS idx_card_prices_card ON card_prices(card_id);
CREATE INDEX IF NOT EXISTS idx_card_prices_source ON card_prices(source);
`
	_, err := db.Exec(schema)
	return err
}

func importCardsAndExpansions(db *sql.DB, path string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}

	var allData AllData
	if err := json.Unmarshal(data, &allData); err != nil {
		return err
	}

	log.Printf("Found %d expansions with %d total cards", allData.ExpansionsCount, allData.TotalCards)

	expansionStmt, err := db.Prepare(`
		INSERT INTO expansions (id, code, name_id, name_en, series_id, series_name_en, series_name_id, 
			product_type, total_cards, released_at, pack_image_url, set_symbol_url, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(code) DO UPDATE SET
			name_id = excluded.name_id,
			name_en = excluded.name_en,
			total_cards = excluded.total_cards,
			pack_image_url = excluded.pack_image_url,
			set_symbol_url = excluded.set_symbol_url
	`)
	if err != nil {
		return err
	}
	defer expansionStmt.Close()

	cardStmt, err := db.Prepare(`
		INSERT INTO cards (id, external_id, name_id, name_en, category, expansion_code, collector_number,
			regulation_mark, rarity, illustrator, image_url, hp, card_type, evolution_stage, 
			evolves_from, retreat_cost, attacks, abilities, weakness, resistance, pokedex, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			name_id = excluded.name_id,
			name_en = excluded.name_en,
			image_url = excluded.image_url,
			updated_at = CURRENT_TIMESTAMP
	`)
	if err != nil {
		return err
	}
	defer cardStmt.Close()

	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	expansionTx := tx.Stmt(expansionStmt)
	cardTx := tx.Stmt(cardStmt)

	cardCount := 0
	for _, expWithCards := range allData.Data {
		exp := expWithCards.Expansion

		// Parse date
		releasedAt, _ := time.Parse("2006-01-02", exp.ReleasedAt)

		_, err := expansionTx.Exec(exp.ID, exp.Code, exp.NameID, exp.NameEN, exp.SeriesID,
			exp.Series.NameEN, exp.Series.NameID, exp.ProductType, exp.TotalCards, releasedAt,
			exp.PackImageURL, exp.SetSymbolURL, time.Now())
		if err != nil {
			log.Printf("Warning: Failed to insert expansion %s: %v", exp.Code, err)
		}

		for _, card := range expWithCards.Cards {
			collectorNum := strings.ReplaceAll(card.CollectorNumber, "/", "-")
			cardID := fmt.Sprintf("%s-%s-%s", exp.Code, collectorNum, slugify(card.NameID))
			if len(cardID) > 100 {
				cardID = fmt.Sprintf("%s-%s", exp.Code, collectorNum)
			}

			if card.HP == nil {
				card.HP = card.Details.HP
			}
			if card.CardType == nil {
				card.CardType = card.Details.CardType
			}
			if card.EvolutionStage == nil {
				card.EvolutionStage = card.Details.EvolutionStage
			}
			if card.EvolvesFrom == nil {
				card.EvolvesFrom = card.Details.EvolvesFrom
			}
			if card.RetreatCost == nil {
				card.RetreatCost = card.Details.RetreatCost
			}

			attacksJSON := preferRawJSON(card.Attacks, card.Details.Attacks)
			abilitiesJSON := preferRawJSON(card.Abilities, card.Details.Abilities)
			weaknessJSON := preferRawJSON(card.Weakness, card.Details.Weakness)
			resistanceJSON := preferRawJSON(card.Resistance, card.Details.Resistance)
			pokedexJSON := preferRawJSON(card.Pokedex, card.Details.Pokedex)

			_, err := cardTx.Exec(cardID, card.ID, card.NameID, card.NameEN, card.Category,
				card.ExpansionCode, card.CollectorNumber, card.RegulationMark, card.Rarity,
				card.Illustrator, card.ImageURL, card.HP, card.CardType, card.EvolutionStage,
				card.EvolvesFrom, card.RetreatCost, attacksJSON, abilitiesJSON, weaknessJSON,
				resistanceJSON, pokedexJSON, time.Now(), time.Now())

			if err != nil {
				log.Printf("Warning: Failed to insert card %s: %v", cardID, err)
			} else {
				cardCount++
			}
		}
	}

	if err := tx.Commit(); err != nil {
		return err
	}

	log.Printf("Imported %d expansions and %d cards", allData.ExpansionsCount, cardCount)
	return nil
}

func preferRawJSON(primary, fallback json.RawMessage) string {
	if len(primary) > 0 && string(primary) != "null" {
		return string(primary)
	}
	if len(fallback) > 0 && string(fallback) != "null" {
		return string(fallback)
	}
	return ""
}

func importDecksAndTournaments(db *sql.DB, path string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}

	var limitlessData LimitlessData
	if err := json.Unmarshal(data, &limitlessData); err != nil {
		return err
	}

	log.Printf("Found %d decks and %d decklists", limitlessData.Decks, limitlessData.Decklists)

	tournamentStmt, err := db.Prepare(`
		INSERT INTO tournaments (id, external_id, name, date, format, location, player_count, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO NOTHING
	`)
	if err != nil {
		return err
	}
	defer tournamentStmt.Close()

	deckStmt, err := db.Prepare(`
		INSERT INTO decks (id, external_id, name, description, format, category, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO NOTHING
	`)
	if err != nil {
		return err
	}
	defer deckStmt.Close()

	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	tournamentTx := tx.Stmt(tournamentStmt)
	deckTx := tx.Stmt(deckStmt)

	// Track unique tournaments and decks
	tournamentMap := make(map[string]bool)
	deckMap := make(map[string]bool)

	for _, result := range limitlessData.Results {
		// Insert deck
		if !deckMap[result.DeckID] {
			_, err := deckTx.Exec(result.DeckID, result.DeckID, result.DeckName, "", "Standard", "", time.Now(), time.Now())
			if err != nil {
				log.Printf("Warning: Failed to insert deck %s: %v", result.DeckID, err)
			}
			deckMap[result.DeckID] = true
		}

		// Insert tournaments and decklists
		for _, dl := range result.Decklists {
			t := dl.Tournament
			if !tournamentMap[t.ID] {
				date, _ := time.Parse("2006-01-02", t.Date)
				_, err := tournamentTx.Exec(t.ID, t.ID, t.Name, date, t.Format, t.Country, 0, time.Now())
				if err != nil {
					log.Printf("Warning: Failed to insert tournament %s: %v", t.ID, err)
				}
				tournamentMap[t.ID] = true
			}
		}
	}

	if err := tx.Commit(); err != nil {
		return err
	}

	log.Printf("Imported %d unique tournaments and %d unique decks", len(tournamentMap), len(deckMap))
	return nil
}

func importCardtellPrices(db *sql.DB, dir string) error {
	files, err := os.ReadDir(dir)
	if err != nil {
		return err
	}

	stmt, err := db.Prepare(`
		INSERT INTO card_prices (card_id, source, price_idr, currency, condition, url, last_updated, created_at)
		VALUES (?, 'Cardtell', ?, 'IDR', 'NM', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	totalImported := 0
	priceRegex := regexp.MustCompile(`[0-9,]+`)

	for _, file := range files {
		if !strings.HasSuffix(file.Name(), ".json") {
			continue
		}

		path := filepath.Join(dir, file.Name())
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}

		var batch CardtellBatch
		if err := json.Unmarshal(data, &batch); err != nil {
			continue
		}

		tx, err := db.Begin()
		if err != nil {
			continue
		}

		stmtTx := tx.Stmt(stmt)
		for _, p := range batch.Results {
			// Find matching card by name
			cardID := findCardByName(db, p.Name)
			if cardID == "" {
				continue
			}

			// Parse first price
			if len(p.Prices) > 0 {
				priceStr := priceRegex.FindString(p.Prices[0])
				priceStr = strings.ReplaceAll(priceStr, ",", "")
				var price float64
				fmt.Sscanf(priceStr, "%f", &price)

				if price > 0 {
					_, err := stmtTx.Exec(cardID, price, p.CardtellURL)
					if err == nil {
						totalImported++
					}
				}
			}
		}
		tx.Commit()
	}

	log.Printf("Imported %d Cardtell prices", totalImported)
	return nil
}

func importPriceChartingPrices(db *sql.DB, dir string) error {
	files, err := os.ReadDir(dir)
	if err != nil {
		return err
	}

	stmt, err := db.Prepare(`
		INSERT INTO card_prices (card_id, source, price_usd, currency, condition, last_updated, created_at)
		VALUES (?, 'PriceCharting', ?, 'USD', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	totalImported := 0
	for _, file := range files {
		if !strings.HasSuffix(file.Name(), ".json") {
			continue
		}

		path := filepath.Join(dir, file.Name())
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}

		var cards []struct {
			Name  string  `json:"name"`
			Price float64 `json:"price"`
			PSA7  float64 `json:"psa_7"`
			PSA8  float64 `json:"psa_8"`
			PSA9  float64 `json:"psa_9"`
			PSA10 float64 `json:"psa_10"`
		}
		if err := json.Unmarshal(data, &cards); err != nil {
			continue
		}

		tx, err := db.Begin()
		if err != nil {
			continue
		}

		stmtTx := tx.Stmt(stmt)
		for _, c := range cards {
			cardID := findCardByName(db, c.Name)
			if cardID == "" {
				continue
			}

			if c.Price > 0 {
				_, err := stmtTx.Exec(cardID, c.Price, "NM")
				if err == nil {
					totalImported++
				}
			}
			if c.PSA7 > 0 {
				stmtTx.Exec(cardID, c.PSA7, "PSA7")
			}
			if c.PSA8 > 0 {
				stmtTx.Exec(cardID, c.PSA8, "PSA8")
			}
			if c.PSA9 > 0 {
				stmtTx.Exec(cardID, c.PSA9, "PSA9")
			}
			if c.PSA10 > 0 {
				stmtTx.Exec(cardID, c.PSA10, "PSA10")
			}
		}
		tx.Commit()
	}

	log.Printf("Imported %d PriceCharting prices", totalImported)
	return nil
}

func findCardByName(db *sql.DB, name string) string {
	var cardID string
	name = strings.ToLower(strings.TrimSpace(name))

	// Try exact match
	err := db.QueryRow("SELECT id FROM cards WHERE LOWER(name_id) = ? OR LOWER(name_en) = ? LIMIT 1", name, name).Scan(&cardID)
	if err == nil {
		return cardID
	}

	// Try partial match
	err = db.QueryRow("SELECT id FROM cards WHERE LOWER(name_id) LIKE ? OR LOWER(name_en) LIKE ? LIMIT 1", "%"+name+"%", "%"+name+"%").Scan(&cardID)
	if err == nil {
		return cardID
	}

	return ""
}

func slugify(name string) string {
	name = strings.ToLower(name)
	name = strings.ReplaceAll(name, " ", "_")
	name = strings.ReplaceAll(name, "'", "")
	name = strings.ReplaceAll(name, ".", "")
	name = strings.ReplaceAll(name, ",", "")
	name = strings.ReplaceAll(name, "(", "")
	name = strings.ReplaceAll(name, ")", "")
	name = strings.ReplaceAll(name, "&", "and")
	if len(name) > 50 {
		name = name[:50]
	}
	return name
}

func verifyImport(db *sql.DB) {
	log.Println("\n--- Import Summary ---")

	var count int
	if err := db.QueryRow("SELECT COUNT(*) FROM expansions").Scan(&count); err == nil {
		log.Printf("Expansions: %d", count)
	}
	if err := db.QueryRow("SELECT COUNT(*) FROM cards").Scan(&count); err == nil {
		log.Printf("Cards: %d", count)
	}
	if err := db.QueryRow("SELECT COUNT(*) FROM tournaments").Scan(&count); err == nil {
		log.Printf("Tournaments: %d", count)
	}
	if err := db.QueryRow("SELECT COUNT(*) FROM decks").Scan(&count); err == nil {
		log.Printf("Decks: %d", count)
	}
	if err := db.QueryRow("SELECT COUNT(*) FROM card_prices").Scan(&count); err == nil {
		log.Printf("Prices: %d", count)
	}

	// Check price distribution
	var idrCount, usdCount int
	db.QueryRow("SELECT COUNT(*) FROM card_prices WHERE price_idr IS NOT NULL").Scan(&idrCount)
	db.QueryRow("SELECT COUNT(*) FROM card_prices WHERE price_usd IS NOT NULL").Scan(&usdCount)
	log.Printf("  - IDR prices: %d", idrCount)
	log.Printf("  - USD prices: %d", usdCount)
}
