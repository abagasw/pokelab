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

// BuildAroundRequest asks the builder to construct a legal 60-card deck
// centered on one specific engine card (e.g. Mew ex "Spiral Ingatan").
type BuildAroundRequest struct {
	CardID       string `json:"card_id"`
	CollectionID string `json:"collection_id,omitempty"`
}

// EngineAnalysis explains WHY the deck was built the way it was.
type EngineAnalysis struct {
	Pattern       string   `json:"pattern"`
	PatternLabel  string   `json:"pattern_label"`
	AbilityText   string   `json:"ability_text,omitempty"`
	AttackSummary []string `json:"attack_summary,omitempty"`
	EnergyPlan    string   `json:"energy_plan"`
	LegalPool     string   `json:"legal_pool"`
	Reasoning     []string `json:"reasoning"`
}

// BuildAroundResponse is the full generated deck + explainability.
type BuildAroundResponse struct {
	Deck    GeneratedDeck `json:"deck"`
	Engine  EngineAnalysis `json:"engine_analysis"`
	Success bool           `json:"success"`
}

// engineCard is the full parsed engine card.
type engineCard struct {
	ID          string
	Name        string
	Category    string
	CardType    string
	Stage       string
	EvolvesFrom string
	HP          int
	RegMark     string
	ImageURL    string
	Attacks     []attackData
	Abilities   []abilityData
}

type attackData struct {
	Name        string   `json:"name"`
	Damage      string   `json:"damage"`
	Description string   `json:"description"`
	EnergyCost  []string `json:"energy_cost"`
}

type abilityData struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

type candidatePokemon struct {
	engineCard
	Cooccur       int
	PatternScore  int
	Reasons       []string
}

// enginePattern describes the detected synergy archetype of the engine card.
type enginePattern struct {
	Key   string
	Label string
}

var patternDefs = []struct {
	key    string
	label  string
	match  func(c *engineCard) bool
}{
	{
		key:   "bench_attacker",
		label: "Bench Attacker Engine (ability memakai serangan Pokémon Cadangan)",
		match: func(c *engineCard) bool {
			for _, ab := range c.Abilities {
				t := strings.ToLower(ab.Description)
				if strings.Contains(t, "cadangan") && strings.Contains(t, "serangan") {
					return true
				}
			}
			return false
		},
	},
	{
		key:   "energy_stacker",
		label: "Energy Stacking Engine (scale dengan jumlah Energi)",
		match: func(c *engineCard) bool {
			for _, ab := range c.Abilities {
				t := strings.ToLower(ab.Description)
				if (strings.Contains(t, "energi") && strings.Contains(t, "bertambah")) ||
					(strings.Contains(t, "energi") && strings.Contains(t, "lebih")) {
					return true
				}
			}
			return false
		},
	},
	{
		key:   "damage_counter",
		label: "Damage Counter Engine (manipulasi Token Kerusakan)",
		match: func(c *engineCard) bool {
			for _, ab := range append(c.Abilities, abilityData{}) {
				if ab.Description == "" {
					continue
				}
				t := strings.ToLower(ab.Description)
				if strings.Contains(t, "token kerusakan") {
					return true
				}
			}
			for _, atk := range c.Attacks {
				t := strings.ToLower(atk.Description)
				if strings.Contains(t, "token kerusakan") {
					return true
				}
			}
			return false
		},
	},
	{
		key:   "punish_engine",
		label: "Punish Engine (balas KO saat kalah)",
		match: func(c *engineCard) bool {
			for _, ab := range c.Abilities {
				t := strings.ToLower(ab.Description)
				if strings.Contains(t, "ko") && (strings.Contains(t, "melempar koin") || strings.Contains(t, "sisi depan")) {
					return true
				}
			}
			return false
		},
	},
	{
		key:   "draw_engine",
		label: "Draw Engine (mengambil kartu tambahan)",
		match: func(c *engineCard) bool {
			for _, atk := range c.Attacks {
				t := strings.ToLower(atk.Name + " " + atk.Description)
				if strings.Contains(t, "ambil") && strings.Contains(t, "kartu") {
					return true
				}
			}
			for _, ab := range c.Abilities {
				t := strings.ToLower(ab.Name + " " + ab.Description)
				if strings.Contains(t, "ambil") && strings.Contains(t, "kartu") {
					return true
				}
			}
			return false
		},
	},
	{
		key:   "mega_engine",
		label: "Mega Evolution Engine",
		match: func(c *engineCard) bool {
			n := strings.ToLower(c.Name)
			return strings.Contains(n, "mega ")
		},
	},
	{
		key:   "big_hitter",
		label: "Big Hitter Engine (attacker utama berdamage besar)",
		match: func(c *engineCard) bool { return true }, // fallback
	},
}

