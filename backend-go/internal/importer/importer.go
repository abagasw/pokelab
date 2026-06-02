package importer

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"pokemon-tcg-indonesia/internal/database"
	"strings"
	"time"
)

// Importer handles importing data from JSON files
type Importer struct {
	db *database.DB
}

// NewImporter creates a new Importer
func NewImporter(db *database.DB) *Importer {
	return &Importer{db: db}
}

// ImportAll imports all data from JSON files
func (i *Importer) ImportAll(dataDir string) error {
	fmt.Println("Starting data import...")
	
	// Import expansions first
	if err := i.ImportExpansions(filepath.Join(dataDir, "all_data.json")); err != nil {
		fmt.Printf("Warning: Failed to import expansions: %v\n", err)
	}
	
	// Import cards
	if err := i.ImportCards(filepath.Join(dataDir, "all_data.json")); err != nil {
		fmt.Printf("Warning: Failed to import cards: %v\n", err)
	}
	
	// Import Cardtell prices
	if err := i.ImportCardtellPrices(filepath.Join(dataDir, "cardtell_parsed.json")); err != nil {
		fmt.Printf("Warning: Failed to import Cardtell prices: %v\n", err)
	}
	
	// Import PriceCharting prices
	if err := i.ImportPriceChartingPrices(filepath.Join(dataDir, "pricecharting")); err != nil {
		fmt.Printf("Warning: Failed to import PriceCharting prices: %v\n", err)
	}
	
	// Import decks and tournaments
	if err := i.ImportDecks(filepath.Join(dataDir, "limitlesstcg_complete.json")); err != nil {
		fmt.Printf("Warning: Failed to import decks: %v\n", err)
	}
	
	fmt.Println("Data import completed!")
	return nil
}

// ImportExpansions imports expansions from all_data.json
func (i *Importer) ImportExpansions(path string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	
	var expansions []map[string]interface{}
	if err := json.Unmarshal(data, &expansions); err != nil {
		// Try single object format
		var exp map[string]interface{}
		if err := json.Unmarshal(data, &exp); err != nil {
			return err
		}
		expansions = []map[string]interface{}{exp}
	}
	
	count := 0
	for _, exp := range expansions {
		code := getString(exp, "code")
		if code == "" {
			continue
		}
		
		query := `INSERT INTO expansions (code, name_id, name_en, series, total_cards)
			  VALUES (?, ?, ?, ?, ?)
			  ON CONFLICT(code) DO UPDATE SET
				  name_id = excluded.name_id,
				  name_en = excluded.name_en`
		
		_, err := i.db.Exec(query, code,
			getString(exp, "name_id"),
			getString(exp, "name_en"),
			getString(exp, "series"),
			getInt(exp, "total_cards"))
		
		if err == nil {
			count++
		}
	}
	
	fmt.Printf("Imported %d expansions\n", count)
	return nil
}

// ImportCards imports cards from all_data.json
func (i *Importer) ImportCards(path string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	
	var expansions []map[string]interface{}
	if err := json.Unmarshal(data, &expansions); err != nil {
		return err
	}
	
	count := 0
	for _, exp := range expansions {
		expCode := getString(exp, "code")
		if expCode == "" {
			continue
		}
		
		cards, ok := exp["cards"].([]interface{})
		if !ok {
			continue
		}
		
		for _, c := range cards {
			card, ok := c.(map[string]interface{})
			if !ok {
				continue
			}
			
			cardID := generateCardID(expCode, getString(card, "number"), getString(card, "name"))
			
			// Insert card
			query := `INSERT INTO cards (id, name_id, name_en, expansion_code, collector_number,
					  regulation_mark, rarity, category, hp, card_type, image_url)
				  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				  ON CONFLICT(id) DO UPDATE SET
					  name_id = excluded.name_id,
					  name_en = excluded.name_en,
					  updated_at = CURRENT_TIMESTAMP`
			
			// Prefer values from nested details if present
		details := getMap(card, "details")
		hp := getInt(card, "hp")
		cardType := getString(card, "type")
		if details != nil {
			if hp == 0 {
				hp = getInt(details, "hp")
			}
			if cardType == "" {
				cardType = getString(details, "card_type")
			}
		}

		_, err := i.db.Exec(query,
				cardID,
				getString(card, "name"),
				getString(card, "name_en"),
				expCode,
				getString(card, "number"),
				getString(card, "regulation_mark"),
				getString(card, "rarity"),
				getString(card, "category"),
				hp,
				cardType,
				getString(card, "image_url"))
			
			if err != nil {
				continue
			}
			
			// Insert attacks (check top-level then details)
			attacks := getSliceEither(card, "attacks")
			if attacks != nil {
				for _, a := range attacks {
					attack, ok := a.(map[string]interface{})
					if !ok {
						continue
					}
					energyCost, _ := json.Marshal(attack["energy_cost"])
					_, _ = i.db.Exec(`INSERT INTO card_attacks (card_id, name, damage, description, energy_cost)
						VALUES (?, ?, ?, ?, ?)`,
						cardID,
						getString(attack, "name"),
						getString(attack, "damage"),
						getString(attack, "description"),
						string(energyCost))
				}
			}
			
			// Insert abilities (check top-level then details)
			abilities := getSliceEither(card, "abilities")
			if abilities != nil {
				for _, a := range abilities {
					ability, ok := a.(map[string]interface{})
					if !ok {
						continue
					}
					_, _ = i.db.Exec(`INSERT INTO card_abilities (card_id, name, description, ability_type)
						VALUES (?, ?, ?, ?)`,
						cardID,
						getString(ability, "name"),
						getString(ability, "description"),
						getString(ability, "type"))
				}
			}
			
			count++
		}
	}
	
	fmt.Printf("Imported %d cards\n", count)
	return nil
}

