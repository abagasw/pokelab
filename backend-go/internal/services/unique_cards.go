package services

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
)

// UniqueCardPattern is one detected synergy pattern on a card.
type UniqueCardPattern struct {
	Key   string `json:"key"`
	Label string `json:"label"`
}

// UniqueCard is a card with detected unique abilities/attacks.
type UniqueCard struct {
	CardID          string             `json:"card_id"`
	Name            string             `json:"name"`
	ImageURL        string             `json:"image_url"`
	CardType        string             `json:"card_type,omitempty"`
	Stage           string             `json:"evolution_stage,omitempty"`
	HP              int                `json:"hp,omitempty"`
	ExpansionCode   string             `json:"expansion_code,omitempty"`
	CollectorNumber string             `json:"collector_number,omitempty"`
	RegulationMark  string             `json:"regulation_mark,omitempty"`
	Patterns        []UniqueCardPattern `json:"patterns"`
	AbilityNames    []string           `json:"ability_names,omitempty"`
	AbilityTexts    []string           `json:"ability_texts,omitempty"`
	AttackSummary   []string           `json:"attack_summary,omitempty"`
	Why             []string           `json:"why"`
	Score           int                `json:"score"`
}

// UniqueCardsResponse is the paginated detector result.
type UniqueCardsResponse struct {
	Cards      []UniqueCard `json:"cards"`
	Total      int          `json:"total"`
	Patterns   []UniqueCardPattern `json:"patterns"`
	Counts     map[string]int       `json:"pattern_counts"`
	GeneratedAt time.Time           `json:"generated_at"`
}

// detector classifies one card's ability/attack text into patterns.
type detector struct {
	key    string
	label  string
	weight int
	match  func(text string, card *uniqueScanCard) (bool, string)
}

type uniqueScanCard struct {
	ID, Name, CardType, Stage, Exp, Number, Reg, Image string
	HP          int
	Attacks     []attackData
	Abilities   []abilityData
	rawText     string // combined original-case text for word-boundary checks
}

// koWordRe matches a standalone "KO" (not the "ko" inside "Pokemon").
var koWordRe = regexp.MustCompile(`(?i)\bKO\b`)

var uniqueDetectors = []detector{
	{
		key: "bench_attacker", label: "Pakai serangan bench", weight: 10,
		match: func(text string, c *uniqueScanCard) (bool, string) {
			if strings.Contains(text, "cadangan") && strings.Contains(text, "serangan") &&
				(strings.Contains(text, "menggunakan semua serangan") || strings.Contains(text, "serangan yang dimiliki")) {
				return true, "dapat memakai serangan Pokémon Cadangan"
			}
			return false, ""
		},
	},
	{
		key: "energy_manip", label: "Manipulasi biaya energi", weight: 8,
		match: func(text string, c *uniqueScanCard) (bool, string) {
			if strings.Contains(text, "energi") && (strings.Contains(text, "berkurang") || strings.Contains(text, "dibutuhkan")) {
				return true, "mengubah biaya energi yang dibutuhkan"
			}
			if strings.Contains(text, "energi") && strings.Contains(text, "bertambah") && strings.Contains(text, "hp") {
				return true, "HP scale dengan jumlah energi"
			}
			return false, ""
		},
	},
	{
		key: "damage_counter", label: "Manipulasi Token Kerusakan", weight: 9,
		match: func(text string, c *uniqueScanCard) (bool, string) {
			if strings.Contains(text, "token kerusakan") {
				return true, "memanipulasi Token Kerusakan"
			}
			return false, ""
		},
	},
	{
		key: "punish", label: "Punish saat KO", weight: 9,
		// NOTE: "ko" as a plain substring would match inside "Pokemon";
		// use a word-boundary regex on the RAW text instead.
		match: func(text string, c *uniqueScanCard) (bool, string) {
			if koWordRe.MatchString(c.rawText) && (strings.Contains(text, "melempar koin") ||
				strings.Contains(text, "sisi depan") || strings.Contains(text, "karena menerima kerusakan")) {
				return true, "efek balasan saat KO"
			}
			return false, ""
		},
	},
	{
		key: "draw_engine", label: "Draw engine", weight: 6,
		match: func(text string, c *uniqueScanCard) (bool, string) {
			if strings.Contains(text, "ambil") && strings.Contains(text, "kartu") {
				return true, "mengambil kartu tambahan dari Deck"
			}
			return false, ""
		},
	},
	{
		key: "energy_accel", label: "Akselerasi energi", weight: 8,
		match: func(text string, c *uniqueScanCard) (bool, string) {
			if strings.Contains(text, "energi") && (strings.Contains(text, "tambahkan") ||
				strings.Contains(text, "pasang")) {
				return true, "menambahkan/memasang Energi tambahan"
			}
			return false, ""
		},
	},
	{
		key: "disruption", label: "Disrupsi lawan", weight: 7,
		match: func(text string, c *uniqueScanCard) (bool, string) {
			// only phrases where the OPPONENT is the target
			if strings.Contains(text, "lawan tidak dapat") || strings.Contains(text, "lawan tidak bisa") {
				return true, "memblokir aksi lawan"
			}
			if strings.Contains(text, "kocok") && (strings.Contains(text, "kartu pegangan lawan") ||
				strings.Contains(text, "deck lawan")) {
				return true, "mengocok kartu lawan"
			}
			if strings.Contains(text, "buang") && strings.Contains(text, "kartu lawan") {
				return true, "membuang kartu lawan"
			}
			return false, ""
		},
	},
	{
		key: "protection", label: "Proteksi", weight: 7,
		match: func(text string, c *uniqueScanCard) (bool, string) {
			if strings.Contains(text, "tidak menerima") && (strings.Contains(text, "kerusakan") ||
				strings.Contains(text, "efek")) {
				return true, "melindungi dari kerusakan/efek"
			}
			return false, ""
		},
	},
	{
		key: "healing", label: "Healing", weight: 5,
		match: func(text string, c *uniqueScanCard) (bool, string) {
			if strings.Contains(text, "pulihkan") && strings.Contains(text, "hp") {
				return true, "memulihkan HP"
			}
			return false, ""
		},
	},
	{
		key: "spread", label: "Serangan area (spread)", weight: 7,
		match: func(text string, c *uniqueScanCard) (bool, string) {
			if strings.Contains(text, "semua pokemon") && strings.Contains(text, "lawan") {
				return true, "menyerang semua Pokémon lawan sekaligus"
			}
			return false, ""
		},
	},
	{
		key: "multi_attack", label: "Serangan beruntun", weight: 8,
		match: func(text string, c *uniqueScanCard) (bool, string) {
			if strings.Contains(text, "serangan") && strings.Contains(text, "2 kali") {
				return true, "dapat menggunakan serangan berkali-kali"
			}
			return false, ""
		},
	},
}