// BuildDeckAroundCard builds a legal 60-card deck centered on one engine card
// using co-occurrence data from 4.5k+ real decklists + ability/attack synergy
// matching over the cards table. Fully deterministic (no AI call).
func (g *DeckGenerator) BuildDeckAroundCard(ctx context.Context, req BuildAroundRequest) (*BuildAroundResponse, error) {
	engine, err := g.loadEngineCard(ctx, req.CardID)
	if err != nil {
		return nil, fmt.Errorf("engine card tidak ditemukan: %w", err)
	}
	if engine.Category != "Pokemon" {
		return nil, fmt.Errorf("kartu %s bukan Pokemon — engine deck hanya mendukung Pokemon", engine.Name)
	}

	pattern := detectPattern(engine)

	// inventory ownership (optional)
	inventory := map[string]int{}
	if req.CollectionID != "" {
		inventory, _ = g.loadInventory(ctx, req.CollectionID)
	}

	deck := GeneratedDeck{
		Cards:        []GeneratedDeckCard{},
		SourceEngine: pattern.Label,
		SourcePokemon: engine.Name,
	}
	names := map[string]int{}
	owned, total := 0, 0

	addCard := func(c GeneratedDeckCard) {
		if names[c.CardName]+c.Count > 4 && c.Category != "Energy" {
			c.Count = 4 - names[c.CardName]
			if c.Count <= 0 {
				return
			}
		}
		names[c.CardName] += c.Count
		deck.Cards = append(deck.Cards, c)
		owned += c.Owned
		total += c.Count
	}

	// ---- 1. Engine line (engine card + pre-evolutions + Mega evolution) ----
	engineQty := 3
	if engine.Stage == "Basic" {
		engineQty = 4
	}
	invQty := inventory[engine.Name]
	own := invQty
	if own > engineQty {
		own = engineQty
	}
	addCard(GeneratedDeckCard{
		CardID: engine.ID, CardName: engine.Name, Category: "Pokemon",
		CardType: engine.CardType, ImageURL: engine.ImageURL,
		Count: engineQty, Owned: own, IsOwned: own >= engineQty, Source: "engine-core",
		Ability: firstAbilityName(engine),
	})

	// pre-evolution chain
	current := engine.EvolvesFrom
	for current != "" && total < 20 {
		var pre engineCard
		var evoOK bool
		pre, evoOK = g.loadCardByName(ctx, current)
		if !evoOK {
			break
		}
		preQty := 3
		if engine.Stage == "Stage 2" {
			preQty = 2
		}
		pOwn := inventory[pre.Name]
		if pOwn > preQty {
			pOwn = preQty
		}
		addCard(GeneratedDeckCard{
			CardID: pre.ID, CardName: pre.Name, Category: "Pokemon",
			CardType: pre.CardType, ImageURL: pre.ImageURL,
			Count: preQty, Owned: pOwn, IsOwned: pOwn >= preQty, Source: "evolution",
		})
		current = pre.EvolvesFrom
	}

	// Forward evolution: if the user picked a Basic, its evolution is the real
	// engine (e.g. Exeggcute -> Alolan Exeggutor "Scale Up").
	if engine.Stage == "Basic" && names[engine.Name] > 0 {
		if fwd, ok := g.findForwardEvolution(ctx, engine.Name); ok && names[fwd.Name] == 0 && total < 24 {
			fQty := 3
			fOwn := inventory[fwd.Name]
			if fOwn > fQty {
				fOwn = fQty
			}
			addCard(GeneratedDeckCard{
				CardID: fwd.ID, CardName: fwd.Name, Category: "Pokemon",
				CardType: fwd.CardType, ImageURL: fwd.ImageURL,
				Count: fQty, Owned: fOwn, IsOwned: fOwn >= fQty, Source: "forward-evolution",
				Ability: firstAbilityName(fwd),
			})
			// The forward evolution may itself have a Mega form (Gengar ex line).
			if mega2, ok := g.findMegaEvolution(ctx, fwd.Name); ok && names[mega2.Name] == 0 && total < 26 {
				mOwn := inventory[mega2.Name]
				if mOwn > 2 {
					mOwn = 2
				}
				addCard(GeneratedDeckCard{
					CardID: mega2.ID, CardName: mega2.Name, Category: "Pokemon",
					CardType: mega2.CardType, ImageURL: mega2.ImageURL,
					Count: 2, Owned: mOwn, IsOwned: mOwn >= 2, Source: "mega-evolution",
					Ability: firstAbilityName(mega2),
				})
			}
		}
	}

	// Mega evolution forward (Gengar ex -> Mega Gengar ex)
	if mega, ok := g.findMegaEvolution(ctx, engine.Name); ok && total < 24 {
		mOwn := inventory[mega.Name]
		if mOwn > 2 {
			mOwn = 2
		}
		addCard(GeneratedDeckCard{
			CardID: mega.ID, CardName: mega.Name, Category: "Pokemon",
			CardType: mega.CardType, ImageURL: mega.ImageURL,
			Count: 2, Owned: mOwn, IsOwned: mOwn >= 2, Source: "mega-evolution",
			Ability: firstAbilityName(mega),
		})
	}

	// ---- 2. Synergy partners (co-occurrence + pattern scoring) ----
	partners := g.findSynergyPartners(ctx, engine, pattern)
	for _, p := range partners {
		if total >= 34 {
			break
		}
		qty := 2
		if p.Cooccur > 60 {
			qty = 3
		}
		if p.Stage != "Basic" {
			qty = 2
		}
		pOwn := inventory[p.Name]
		if pOwn > qty {
			pOwn = qty
		}
		source := "synergy"
		if p.Cooccur > 0 {
			source = fmt.Sprintf("co-occurrence ×%d", p.Cooccur)
		}
		addCard(GeneratedDeckCard{
			CardID: p.ID, CardName: p.Name, Category: "Pokemon",
			CardType: p.CardType, ImageURL: p.ImageURL,
			Count: qty, Owned: pOwn, IsOwned: pOwn >= qty, Source: source,
			Ability: firstAbilityName(&p.engineCard),
		})
		// partner evolution line (skip if any printing already in deck)
		if p.Stage != "Basic" && p.EvolvesFrom != "" && names[p.EvolvesFrom] == 0 {
			if pre, ok := g.loadCardByName(ctx, p.EvolvesFrom); ok {
				preQty := 2
				preOwn := inventory[pre.Name]
				if preOwn > preQty {
					preOwn = preQty
				}
				addCard(GeneratedDeckCard{
					CardID: pre.ID, CardName: pre.Name, Category: "Pokemon",
					CardType: pre.CardType, ImageURL: pre.ImageURL,
					Count: preQty, Owned: preOwn, IsOwned: preOwn >= preQty, Source: "evolution",
				})
			}
		}
	}

	// ---- 3. Trainer core (co-occurring first, then global staples) ----
	trainers := g.findTrainerCore(ctx, engine)
	for _, t := range trainers {
		if total >= 52 { // reserve 8 slots for energy
			break
		}
		qty := t.Count
		if qty > 4 {
			qty = 4
		}
		if qty < 1 {
			qty = 1
		}
		tOwn := inventory[t.Name]
		if tOwn > qty {
			tOwn = qty
		}
		source := "staple"
		if t.Cooccur > 0 {
			source = fmt.Sprintf("co-occurrence ×%d", t.Cooccur)
		}
		addCard(GeneratedDeckCard{
			CardID: t.ID, CardName: t.Name, Category: "Trainer",
			ImageURL: t.ImageURL, Count: qty, Owned: tOwn, IsOwned: tOwn >= qty, Source: source,
		})
	}

	// ---- 4. Energy plan from attack costs ----
	energyType, energyCount := planEnergy(engine, partners)
	if energyType == "" {
		energyType = engine.CardType
	}
	energyCount = 60 - total
	if energyCount > 16 {
		energyCount = 16
	}
	if energyCount < 6 {
		energyCount = 6
	}
	if eID, eName, eURL, ok := g.findBasicEnergy(ctx, energyType); ok {
		eOwn := inventory[eName]
		if eOwn > energyCount {
			eOwn = energyCount
		}
		deck.Cards = append(deck.Cards, GeneratedDeckCard{
			CardID: eID, CardName: eName, Category: "Energy", CardType: energyType,
			ImageURL: eURL, Count: energyCount, Owned: eOwn, IsOwned: eOwn >= energyCount,
			Source: fmt.Sprintf("energy plan (%s)", energyType),
		})
		names[eName] += energyCount
		owned += eOwn
		total += energyCount
	}

	// ---- 5. Pad to exactly 60 with global staples ----
	if total < 60 {
		pads := g.findGlobalTrainerStaples(ctx, names)
		for _, t := range pads {
			if total >= 60 {
				break
			}
			qty := 4
			if total+qty > 60 {
				qty = 60 - total
			}
			if qty <= 0 {
				break
			}
			tOwn := inventory[t.Name]
			if tOwn > qty {
				tOwn = qty
			}
			names[t.Name] += qty
			deck.Cards = append(deck.Cards, GeneratedDeckCard{
				CardID: t.ID, CardName: t.Name, Category: "Trainer",
				ImageURL: t.ImageURL, Count: qty, Owned: tOwn, IsOwned: tOwn >= qty,
				Source: "meta staple (fill)",
			})
			owned += tOwn
			total += qty
		}
	}

	// Merge duplicate card-name entries (multi-printing) so the decklist is clean.
	merged := make([]GeneratedDeckCard, 0, len(deck.Cards))
	byName := map[string]int{}
	for _, c := range deck.Cards {
		if c.Category == "Energy" {
			merged = append(merged, c)
			continue
		}
		if idx, ok := byName[c.CardName]; ok {
			m := &merged[idx]
			m.Count += c.Count
			m.Owned += c.Owned
			if m.ImageURL == "" {
				m.ImageURL = c.ImageURL
			}
		} else {
			byName[c.CardName] = len(merged)
			merged = append(merged, c)
		}
	}
	deck.Cards = merged

	deck.OwnedCards = owned
	deck.TotalCards = total
	deck.CompletenessPct = 0
	if total > 0 {
		deck.CompletenessPct = math.Round(float64(owned)/float64(total)*1000) / 10
	}
	deck.SynergyScore = calcSynergy(deck.Cards)
	deck.MetaScore = math.Min(1.0, float64(len(partners)+len(trainers))/14.0)
	deck.UniqueScore = math.Round((deck.CompletenessPct*0.4+deck.SynergyScore*100*0.3+deck.MetaScore*100*0.3)*100) / 100
	deck.MissingCards = buildMissing(deck.Cards)
	cost := 0.0
	for _, mc := range deck.MissingCards {
		cost += mc.TotalEstimatedIDR
	}
	deck.EstimatedCostIDR = cost
	deck.Name = fmt.Sprintf("%s Engine", engine.Name)
	deck.Archetype = pattern.Label
	deck.Description = fmt.Sprintf(
		"Deck 60-kartu dibangun di sekitar %s (%s). Pattern: %s. Partner dipilih dari co-occurrence %d decklist turnamen + kecocokan ability/serangan.",
		engine.Name, engine.ID, pattern.Label, g.countDecksWithCard(ctx, engine.Name),
	)
	deck.Strengths = []string{
		fmt.Sprintf("Engine: %dx %s (%s)", engineQty, engine.Name, firstAbilityName(engine)),
		fmt.Sprintf("Pattern terdeteksi: %s", pattern.Label),
		fmt.Sprintf("Partner synergy: %d kandidat dinilai", len(partners)),
	}
	deck.Weaknesses = []string{"Rogue build — validasi dengan playtest sebelum turnamen"}

	analysis := EngineAnalysis{
		Pattern:       pattern.Key,
		PatternLabel:  pattern.Label,
		AbilityText:   firstAbilityText(engine),
		EnergyPlan:    fmt.Sprintf("%s ×%d (dari biaya serangan engine + partner)", energyType, energyCount),
		LegalPool:     fmt.Sprintf("Regulation %s (H/I/J pool)", engine.RegMark),
		AttackSummary: attackSummaries(engine),
		Reasoning:     buildReasoning(engine, pattern, partners, trainers),
	}

	return &BuildAroundResponse{Deck: deck, Engine: analysis, Success: total == 60}, nil
}