// ImportCardtellPrices imports prices from cardtell_parsed.json
func (i *Importer) ImportCardtellPrices(path string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	
	var products []map[string]interface{}
	if err := json.Unmarshal(data, &products); err != nil {
		return err
	}
	
	count := 0
	for _, p := range products {
		// Try to find matching card by name
		cardID := i.findCardByName(getString(p, "name"))
		if cardID == "" {
			continue
		}
		
		price := getFloat64(p, "price")
		if price == 0 {
			continue
		}
		
		query := `INSERT INTO prices (card_id, currency, price, condition, source, url, scraped_at)
			  VALUES (?, 'IDR', ?, 'NM', 'Cardtell', ?, ?)
			  ON CONFLICT(card_id, currency, condition) DO UPDATE SET
				  price = excluded.price,
				  url = excluded.url,
				  scraped_at = excluded.scraped_at`
		
		_, err := i.db.Exec(query, cardID, price, getString(p, "url"), time.Now())
		if err == nil {
			count++
		}
	}
	
	fmt.Printf("Imported %d Cardtell prices\n", count)
	return nil
}

// ImportPriceChartingPrices imports prices from PriceCharting JSON files
func (i *Importer) ImportPriceChartingPrices(dir string) error {
	files, err := os.ReadDir(dir)
	if err != nil {
		return err
	}
	
	count := 0
	for _, file := range files {
		if !strings.HasSuffix(file.Name(), ".json") {
			continue
		}
		
		path := filepath.Join(dir, file.Name())
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		
		var cards []map[string]interface{}
		if err := json.Unmarshal(data, &cards); err != nil {
			continue
		}
		
		for _, c := range cards {
			// Try to find matching card
			cardID := i.findCardByName(getString(c, "name"))
			if cardID == "" {
				continue
			}
			
			// Insert ungraded price
			if price := getFloat64(c, "price"); price > 0 {
				_, _ = i.db.Exec(`INSERT INTO prices (card_id, currency, price, condition, source, scraped_at)
					VALUES (?, 'USD', ?, 'NM', 'PriceCharting', ?)
					ON CONFLICT(card_id, currency, condition) DO UPDATE SET
						price = excluded.price,
						scraped_at = excluded.scraped_at`,
					cardID, price, time.Now())
				count++
			}
			
			// Insert PSA grades
			for _, grade := range []string{"psa_7", "psa_8", "psa_9", "psa_10"} {
				if price := getFloat64(c, grade); price > 0 {
					condition := strings.ToUpper(strings.Replace(grade, "_", "", 1))
					_, _ = i.db.Exec(`INSERT INTO prices (card_id, currency, price, condition, source, scraped_at)
						VALUES (?, 'USD', ?, ?, 'PriceCharting', ?)
						ON CONFLICT(card_id, currency, condition) DO UPDATE SET
							price = excluded.price,
							scraped_at = excluded.scraped_at`,
						cardID, price, condition, time.Now())
				}
			}
		}
	}
	
	fmt.Printf("Imported %d PriceCharting prices\n", count)
	return nil
}

