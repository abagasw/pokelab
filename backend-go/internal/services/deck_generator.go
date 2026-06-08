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

type DeckGenerator struct {
	db *sql.DB
}

func NewDeckGenerator(db *sql.DB) *DeckGenerator {
	return &DeckGenerator{db: db}
}

type GeneratedDeck struct {
	Name             string               `json:"name"`
	Description      string               `json:"description"`
	Archetype        string               `json:"archetype"`
	CompletenessPct  float64              `json:"completeness_pct"`
	OwnedCards       int                  `json:"owned_cards"`
	TotalCards       int                  `json:"total_cards"`
	MissingCards     []models.MissingCard `json:"missing_cards"`
	EstimatedCostIDR float64              `json:"estimated_cost_idr"`
	Strengths        []string             `json:"strengths"`
	Weaknesses       []string             `json:"weaknesses"`
	SynergyScore     float64              `json:"synergy_score"`
	MetaScore        float64              `json:"meta_score"`
	UniqueScore      float64              `json:"unique_score"`
	Cards            []GeneratedDeckCard  `json:"cards"`
	SourceEngine     string               `json:"source_engine"`
	SourcePokemon    string               `json:"source_pokemon"`
}

type GeneratedDeckCard struct {
	CardID   string  `json:"card_id"`
	CardName string  `json:"card_name"`
	Category string  `json:"category"`
	CardType string  `json:"card_type"`
	ImageURL string  `json:"image_url"`
	Count    int     `json:"count"`
	Owned    int     `json:"owned"`
	IsOwned  bool    `json:"is_owned"`
	PriceIDR float64 `json:"price_idr"`
	Source   string  `json:"source"`
	Ability  string  `json:"ability,omitempty"`
}

type corePokemonData struct {
	Name           string
	Quantity       int
	CardType       string
	EnergyTypes    []string
	EvolutionStage string
	EvolvesFrom    string
	HP             int
	Ability        string
	ImageURL       string
	CardID         string
	Priority       int
}

type engineData struct {
	DeckID     string
	DeckName   string
	Archetype  string
	TourneyCnt int
	Trainers   []trainerEntry
	Energies   []energyEntry
	Pokemon    []pokemonEntry
	CardTypes  []string
}

type trainerEntry struct {
	Name    string
	Count   int
	ImageURL string
	Category string
}

type energyEntry struct {
	Name     string
	Count    int
	ImageURL string
	CardType string
}

type pokemonEntry struct {
	Name     string
	Count    int
	ImageURL string
	CardType string
	Stage    string
	EvoFrom  string
}

var energyTypeMap = map[string]string{
	"Fire": "%Api%", "Water": "%Air%", "Grass": "%Daun%",
	"Lightning": "%Listrik%", "Psychic": "%Psikis%",
	"Darkness": "%Kegelapan%", "Metal": "%Baja%",
}