// ---- helpers -------------------------------------------------------------

func (g *DeckGenerator) loadEngineCard(ctx context.Context, cardID string) (*engineCard, error) {
	var c engineCard
	var attacks, abilities sql.NullString
	err := g.db.QueryRowContext(ctx, `
		SELECT id, COALESCE(name_id,''), COALESCE(category,''), COALESCE(card_type,''),
		       COALESCE(evolution_stage,''), COALESCE(evolves_from,''), COALESCE(hp,0),
		       COALESCE(regulation_mark,''), COALESCE(image_url,''), attacks, abilities
		FROM cards WHERE id = ? LIMIT 1
	`, cardID).Scan(&c.ID, &c.Name, &c.Category, &c.CardType, &c.Stage, &c.EvolvesFrom,
		&c.HP, &c.RegMark, &c.ImageURL, &attacks, &abilities)
	if err != nil {
		return nil, err
	}
	json.Unmarshal([]byte(attacks.String), &c.Attacks)
	json.Unmarshal([]byte(abilities.String), &c.Abilities)
	return &c, nil
}

func (g *DeckGenerator) loadCardByName(ctx context.Context, name string) (engineCard, bool) {
	var c engineCard
	var attacks, abilities sql.NullString
	err := g.db.QueryRowContext(ctx, `
		SELECT id, COALESCE(name_id,''), COALESCE(category,''), COALESCE(card_type,''),
		       COALESCE(evolution_stage,''), COALESCE(evolves_from,''), COALESCE(hp,0),
		       COALESCE(regulation_mark,''), COALESCE(image_url,''), attacks, abilities
		FROM cards WHERE name_id = ? AND category = 'Pokemon'
		ORDER BY CASE WHEN regulation_mark IN ('H','I','J') THEN 0 ELSE 1 END, CAST(id AS INTEGER) DESC
		LIMIT 1
	`, name).Scan(&c.ID, &c.Name, &c.Category, &c.CardType, &c.Stage, &c.EvolvesFrom,
		&c.HP, &c.RegMark, &c.ImageURL, &attacks, &abilities)
	if err != nil {
		return c, false
	}
	json.Unmarshal([]byte(attacks.String), &c.Attacks)
	json.Unmarshal([]byte(abilities.String), &c.Abilities)
	return c, true
}