var uniqueCache struct {
	mu        sync.Mutex
	data      *UniqueCardsResponse
	expiresAt time.Time
}

const uniqueCacheTTL = 10 * time.Minute

// FindUniqueCards scans the legal card pool and returns cards whose
// abilities/attacks match one of the unique-synergy patterns.
func (g *DeckGenerator) FindUniqueCards(ctx context.Context, pattern, query, sortMode string, limit, offset int) (*UniqueCardsResponse, error) {
	all, err := g.loadUniqueCards(ctx)
	if err != nil {
		return nil, err
	}

	// filter
	var filtered []UniqueCard
	q := strings.ToLower(strings.TrimSpace(query))
	for _, uc := range all.Cards {
		if pattern != "" && !hasPattern(uc.Patterns, pattern) {
			continue
		}
		if q != "" && !strings.Contains(strings.ToLower(uc.Name), q) {
			continue
		}
		filtered = append(filtered, uc)
	}

	// sort=newest: radar mode, latest expansions first
	if sortMode == "newest" {
		sorted := make([]UniqueCard, len(filtered))
		copy(sorted, filtered)
		sort.SliceStable(sorted, func(i, j int) bool {
			return sorted[i].CardID > sorted[j].CardID
		})
		filtered = sorted
	}

	total := len(filtered)
	if offset > total {
		offset = total
	}
	if offset < 0 {
		offset = 0
	}
	end := offset + limit
	if end > total {
		end = total
	}

	return &UniqueCardsResponse{
		Cards:      filtered[offset:end],
		Total:      total,
		Patterns:   all.Patterns,
		Counts:     all.Counts,
		GeneratedAt: all.GeneratedAt,
	}, nil
}

func hasPattern(patterns []UniqueCardPattern, key string) bool {
	for _, p := range patterns {
		if p.Key == key {
			return true
		}
	}
	return false
}