// GenerateDecks creates competitive hybrid decks from inventory + tournament data.
func (g *DeckGenerator) GenerateDecks(ctx context.Context, collectionID string) ([]GeneratedDeck, error) {
	inventory, err := g.loadInventory(ctx, collectionID)
	if err != nil || len(inventory) == 0 {
		return []GeneratedDeck{}, nil
	}

	cores := g.findCorePokemon(ctx, inventory)
	if len(cores) == 0 {
		return []GeneratedDeck{}, nil
	}

	var results []GeneratedDeck
	seen := map[string]bool{}

	for _, core := range cores {
		if seen[core.Name] {
			continue
		}
		seen[core.Name] = true

		// Find BEST tournament deck matching core's energy type
		engine := g.findBestEngine(ctx, core.EnergyTypes)
		if engine == nil {
			continue
		}

		deck := g.buildCompetitiveDeck(ctx, core, engine, inventory)
		if deck.TotalCards != 60 {
			// Try to trim or pad to exactly 60
			deck = g.normalizeTo60(deck)
		}
		if deck.TotalCards != 60 {
			continue
		}

		deck.CompletenessPct = math.Round(float64(deck.OwnedCards)/float64(deck.TotalCards)*1000) / 10
		deck.SynergyScore = calcSynergy(deck.Cards)
		deck.MetaScore = math.Min(1.0, float64(engine.TourneyCnt)/5.0)
		deck.UniqueScore = math.Round((deck.CompletenessPct*0.40+deck.SynergyScore*100*0.30+deck.MetaScore*100*0.30)*100) / 100

		deck.MissingCards = buildMissing(deck.Cards)
		cost := 0.0
		for _, mc := range deck.MissingCards {
			cost += mc.TotalEstimatedIDR
		}
		deck.EstimatedCostIDR = cost

		deck.Description = fmt.Sprintf("Hybrid: %s (%s) + %s trainer package. %d/%d kartu dimiliki (%.0f%%).",
			core.Name, strings.Join(core.EnergyTypes, "/"), engine.Archetype,
			deck.OwnedCards, deck.TotalCards, deck.CompletenessPct)

		deck.Strengths = []string{
			fmt.Sprintf("Core: %dx %s + full evolution line", core.Quantity, core.Name),
			fmt.Sprintf("Trainers: %s package dari %s", engine.Archetype, engine.DeckName),
			fmt.Sprintf("Energy: %s", strings.Join(core.EnergyTypes, "/")),
		}
		deck.Weaknesses = []string{"Hybrid deck — perlu testing di tournament"}
		deck.SourceEngine = engine.Archetype + " Trainers"
		deck.SourcePokemon = core.Name

		results = append(results, deck)
		if len(results) >= 10 {
			break
		}
	}

	sort.SliceStable(results, func(i, j int) bool {
		return results[i].UniqueScore > results[j].UniqueScore
	})
	return results, nil
}

// findBestEngine finds the best tournament deck matching energy type
// and extracts its FULL trainer + energy package
func (g *DeckGenerator) findBestEngine(ctx context.Context, energyTypes []string) *engineData {
	// Build name_id patterns for energy matching
	var patterns []string
	for _, et := range energyTypes {
		if p, ok := energyTypeMap[et]; ok {
			patterns = append(patterns, p)
		}
	}
	if len(patterns) == 0 {
		patterns = []string{"%"}
	}

	// Find decks that use matching energy cards
	rows, err := g.db.QueryContext(ctx, `
		SELECT d.id, d.name, COALESCE(d.archetype,''), COALESCE(d.tournament_count,0)
		FROM decks d
		JOIN deck_cards dc ON d.id = dc.deck_id
		JOIN cards c ON dc.card_id = c.id
		WHERE d.user_id IS NULL AND c.category = 'Energy' AND c.name_id LIKE ?
		GROUP BY d.id
		ORDER BY d.tournament_count DESC, d.win_count DESC
		LIMIT 5
	`, patterns[0])
	if err != nil {
		return nil
	}

	type ref struct{ id, name, arch string; cnt int }
	var refs []ref
	for rows.Next() {
		var d ref
		if rows.Scan(&d.id, &d.name, &d.arch, &d.cnt) == nil {
			refs = append(refs, d)
		}
	}
	rows.Close()

	for _, r := range refs {
		eng := g.loadEngineFromDeck(ctx, r.id, r.name, r.arch, r.cnt)
		if eng != nil && len(eng.Trainers) >= 6 {
			return eng
		}
	}

	// Fallback: best deck overall
	rows2, _ := g.db.QueryContext(ctx, `
		SELECT id, name, COALESCE(archetype,''), COALESCE(tournament_count,0)
		FROM decks WHERE user_id IS NULL
		ORDER BY tournament_count DESC LIMIT 1
	`)
	if rows2 != nil {
		defer rows2.Close()
		if rows2.Next() {
			var d ref
			if rows2.Scan(&d.id, &d.name, &d.arch, &d.cnt) == nil {
				return g.loadEngineFromDeck(ctx, d.id, d.name, d.arch, d.cnt)
			}
		}
	}
	return nil
}