// findForwardEvolution finds the strongest card that evolves from baseName
// (prefers evolutions with abilities, then highest HP, latest regulation).
func (g *DeckGenerator) findForwardEvolution(ctx context.Context, baseName string) (*engineCard, bool) {
	var c engineCard
	var attacks, abilities sql.NullString
	err := g.db.QueryRowContext(ctx, `
		SELECT id, COALESCE(name_id,''), COALESCE(category,''), COALESCE(card_type,''),
		       COALESCE(evolution_stage,''), COALESCE(evolves_from,''), COALESCE(hp,0),
		       COALESCE(regulation_mark,''), COALESCE(image_url,''), attacks, abilities
		FROM cards
		WHERE evolves_from = ? AND category = 'Pokemon'
		  AND regulation_mark IN ('H','I','J')
		ORDER BY (CASE WHEN abilities IS NOT NULL AND abilities != '[]' THEN 0 ELSE 1 END),
		         CAST(hp AS INTEGER) DESC, CAST(id AS INTEGER) DESC
		LIMIT 1
	`, baseName).Scan(&c.ID, &c.Name, &c.Category, &c.CardType, &c.Stage, &c.EvolvesFrom,
		&c.HP, &c.RegMark, &c.ImageURL, &attacks, &abilities)
	if err != nil {
		return nil, false
	}
	json.Unmarshal([]byte(attacks.String), &c.Attacks)
	json.Unmarshal([]byte(abilities.String), &c.Abilities)
	return &c, true
}