// ImportDecks imports decks and tournaments from LimitlessTCG data
func (i *Importer) ImportDecks(path string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	
	var limitlessData map[string]interface{}
	if err := json.Unmarshal(data, &limitlessData); err != nil {
		return err
	}
	
	// Import decks
	if decks, ok := limitlessData["decks"].([]interface{}); ok {
		for _, d := range decks {
			deck, ok := d.(map[string]interface{})
			if !ok {
				continue
			}
			
			query := `INSERT INTO decks (id, name, archetype, format, description, win_rate, popularity)
				  VALUES (?, ?, ?, 'Standard', ?, ?, ?)
				  ON CONFLICT(id) DO UPDATE SET
					  win_rate = excluded.win_rate,
					  popularity = excluded.popularity`
			
			_, _ = i.db.Exec(query,
				getString(deck, "id"),
				getString(deck, "name"),
				getString(deck, "archetype"),
				getString(deck, "description"),
				getFloat64(deck, "win_rate"),
				getFloat64(deck, "popularity"))
		}
		fmt.Printf("Imported %d decks\n", len(decks))
	}
	
	// Import tournaments
	if tournaments, ok := limitlessData["tournaments"].([]interface{}); ok {
		for _, t := range tournaments {
			tournament, ok := t.(map[string]interface{})
			if !ok {
				continue
			}
			
			query := `INSERT INTO tournaments (id, name, date, format, location, player_count)
				  VALUES (?, ?, ?, 'Standard', ?, ?)
				  ON CONFLICT(id) DO NOTHING`
			
			_, _ = i.db.Exec(query,
				getString(tournament, "id"),
				getString(tournament, "name"),
				getString(tournament, "date"),
				getString(tournament, "location"),
				getInt(tournament, "player_count"))
		}
		fmt.Printf("Imported %d tournaments\n", len(tournaments))
	}
	
	return nil
}

// Helper functions

func (i *Importer) findCardByName(name string) string {
	// Normalize name for matching
	name = strings.ToLower(strings.TrimSpace(name))
	
	// Query to find card by name
	var cardID string
	query := `SELECT id FROM cards WHERE LOWER(name_id) = ? OR LOWER(name_en) = ? LIMIT 1`
	err := i.db.QueryRow(query, name, name).Scan(&cardID)
	if err == nil {
		return cardID
	}
	
	// Try partial match
	query = `SELECT id FROM cards WHERE LOWER(name_id) LIKE ? OR LOWER(name_en) LIKE ? LIMIT 1`
	err = i.db.QueryRow(query, "%"+name+"%", "%"+name+"%").Scan(&cardID)
	if err == nil {
		return cardID
	}
	
	return ""
}

func generateCardID(expCode, number, name string) string {
	name = strings.ToLower(strings.ReplaceAll(name, " ", "_"))
	name = strings.ReplaceAll(name, "'", "")
	name = strings.ReplaceAll(name, ".", "")
	return fmt.Sprintf("%s-%s-%s", expCode, number, name)
}

func getString(m map[string]interface{}, key string) string {
	if v, ok := m[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

func getInt(m map[string]interface{}, key string) int {
	if v, ok := m[key]; ok {
		switch i := v.(type) {
		case int:
			return i
		case float64:
			return int(i)
		case string:
			// Try to parse
			var n int
			fmt.Sscanf(i, "%d", &n)
			return n
		}
	}
	return 0
}

func getFloat64(m map[string]interface{}, key string) float64 {
	if v, ok := m[key]; ok {
		switch f := v.(type) {
		case float64:
			return f
		case int:
			return float64(f)
		case string:
			// Try to parse, handling IDR format
			var n float64
			s := strings.ReplaceAll(f, ",", "")
			s = strings.ReplaceAll(s, "Rp", "")
			s = strings.TrimSpace(s)
			fmt.Sscanf(s, "%f", &n)
			return n
		}
	}
	return 0
}

func getMap(m map[string]interface{}, key string) map[string]interface{} {
	if v, ok := m[key]; ok {
		if mm, ok := v.(map[string]interface{}); ok {
			return mm
		}
	}
	return nil
}

// getSliceEither returns a slice value for key either from the top-level map
// or from nested "details" map if top-level missing.
func getSliceEither(m map[string]interface{}, key string) []interface{} {
	if v, ok := m[key]; ok {
		if s, ok := v.([]interface{}); ok {
			return s
		}
	}
	if details := getMap(m, "details"); details != nil {
		if v, ok := details[key]; ok {
			if s, ok := v.([]interface{}); ok {
				return s
			}
		}
	}
	return nil
}