func (g *DeckGenerator) loadEngineFromDeck(ctx context.Context, deckID, deckName, archetype string, tourneyCnt int) *engineData {
	rows, err := g.db.QueryContext(ctx, `
		SELECT c.name_id, c.category, COALESCE(c.card_type,''), COALESCE(c.image_url,''),
		       dc.count, dc.is_pokemon,
		       COALESCE(c.evolution_stage,''), COALESCE(c.evolves_from,'')
		FROM deck_cards dc
		JOIN cards c ON dc.card_id = c.id
		WHERE dc.deck_id = ?
	`, deckID)
	if err != nil {
		return nil
	}
	defer rows.Close()

	eng := &engineData{
		DeckID:     deckID,
		DeckName:   deckName,
		Archetype:  archetype,
		TourneyCnt: tourneyCnt,
	}
	etypes := map[string]int{}

	for rows.Next() {
		var name, cat, ct, url, stage, evoFrom string
		var count int
		var isPokemon bool
		if rows.Scan(&name, &cat, &ct, &url, &count, &isPokemon, &stage, &evoFrom) != nil {
			continue
		}
		switch cat {
		case "Trainer":
			eng.Trainers = append(eng.Trainers, trainerEntry{Name: name, Count: count, ImageURL: url, Category: cat})
		case "Energy":
			eng.Energies = append(eng.Energies, energyEntry{Name: name, Count: count, ImageURL: url, CardType: ct})
			etypes[ct] += count
		case "Pokemon":
			if isPokemon {
				eng.Pokemon = append(eng.Pokemon, pokemonEntry{Name: name, Count: count, ImageURL: url, CardType: ct, Stage: stage, EvoFrom: evoFrom})
			}
		}
	}

	for t := range etypes {
		eng.CardTypes = append(eng.CardTypes, t)
	}
	return eng
}