func (g *DeckGenerator) findMegaEvolution(ctx context.Context, baseName string) (*engineCard, bool) {
	var c engineCard
	var attacks, abilities sql.NullString
	err := g.db.QueryRowContext(ctx, `
		SELECT id, COALESCE(name_id,''), COALESCE(category,''), COALESCE(card_type,''),
		       COALESCE(evolution_stage,''), COALESCE(evolves_from,''), COALESCE(hp,0),
		       COALESCE(regulation_mark,''), COALESCE(image_url,''), attacks, abilities
		FROM cards
		WHERE name_id LIKE ? AND category = 'Pokemon'
		  AND (name_id LIKE 'Mega %' OR evolution_stage LIKE '%Mega%')
		  AND regulation_mark IN ('H','I','J')
		ORDER BY CAST(id AS INTEGER) DESC LIMIT 1
	`, "Mega "+strings.TrimSuffix(baseName, " ex")+"%").Scan(
		&c.ID, &c.Name, &c.Category, &c.CardType, &c.Stage, &c.EvolvesFrom,
		&c.HP, &c.RegMark, &c.ImageURL, &attacks, &abilities)
	if err != nil {
		return nil, false
	}
	json.Unmarshal([]byte(attacks.String), &c.Attacks)
	json.Unmarshal([]byte(abilities.String), &c.Abilities)
	return &c, true
}

// findSynergyPartners scores candidate Pokemon by co-occurrence with the
// engine card in real decklists, plus pattern-specific synergy matching.
func (g *DeckGenerator) findSynergyPartners(ctx context.Context, engine *engineCard, pattern enginePattern) []candidatePokemon {
	// 1) co-occurrence signal
	cooc := map[string]int{}
	rows, err := g.db.QueryContext(ctx, `
		SELECT c.name_id, SUM(dc.count)
		FROM deck_cards dc
		JOIN cards c ON dc.card_id = c.id
		WHERE c.category = 'Pokemon' AND c.name_id != ?
		  AND dc.deck_id IN (
		    SELECT dc2.deck_id FROM deck_cards dc2
		    JOIN cards c2 ON dc2.card_id = c2.id
		    WHERE c2.name_id = ?
		  )
		GROUP BY c.name_id ORDER BY 2 DESC LIMIT 25
	`, engine.Name, engine.Name)
	if err == nil {
		for rows.Next() {
			var n string
			var cnt int
			if rows.Scan(&n, &cnt) == nil {
				cooc[n] = cnt
			}
		}
		rows.Close()
	}

	// 2) pattern-based candidate query
	var candidates []candidatePokemon
	patternSQL, patternArgs := patternCandidateQuery(engine, pattern)
	qrows, err := g.db.QueryContext(ctx, patternSQL, patternArgs...)
	if err == nil {
		defer qrows.Close()
		for qrows.Next() {
			var c engineCard
			var attacks, abilities sql.NullString
			if qrows.Scan(&c.ID, &c.Name, &c.Category, &c.CardType, &c.Stage, &c.EvolvesFrom,
				&c.HP, &c.RegMark, &c.ImageURL, &attacks, &abilities) != nil {
				continue
			}
			json.Unmarshal([]byte(attacks.String), &c.Attacks)
			json.Unmarshal([]byte(abilities.String), &c.Abilities)
			cand := candidatePokemon{engineCard: c, Cooccur: cooc[c.Name]}
			cand.PatternScore = scorePatternFit(&c, engine, pattern)
			cand.Reasons = patternReasons(&c, pattern)
			candidates = append(candidates, cand)
		}
	}

	// 3) always include top co-occurrence Pokemon missing from pattern query —
	//    real tournament pairings are the strongest signal.
	seen := map[string]bool{}
	for _, c := range candidates {
		seen[c.Name] = true
	}
	var coocNames []string
	for name := range cooc {
		coocNames = append(coocNames, name)
	}
	sort.Strings(coocNames)
	type cooEntry struct {
		name string
		cnt  int
	}
	var cooList []cooEntry
	for _, n := range coocNames {
		cooList = append(cooList, cooEntry{n, cooc[n]})
	}
	sort.SliceStable(cooList, func(i, j int) bool { return cooList[i].cnt > cooList[j].cnt })
	for _, e := range cooList {
		// merge all real tournament partners (cap guards runaway growth only)
		if seen[e.name] || len(candidates) >= 80 {
			continue
		}
		if c, ok := g.loadCardByName(ctx, e.name); ok {
			cand := candidatePokemon{engineCard: c, Cooccur: e.cnt}
			cand.PatternScore = scorePatternFit(&c, engine, pattern)
			cand.Reasons = []string{fmt.Sprintf("sering main bersama engine di turnamen (×%d)", e.cnt)}
			candidates = append(candidates, cand)
			seen[e.name] = true
		}
	}

	// 4) rank: co-occurrence dominates, pattern breaks ties
	score := func(c candidatePokemon) int { return c.Cooccur*3 + c.PatternScore }
	sort.SliceStable(candidates, func(i, j int) bool {
		si, sj := score(candidates[i]), score(candidates[j])
		if si != sj {
			return si > sj
		}
		return candidates[i].HP > candidates[j].HP
	})
	// 5) dedupe by name (multiple printings) keeping the highest-ranked entry
	bestByName := map[string]candidatePokemon{}
	var order []string
	for _, c := range candidates {
		if _, exists := bestByName[c.Name]; !exists {
			bestByName[c.Name] = c
			order = append(order, c.Name)
		}
	}
	deduped := make([]candidatePokemon, 0, len(order))
	for _, n := range order {
		deduped = append(deduped, bestByName[n])
	}
	if len(deduped) > 10 {
		deduped = deduped[:10]
	}
	return deduped
}