func (g *DeckGenerator) loadUniqueCards(ctx context.Context) (*UniqueCardsResponse, error) {
	uniqueCache.mu.Lock()
	defer uniqueCache.mu.Unlock()
	if uniqueCache.data != nil && time.Now().Before(uniqueCache.expiresAt) {
		return uniqueCache.data, nil
	}

	rows, err := g.db.QueryContext(ctx, `
		SELECT id, COALESCE(name_id,''), COALESCE(card_type,''), COALESCE(evolution_stage,''),
		       COALESCE(hp,0), COALESCE(expansion_code,''), COALESCE(collector_number,''),
		       COALESCE(regulation_mark,''), COALESCE(image_url,''),
		       COALESCE(attacks,'[]'), COALESCE(abilities,'[]')
		FROM cards
		WHERE category = 'Pokemon' AND regulation_mark IN ('H','I','J')
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	counts := map[string]int{}
	var cards []UniqueCard
	best := map[string]UniqueCard{} // best printing per card name

	for rows.Next() {
		var c uniqueScanCard
		var attacksJSON, abilitiesJSON string
		if rows.Scan(&c.ID, &c.Name, &c.CardType, &c.Stage, &c.HP, &c.Exp, &c.Number,
			&c.Reg, &c.Image, &attacksJSON, &abilitiesJSON) != nil {
			continue
		}
		json.Unmarshal([]byte(attacksJSON), &c.Attacks)
		json.Unmarshal([]byte(abilitiesJSON), &c.Abilities)
		var rawParts []string
		for _, ab := range c.Abilities {
			rawParts = append(rawParts, ab.Name, ab.Description)
		}
		for _, atk := range c.Attacks {
			rawParts = append(rawParts, atk.Name, atk.Description)
		}
		c.rawText = strings.Join(rawParts, " | ")

		uc := classifyUniqueCard(&c)
		if len(uc.Patterns) == 0 {
			continue
		}
		for _, p := range uc.Patterns {
			counts[p.Key]++
		}
		if prev, ok := best[uc.Name]; !ok || uc.Score > prev.Score {
			best[uc.Name] = uc
		}
	}

	for _, uc := range best {
		cards = append(cards, uc)
	}
	sort.SliceStable(cards, func(i, j int) bool {
		if cards[i].Score != cards[j].Score {
			return cards[i].Score > cards[j].Score
		}
		return cards[i].HP > cards[j].HP
	})

	patternList := []UniqueCardPattern{
		{Key: "bench_attacker", Label: "Pakai serangan bench"},
		{Key: "energy_manip", Label: "Manipulasi biaya energi"},
		{Key: "damage_counter", Label: "Token Kerusakan"},
		{Key: "punish", Label: "Punish saat KO"},
		{Key: "draw_engine", Label: "Draw engine"},
		{Key: "energy_accel", Label: "Akselerasi energi"},
		{Key: "disruption", Label: "Disrupsi lawan"},
		{Key: "protection", Label: "Proteksi"},
		{Key: "healing", Label: "Healing"},
		{Key: "spread", Label: "Serangan area"},
		{Key: "multi_attack", Label: "Serangan beruntun"},
	}

	resp := &UniqueCardsResponse{
		Cards:       cards,
		Total:       len(cards),
		Patterns:    patternList,
		Counts:      counts,
		GeneratedAt: time.Now().UTC(),
	}
	uniqueCache.data = resp
	uniqueCache.expiresAt = time.Now().Add(uniqueCacheTTL)
	return resp, nil
}

// classifyUniqueCard runs all detectors over a card's ability and attack text.
func classifyUniqueCard(c *uniqueScanCard) UniqueCard {
	uc := UniqueCard{
		CardID: c.ID, Name: c.Name, ImageURL: c.Image, CardType: c.CardType,
		Stage: c.Stage, HP: c.HP, ExpansionCode: c.Exp,
		CollectorNumber: c.Number, RegulationMark: c.Reg,
		Patterns: []UniqueCardPattern{}, Why: []string{},
	}

	seen := map[string]bool{}

	runDetectors := func(text, source string) {
		lower := strings.ToLower(text)
		for _, d := range uniqueDetectors {
			if seen[d.key] {
				continue
			}
			if ok, reason := d.match(lower, c); ok {
				seen[d.key] = true
				uc.Patterns = append(uc.Patterns, UniqueCardPattern{Key: d.key, Label: d.label})
				uc.Why = append(uc.Why, fmt.Sprintf("%s — %s", reason, source))
				uc.Score += d.weight
			}
		}
	}

	for _, ab := range c.Abilities {
		if ab.Description == "" {
			continue
		}
		uc.AbilityNames = append(uc.AbilityNames, ab.Name)
		uc.AbilityTexts = append(uc.AbilityTexts, ab.Description)
		runDetectors(ab.Description, fmt.Sprintf("ability %s", ab.Name))
	}
	for _, atk := range c.Attacks {
		text := atk.Description
		if text == "" {
			text = atk.Name
		}
		runDetectors(text, fmt.Sprintf("serangan %s", atk.Name))
		cost := len(atk.EnergyCost)
		dmg := parseDamage(atk.Damage)
		summary := fmt.Sprintf("%s (%d dmg, %d energi)", atk.Name, dmg, cost)
		if dmg > 0 {
			uc.AttackSummary = append(uc.AttackSummary, summary)
		}
		// efficiency outlier: big damage for low cost
		if !seen["efficiency"] {
			if (dmg >= 140 && cost <= 2) || (dmg >= 200 && cost <= 3) || (dmg >= 280 && cost <= 4) {
				seen["efficiency"] = true
				uc.Patterns = append(uc.Patterns, UniqueCardPattern{Key: "efficiency", Label: "Damage efisien"})
				uc.Why = append(uc.Why, fmt.Sprintf("%d damage untuk %d energi — efisiensi di atas rata-rata", dmg, cost))
				uc.Score += 6
			}
		}
	}

	if uc.Score > 10 {
		uc.Score = 10 + (uc.Score - 10) / 2 // dampen stacking
	}
	return uc
}