func (g *DeckGenerator) buildCompetitiveDeck(ctx context.Context, core corePokemonData, engine *engineData, inventory map[string]int) GeneratedDeck {
	deck := GeneratedDeck{Cards: []GeneratedDeckCard{}}
	names := map[string]int{}
	owned, total := 0, 0

	// 1. Core Pokemon + evolution line (target: 12-18 Pokemon copies)
	evoLine := g.buildEvolutionLine(ctx, core, inventory)
	for _, c := range evoLine {
		names[c.CardName] += c.Count
		deck.Cards = append(deck.Cards, c)
		owned += c.Owned
		total += c.Count
	}

	// 2. Support Pokemon from engine deck (use engine's Pokemon as reference)
	// Add Pokemon from the tournament deck that match core's type
	for _, ep := range engine.Pokemon {
		if total >= 52 || len(names) >= 10 {
			break
		}
		if names[ep.Name] > 0 {
			continue
		}
		// Only add if same type as core
		if !strings.EqualFold(ep.CardType, core.CardType) && ep.CardType != "Colorless" {
			continue
		}
		qty := ep.Count
		if qty > 4 {
			qty = 4
		}
		invQty := inventory[ep.Name]
		actOwned := qty
		if invQty < qty {
			actOwned = invQty
		}

		names[ep.Name] += qty
		deck.Cards = append(deck.Cards, GeneratedDeckCard{
			CardName: ep.Name, Category: "Pokemon", CardType: ep.CardType, ImageURL: ep.ImageURL,
			Count: qty, Owned: actOwned, IsOwned: actOwned >= qty, Source: "engine",
		})
		owned += actOwned
		total += qty
	}

	// 3. Trainers from engine (exact package from tournament deck)
	for _, t := range engine.Trainers {
		if total >= 60 {
			break
		}
		qty := t.Count
		if qty > 4 {
			qty = 4
		}
		invQty := inventory[t.Name]
		actOwned := qty
		if invQty < qty {
			actOwned = invQty
		}

		names[t.Name] += qty
		deck.Cards = append(deck.Cards, GeneratedDeckCard{
			CardName: t.Name, Category: "Trainer", ImageURL: t.ImageURL,
			Count: qty, Owned: actOwned, IsOwned: actOwned >= qty, Source: "engine",
		})
		owned += actOwned
		total += qty
	}

	// 4. Energy from engine
	for _, e := range engine.Energies {
		if total >= 60 {
			break
		}
		qty := e.Count
		invQty := inventory[e.Name]
		actOwned := qty
		if invQty < qty {
			actOwned = invQty
		}

		names[e.Name] += qty
		deck.Cards = append(deck.Cards, GeneratedDeckCard{
			CardName: e.Name, Category: "Energy", CardType: e.CardType, ImageURL: e.ImageURL,
			Count: qty, Owned: actOwned, IsOwned: actOwned >= qty, Source: "engine",
		})
		owned += actOwned
		total += qty
	}

	// 5. Fill remaining to exactly 60 with owned trainers from inventory
	for name, invQty := range inventory {
		if total >= 60 {
			break
		}
		if names[name] > 0 || invQty < 2 {
			continue
		}
		var cat string
		err := g.db.QueryRowContext(ctx, `SELECT COALESCE(category,'') FROM cards WHERE name_id = ? LIMIT 1`, name).Scan(&cat)
		if err != nil || (cat != "Trainer" && cat != "Energy") {
			continue
		}
		qty := invQty
		if qty > 4 {
			qty = 4
		}
		// Don't exceed 60
		if total+qty > 60 {
			qty = 60 - total
		}
		if qty <= 0 {
			continue
		}
		var url string
		g.db.QueryRowContext(ctx, `SELECT COALESCE(image_url,'') FROM cards WHERE name_id = ? ORDER BY id DESC LIMIT 1`, name).Scan(&url)

		names[name] += qty
		deck.Cards = append(deck.Cards, GeneratedDeckCard{
			CardName: name, Category: cat, ImageURL: url,
			Count: qty, Owned: qty, IsOwned: true, Source: "inventory",
		})
		owned += qty
		total += qty
	}

	// 6. If still under 60, add basic energy
	if total < 60 {
		need := 60 - total
		for _, et := range core.EnergyTypes {
			if total >= 60 {
				break
			}
			pat := energyTypeMap[et]
			if pat == "" {
				pat = "%" + et + "%"
			}
			var eid, ename, eurl string
			err := g.db.QueryRowContext(ctx, `
				SELECT name_id, id, COALESCE(image_url,'')
				FROM cards WHERE category = 'Energy' AND name_id LIKE ?
				ORDER BY id DESC LIMIT 1
			`, pat).Scan(&ename, &eid, &eurl)
			if err != nil {
				continue
			}
			invQty := inventory[ename]
			act := need
			if invQty < need {
				act = invQty
			}
			if act > 0 && names[ename] == 0 {
				names[ename] += act
				deck.Cards = append(deck.Cards, GeneratedDeckCard{
					CardID: eid, CardName: ename, Category: "Energy", CardType: et,
					ImageURL: eurl, Count: act, Owned: act, IsOwned: act >= act, Source: "engine",
				})
				owned += act
				total += act
			}
		}
	}

	deck.OwnedCards = owned
	deck.TotalCards = total
	return deck
}