// patternCandidateQuery returns Pokemon that fit the detected engine pattern.
func patternCandidateQuery(engine *engineCard, pattern enginePattern) (string, []interface{}) {
	base := `
		SELECT id, COALESCE(name_id,''), COALESCE(category,''), COALESCE(card_type,''),
		       COALESCE(evolution_stage,''), COALESCE(evolves_from,''), COALESCE(hp,0),
		       COALESCE(regulation_mark,''), COALESCE(image_url,''), attacks, abilities
		FROM cards
		WHERE category = 'Pokemon' AND regulation_mark IN ('H','I','J')
		  AND name_id != ? AND COALESCE(hp,0) >= 70
	`
	args := []interface{}{engine.Name}
	switch pattern.Key {
	case "bench_attacker":
		// bench attackers: big damage, low-ish cost, any type works because the
		// engine copies their attacks (energy still matters -> prefer engine type/colorless)
		base += ` AND attacks LIKE '%"damage": "%' AND hp >= 110
			  AND (COALESCE(card_type,'') = ? OR COALESCE(card_type,'') = '' OR attacks LIKE '%Colorless%')`
		args = append(args, engine.CardType)
		base += " ORDER BY CAST(hp AS INTEGER) DESC LIMIT 60"
	case "energy_stacker":
		// energy acceleration partners + high-cost attackers of same type
		base += ` AND (COALESCE(card_type,'') = ? OR abilities LIKE '%nergi%' OR attacks LIKE '%nergi%')`
		args = append(args, engine.CardType)
		base += " ORDER BY CAST(hp AS INTEGER) DESC LIMIT 60"
	case "damage_counter":
		base += ` AND (attacks LIKE '%Token Kerusakan%' OR abilities LIKE '%Token Kerusakan%'
		           OR attacks LIKE '%kerusakan sejumlah 30%' OR COALESCE(card_type,'') = ?)`
		args = append(args, engine.CardType)
		base += " ORDER BY CAST(hp AS INTEGER) DESC LIMIT 60"
	case "punish_engine":
		base += ` AND (COALESCE(card_type,'') = ? OR hp >= 250 OR abilities LIKE '%KO%')`
		args = append(args, engine.CardType)
		base += " ORDER BY CAST(hp AS INTEGER) DESC LIMIT 60"
	case "draw_engine":
		base += " ORDER BY CAST(hp AS INTEGER) DESC LIMIT 60"
	default: // big_hitter, mega_engine
		base += ` AND (COALESCE(card_type,'') = ? OR COALESCE(card_type,'') = 'Colorless' OR COALESCE(card_type,'') = '')`
		args = append(args, engine.CardType)
		base += " ORDER BY CAST(hp AS INTEGER) DESC LIMIT 60"
	}
	return base, args
}

// scorePatternFit gives a 0..10 fit score per candidate.
func scorePatternFit(c *engineCard, engine *engineCard, pattern enginePattern) int {
	score := 0
	switch pattern.Key {
	case "bench_attacker":
		for _, a := range c.Attacks {
			dmg := parseDamage(a.Damage)
			cost := len(a.EnergyCost)
			if dmg >= 180 && cost <= 3 {
				score += 5
			} else if dmg >= 120 && cost <= 3 {
				score += 3
			} else if dmg >= 100 {
				score += 1
			}
		}
	case "energy_stacker":
		for _, ab := range c.Abilities {
			t := strings.ToLower(ab.Description)
			if strings.Contains(t, "energi") && (strings.Contains(t, "tambahkan") || strings.Contains(t, "pasang")) {
				score += 5
			}
		}
	case "damage_counter":
		for _, a := range c.Attacks {
			if strings.Contains(strings.ToLower(a.Description), "token kerusakan") {
				score += 4
			}
		}
	case "punish_engine":
		if c.HP >= 250 {
			score += 3
		}
	}
	if strings.EqualFold(c.CardType, engine.CardType) {
		score += 2
	}
	if score > 10 {
		score = 10
	}
	return score
}

func patternReasons(c *engineCard, pattern enginePattern) []string {
	var reasons []string
	switch pattern.Key {
	case "bench_attacker":
		for _, a := range c.Attacks {
			dmg := parseDamage(a.Damage)
			if dmg >= 120 {
				reasons = append(reasons, fmt.Sprintf("attacker cadangan: %s (%d damage, %d energi)", a.Name, dmg, len(a.EnergyCost)))
			}
		}
	case "energy_stacker":
		for _, ab := range c.Abilities {
			if strings.Contains(strings.ToLower(ab.Description), "energi") {
				reasons = append(reasons, fmt.Sprintf("dukungan energi: %s", ab.Name))
			}
		}
	case "damage_counter":
		for _, a := range c.Attacks {
			if strings.Contains(strings.ToLower(a.Description), "token kerusakan") {
				reasons = append(reasons, fmt.Sprintf("manipulasi token: %s", a.Name))
			}
		}
	}
	if len(reasons) == 0 {
		reasons = append(reasons, "kandidat tipe sama dengan engine")
	}
	return reasons
}

type trainerPick struct {
	ID, Name, ImageURL string
	Cooccur            int
	Count              int
}

// findTrainerCore picks trainers that co-occur with the engine, then staples.
func (g *DeckGenerator) findTrainerCore(ctx context.Context, engine *engineCard) []trainerPick {
	var picks []trainerPick
	rows, err := g.db.QueryContext(ctx, `
		SELECT c.id, c.name_id, COALESCE(c.image_url,''), SUM(dc.count)
		FROM deck_cards dc
		JOIN cards c ON dc.card_id = c.id
		WHERE c.category = 'Trainer'
		  AND dc.deck_id IN (
		    SELECT dc2.deck_id FROM deck_cards dc2
		    JOIN cards c2 ON dc2.card_id = c2.id
		    WHERE c2.name_id = ?
		  )
		GROUP BY c.id, c.name_id ORDER BY 4 DESC LIMIT 14
	`, engine.Name)
	if err == nil {
		for rows.Next() {
			var p trainerPick
			if rows.Scan(&p.ID, &p.Name, &p.ImageURL, &p.Cooccur) == nil {
				if p.Cooccur > 40 {
					p.Count = 4
				} else if p.Cooccur > 15 {
					p.Count = 3
				} else {
					p.Count = 2
				}
				picks = append(picks, p)
			}
		}
		rows.Close()
	}
	if len(picks) >= 8 {
		return picks
	}
	// fallback: global staples
	g2, err := g.db.QueryContext(ctx, `
		SELECT c.id, c.name_id, COALESCE(c.image_url,''), SUM(dc.count)
		FROM deck_cards dc
		JOIN cards c ON dc.card_id = c.id
		JOIN decks d ON dc.deck_id = d.id
		WHERE c.category = 'Trainer' AND d.user_id IS NULL
		GROUP BY c.id, c.name_id ORDER BY 4 DESC LIMIT 16
	`)
	if err == nil {
		seen := map[string]bool{}
		for _, p := range picks {
			seen[p.Name] = true
		}
		for g2.Next() {
			var p trainerPick
			if g2.Scan(&p.ID, &p.Name, &p.ImageURL, &p.Cooccur) == nil {
				if seen[p.Name] {
					continue
				}
				p.Count = 2
				if p.Cooccur > 200 {
					p.Count = 4
				} else if p.Cooccur > 80 {
					p.Count = 3
				}
				picks = append(picks, p)
				seen[p.Name] = true
			}
		}
		g2.Close()
	}
	return picks
}

type staplePick struct{ ID, Name, ImageURL string }

func (g *DeckGenerator) findGlobalTrainerStaples(ctx context.Context, exclude map[string]int) []staplePick {
	var picks []staplePick
	rows, err := g.db.QueryContext(ctx, `
		SELECT c.id, c.name_id, COALESCE(c.image_url,'')
		FROM deck_cards dc
		JOIN cards c ON dc.card_id = c.id
		JOIN decks d ON dc.deck_id = d.id
		WHERE c.category = 'Trainer' AND d.user_id IS NULL
		GROUP BY c.id, c.name_id
		ORDER BY SUM(dc.count) DESC LIMIT 12
	`)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var p staplePick
			if rows.Scan(&p.ID, &p.Name, &p.ImageURL) == nil && exclude[p.Name] == 0 {
				picks = append(picks, p)
			}
		}
	}
	return picks
}