// normalizeTo60 trims or pads deck to exactly 60 cards
func (g *DeckGenerator) normalizeTo60(deck GeneratedDeck) GeneratedDeck {
	if deck.TotalCards == 60 {
		return deck
	}

	if deck.TotalCards > 60 {
		// Trim from the end (fill cards first)
		excess := deck.TotalCards - 60
		for i := len(deck.Cards) - 1; i >= 0 && excess > 0; i-- {
			c := &deck.Cards[i]
			if c.Source == "inventory" {
				if c.Count <= excess {
					excess -= c.Count
					deck.OwnedCards -= c.Owned
					deck.TotalCards -= c.Count
					deck.Cards = append(deck.Cards[:i], deck.Cards[i+1:]...)
				} else {
					c.Count -= excess
					if c.Owned > c.Count {
						c.Owned = c.Count
					}
					deck.TotalCards -= excess
					deck.OwnedCards -= excess
					excess = 0
				}
			}
		}
	}

	return deck
}

func (g *DeckGenerator) findCorePokemon(ctx context.Context, inventory map[string]int) []corePokemonData {
	var cores []corePokemonData
	for name, qty := range inventory {
		if qty < 2 {
			continue
		}
		var c corePokemonData
		var abilities, attacks sql.NullString
		err := g.db.QueryRowContext(ctx, `
			SELECT id, name_id, COALESCE(card_type,''), COALESCE(evolution_stage,''),
			       COALESCE(evolves_from,''), COALESCE(hp,0), COALESCE(image_url,''),
			       abilities, attacks
			FROM cards WHERE name_id = ? AND category = 'Pokemon' AND regulation_mark IN ('H','I','J')
			ORDER BY id DESC LIMIT 1
		`, name).Scan(&c.CardID, &c.Name, &c.CardType, &c.EvolutionStage,
			&c.EvolvesFrom, &c.HP, &c.ImageURL, &abilities, &attacks)
		if err != nil {
			continue
		}
		nameLC := strings.ToLower(name)
		isCore := strings.Contains(nameLC, " ex") || strings.Contains(nameLC, "mega ") ||
			strings.Contains(nameLC, " v") || c.HP >= 130
		if !isCore {
			continue
		}
		priority := 0
		if strings.Contains(nameLC, " ex") || strings.Contains(nameLC, "mega ") {
			priority = 3
		} else if c.HP >= 200 {
			priority = 2
		} else if c.EvolutionStage == "Stage 2" {
			priority = 1
		}
		c.EnergyTypes = extractEnergyTypes(attacks.String)
		if len(c.EnergyTypes) == 0 {
			c.EnergyTypes = []string{c.CardType}
		}
		c.Ability = extractAbilityName(abilities.String)
		c.Quantity = qty
		c.Priority = priority
		cores = append(cores, c)
	}
	sort.SliceStable(cores, func(i, j int) bool {
		if cores[i].Priority != cores[j].Priority {
			return cores[i].Priority > cores[j].Priority
		}
		return cores[i].Quantity > cores[j].Quantity
	})
	// Filter: skip non-EX if EX version exists
	exNames := map[string]bool{}
	for _, c := range cores {
		if strings.Contains(strings.ToLower(c.Name), " ex") {
			base := strings.Replace(strings.ToLower(c.Name), " ex", "", 1)
			exNames[base] = true
		}
	}
	var filtered []corePokemonData
	for _, c := range cores {
		nameLC := strings.ToLower(c.Name)
		isEX := strings.Contains(nameLC, " ex") || strings.Contains(nameLC, "mega ") || strings.Contains(nameLC, " v")
		if !isEX && exNames[nameLC] {
			continue
		}
		filtered = append(filtered, c)
	}
	cores = filtered
	if len(cores) > 8 {
		cores = cores[:8]
	}
	return cores
}

func (g *DeckGenerator) buildEvolutionLine(ctx context.Context, core corePokemonData, inventory map[string]int) []GeneratedDeckCard {
	var line []GeneratedDeckCard
	owned := inventory[core.Name]
	qty := core.Quantity
	if qty > 4 {
		qty = 4
	}
	if owned > 0 && owned < qty {
		qty = owned
	}
	if qty > 0 {
		line = append(line, GeneratedDeckCard{
			CardID: core.CardID, CardName: core.Name, Category: "Pokemon",
			CardType: core.CardType, ImageURL: core.ImageURL,
			Count: qty, Owned: owned, IsOwned: true, Source: "core", Ability: core.Ability,
		})
	}
	current := core.EvolvesFrom
	for current != "" {
		var eID, eName, eStage, eEF, eType, eURL string
		err := g.db.QueryRowContext(ctx, `
			SELECT id, name_id, COALESCE(evolution_stage,''), COALESCE(evolves_from,''),
			       COALESCE(card_type,''), COALESCE(image_url,'')
			FROM cards WHERE name_id = ? AND category = 'Pokemon' AND regulation_mark IN ('H','I','J')
			ORDER BY id DESC LIMIT 1
		`, current).Scan(&eID, &eName, &eStage, &eEF, &eType, &eURL)
		if err != nil {
			break
		}
		evoOwned := inventory[eName]
		evoQty := 4
		if eStage == "Stage 2" {
			evoQty = 2
		}
		if evoOwned > 0 && evoOwned < evoQty {
			evoQty = evoOwned
		}
		if evoQty > 0 {
			line = append(line, GeneratedDeckCard{
				CardID: eID, CardName: eName, Category: "Pokemon",
				CardType: eType, ImageURL: eURL,
				Count: evoQty, Owned: evoOwned, IsOwned: evoOwned >= evoQty, Source: "evolution",
			})
		}
		current = eEF
	}
	return line
}

func calcSynergy(cards []GeneratedDeckCard) float64 {
	tc := map[string]int{}
	for _, c := range cards {
		if c.Category == "Pokemon" {
			tc[c.CardType] += c.Count
		}
	}
	max := 0
	for _, cnt := range tc {
		if cnt > max {
			max = cnt
		}
	}
	pt := 0
	for _, c := range cards {
		if c.Category == "Pokemon" {
			pt += c.Count
		}
	}
	if pt == 0 {
		return 0
	}
	return math.Round(float64(max)/float64(pt)*100) / 100
}

func buildMissing(cards []GeneratedDeckCard) []models.MissingCard {
	var m []models.MissingCard
	for _, c := range cards {
		if c.IsOwned || c.Owned >= c.Count {
			continue
		}
		m = append(m, models.MissingCard{
			CardID: c.CardID, CardName: c.CardName, Category: c.Category,
			RequiredCount: c.Count, OwnedCount: c.Owned, MissingCount: c.Count - c.Owned,
			BuyPriority: "Medium",
		})
	}
	return m
}

func (g *DeckGenerator) loadInventory(ctx context.Context, collectionID string) (map[string]int, error) {
	rows, err := g.db.QueryContext(ctx, `
		SELECT c.name_id, COALESCE(SUM(ci.quantity), 0)
		FROM collection_items ci JOIN cards c ON ci.card_id = c.id
		WHERE ci.collection_id = ? GROUP BY c.name_id
	`, collectionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	inv := map[string]int{}
	for rows.Next() {
		var name string
		var qty int
		if rows.Scan(&name, &qty) == nil {
			inv[name] = qty
		}
	}
	return inv, nil
}

func extractEnergyTypes(ajson string) []string {
	if ajson == "" || ajson == "[]" {
		return nil
	}
	var a []struct{ EC []string `json:"energy_cost"` }
	json.Unmarshal([]byte(ajson), &a)
	cm := map[string]int{}
	for _, x := range a {
		for _, e := range x.EC {
			if e != "Colorless" {
				cm[e]++
			}
		}
	}
	var t []string
	for k := range cm {
		t = append(t, k)
	}
	sort.Strings(t)
	return t
}

func extractAbilityName(ajson string) string {
	if ajson == "" || ajson == "[]" {
		return ""
	}
	var a []struct{ N string `json:"name"` }
	json.Unmarshal([]byte(ajson), &a)
	if len(a) > 0 {
		return a[0].N
	}
	return ""
}