func (g *DeckGenerator) findBasicEnergy(ctx context.Context, energyType string) (string, string, string, bool) {
	var id, name, url string
	// 1) Basic energy by official Indonesian name ("Energi Dasar [Logam]" etc).
	//    NOTE: official IDN localization uses "Logam" for Metal.
	if pat := energyNamePattern(energyType); pat != "%" {
		err := g.db.QueryRowContext(ctx, `
			SELECT id, name_id, COALESCE(image_url,'')
			FROM cards WHERE category = 'Energy' AND name_id LIKE '%Energi Dasar%' AND name_id LIKE ?
			ORDER BY CAST(id AS INTEGER) DESC LIMIT 1
		`, pat).Scan(&id, &name, &url)
		if err == nil {
			return id, name, url, true
		}
	}
	// 2) Fallback: any basic energy matching the card_type column.
	if energyType != "" {
		err := g.db.QueryRowContext(ctx, `
			SELECT id, name_id, COALESCE(image_url,'')
			FROM cards WHERE category = 'Energy' AND card_type = ? AND name_id LIKE '%Energi Dasar%'
			ORDER BY CAST(id AS INTEGER) DESC LIMIT 1
		`, energyType).Scan(&id, &name, &url)
		if err == nil {
			return id, name, url, true
		}
	}
	// 3) Last resort: any basic energy at all — a deck must never ship without energy.
	err := g.db.QueryRowContext(ctx, `
		SELECT id, name_id, COALESCE(image_url,'')
		FROM cards WHERE category = 'Energy' AND name_id LIKE '%Energi Dasar%'
		ORDER BY CAST(id AS INTEGER) DESC LIMIT 1
	`).Scan(&id, &name, &url)
	if err != nil {
		return "", "", "", false
	}
	return id, name, url, true
}

func (g *DeckGenerator) countDecksWithCard(ctx context.Context, name string) int {
	var n int
	g.db.QueryRowContext(ctx, `
		SELECT COUNT(DISTINCT dc.deck_id) FROM deck_cards dc
		JOIN cards c ON dc.card_id = c.id WHERE c.name_id = ?
	`, name).Scan(&n)
	return n
}

func detectPattern(c *engineCard) enginePattern {
	for _, p := range patternDefs {
		if p.match(c) {
			return enginePattern{Key: p.key, Label: p.label}
		}
	}
	return enginePattern{Key: "big_hitter", Label: patternDefs[len(patternDefs)-1].label}
}

func firstAbilityName(c *engineCard) string {
	if len(c.Abilities) > 0 {
		return c.Abilities[0].Name
	}
	return ""
}

func firstAbilityText(c *engineCard) string {
	if len(c.Abilities) > 0 {
		return c.Abilities[0].Name + ": " + c.Abilities[0].Description
	}
	return ""
}

func attackSummaries(c *engineCard) []string {
	var out []string
	for _, a := range c.Attacks {
		cost := strings.Join(a.EnergyCost, "/")
		out = append(out, fmt.Sprintf("%s [%s] — %s", a.Name, cost, a.Damage))
	}
	return out
}

func buildReasoning(engine *engineCard, pattern enginePattern, partners []candidatePokemon, trainers []trainerPick) []string {
	r := []string{
		fmt.Sprintf("Engine %s terdeteksi sebagai \"%s\" dari teks ability/serangan.", engine.Name, pattern.Label),
	}
	seenReasons := map[string]bool{}
	for _, p := range partners {
		if len(p.Reasons) > 0 {
			line := fmt.Sprintf("%s: %s (co-occurrence ×%d)", p.Name, p.Reasons[0], p.Cooccur)
			if !seenReasons[line] {
				seenReasons[line] = true
				r = append(r, line)
			}
		}
		if len(r) > 8 {
			break
		}
	}
	for _, t := range trainers {
		if t.Cooccur > 0 {
			r = append(r, fmt.Sprintf("%s: trainer yang menyertai engine di decklist nyata (×%d)", t.Name, t.Cooccur))
		}
		if len(r) > 14 {
			break
		}
	}
	return r
}

// planEnergy picks the dominant attack energy across engine + top partners.
func planEnergy(engine *engineCard, partners []candidatePokemon) (string, int) {
	counts := map[string]int{}
	weigh := func(c *engineCard, w int) {
		for _, a := range c.Attacks {
			for _, e := range a.EnergyCost {
				if e == "Colorless" {
					continue
				}
				counts[e] += w
			}
		}
	}
	weigh(engine, 3)
	for i, p := range partners {
		if i >= 4 {
			break
		}
		weigh(&p.engineCard, 1)
	}
	best, bestN := "", 0
	for k, n := range counts {
		if n > bestN {
			best, bestN = k, n
		}
	}
	suggested := 12
	if pattern := detectPattern(engine); pattern.Key == "energy_stacker" {
		suggested = 15
	}
	return best, suggested
}

func parseDamage(s string) int {
	n := 0
	for _, ch := range s {
		if ch < '0' || ch > '9' {
			continue
		}
		n = n*10 + int(ch-'0')
	}
	return n
}

func energyNamePattern(t string) string {
	m := map[string]string{
		"Fire":      "%Api%",
		"Water":     "%Air%",
		"Grass":     "%Daun%",
		"Lightning": "%Listrik%",
		"Psychic":   "%Psikis%",
		"Fighting":  "%Petarung%",
		"Darkness":  "%Kegelapan%",
		// Official IDN localization: Metal energy is "Energi Dasar [Logam]".
		"Metal": "%Logam%",
		"Dragon": "%Naga%",
	}
	if p, ok := m[t]; ok {
		return p
	}
	return "%"
}

// Ensure interface compatibility with models package (missing card shape used above).
var _ = models.MissingCard{}
