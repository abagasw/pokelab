package services

import (
	"context"
	"fmt"
	"math"
	"sort"
)

// JPArchetypeSignal is one archetype's momentum from Japanese City League
// results, compared against its (missing) global presence.
type JPArchetypeSignal struct {
	Archetype      string   `json:"archetype"`
	JPDeckCount    int      `json:"jp_deck_count"`
	JPSharePct     float64  `json:"jp_share_pct"`
	JPTopCutRate   float64  `json:"jp_topcut_rate"`
	JPRecentCount  int      `json:"jp_recent_count"`
	JPRecentShare  float64  `json:"jp_recent_share"`
	GlobalSharePct float64  `json:"global_share_pct"`
	BreakoutScore  float64  `json:"breakout_score"`
	Verdict        string   `json:"verdict"`
	Reason         string   `json:"reason"`
	KeyCards       []string `json:"key_cards,omitempty"`
}

// JPForecastResponse powers the "Sinyal dari Jepang" prediction board.
type JPForecastResponse struct {
	Signals     []JPArchetypeSignal `json:"signals"`
	TotalJP     int                 `json:"total_jp_decks"`
	TotalGlobal int                 `json:"total_global_decks"`
	Methodology []string            `json:"methodology"`
	Success     bool                `json:"success"`
}

// GetJPForecast analyzes JP City League decks versus the international meta.
//
// Model (deterministic):
//
//	jpShare      = jp_deck_count / total_jp * 100
//	topCutRate   = top8 / jp_deck_count * 100
//	recentShare  = decks in the last 30 days / jp_deck_count
//	breakout     = min(100, jpShare*8 + topCutRate*0.8 + recentShare*30
//	                + (globalShare < 1 ? 15 : 0))
//
// Archetypes with high JP momentum but little global presence are the
// "will become meta" candidates: JP sets and results lead the global
// release by 3-6 months.
func (s *ResearchService) GetJPForecast(ctx context.Context, limit int) (*JPForecastResponse, error) {
	if limit <= 0 || limit > 200 {
		limit = 15
	}

	// 1) JP aggregate: deck counts, top cuts, recent activity
	type jpRow struct {
		archetype string
		decks     int
		top8      int
		recent    int
	}
	jpAgg := map[string]*jpRow{}
	totalJP := 0
	rows, err := s.db.QueryContext(ctx, `
		SELECT d.archetype, COUNT(DISTINCT d.id),
		       SUM(CASE WHEN COALESCE(dl.placement, 99) BETWEEN 1 AND 8 THEN 1 ELSE 0 END),
		       SUM(CASE WHEN t.date >= date('now', '-30 days') THEN 1 ELSE 0 END)
		FROM decks d
		JOIN decklists dl ON dl.deck_id = d.id
		JOIN tournaments t ON t.id = dl.tournament_id
		WHERE d.id LIKE 'jpdeck-%' AND COALESCE(d.archetype, '') != ''
		GROUP BY d.archetype
		ORDER BY COUNT(DISTINCT d.id) DESC
	`)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var r jpRow
		var decks, top8, recent int
		var name string
		if rows.Scan(&name, &decks, &top8, &recent) == nil {
			r.archetype, r.decks, r.top8, r.recent = name, decks, top8, recent
			jpAgg[name] = &r
			totalJP += decks
		}
	}
	rows.Close()
	if totalJP == 0 {
		return &JPForecastResponse{
			Signals: []JPArchetypeSignal{}, Success: true,
			Methodology: []string{"Belum ada data turnamen Jepang tersinkron."},
		}, nil
	}

	// 2) global meta share for the same archetype names
	globalAgg := map[string]int{}
	totalGlobal := 0
	rows2, err := s.db.QueryContext(ctx, `
		SELECT archetype, COUNT(*) FROM decks
		WHERE user_id IS NULL AND id NOT LIKE 'jpdeck-%' AND COALESCE(archetype, '') != ''
		GROUP BY archetype
	`)
	if err == nil {
		for rows2.Next() {
			var name string
			var n int
			if rows2.Scan(&name, &n) == nil {
				globalAgg[name] = n
				totalGlobal += n
			}
		}
		rows2.Close()
	}

	// fuzzy helper: JP alt-derived names ("Lucario Mega Hariyama") vs global
	// ("Lucario Hariyama") — token subset match on shared Pokemon tokens.
	globalShareFor := func(archetype string) float64 {
		if totalGlobal == 0 {
			return 0
		}
		if n, ok := globalAgg[archetype]; ok {
			return float64(n) / float64(totalGlobal) * 100
		}
		tokens := tokenizeArchetype(archetype)
		best := 0
		for name, n := range globalAgg {
			gt := tokenizeArchetype(name)
			overlap := 0
			for _, t := range tokens {
				if containsToken(gt, t) {
					overlap++
				}
			}
			if overlap > 0 && overlap >= (len(tokens)+1)/2 {
				if n > best {
					best = n
				}
			}
		}
		if best == 0 {
			return 0
		}
		return float64(best) / float64(totalGlobal) * 100
	}

	// 3) score + verdicts
	signals := make([]JPArchetypeSignal, 0, len(jpAgg))
	for _, r := range jpAgg {
		if r.decks < 8 {
			continue // ignore single-event noise
		}
		jpShare := float64(r.decks) / float64(totalJP) * 100
		topCut := 0.0
		if r.decks > 0 {
			topCut = float64(r.top8) / float64(r.decks) * 100
		}
		recentShare := 0.0
		if r.decks > 0 {
			recentShare = float64(r.recent) / float64(r.decks) * 100
		}
		gShare := globalShareFor(r.archetype)
		breakout := math.Min(100, jpShare*8+topCut*0.8+recentShare*0.3+boolScore(gShare < 1)*15)

		verdict := "Pantau"
		switch {
		case gShare < 1 && breakout >= 55:
			verdict = "Kandidat meta global"
		case gShare < 3 && breakout >= 40:
			verdict = "Mulai muncul di global"
		case gShare >= 3:
			verdict = "Sudah meta global"
		}
		reason := fmt.Sprintf(
			"%d deck di City League JP (%.1f%% share JP, %.1f%% top cut, %.0f%% aktivitas 30 hari terakhir); share global saat ini %.2f%%",
			r.decks, jpShare, topCut, recentShare, gShare)

		signals = append(signals, JPArchetypeSignal{
			Archetype: r.archetype, JPDeckCount: r.decks,
			JPSharePct:     float64(int(jpShare*100+0.5)) / 100,
			JPTopCutRate:   float64(int(topCut*10+0.5)) / 10,
			JPRecentCount:  r.recent,
			JPRecentShare:  float64(int(recentShare*10+0.5)) / 10,
			GlobalSharePct: float64(int(gShare*100+0.5)) / 100,
			BreakoutScore:  float64(int(breakout*10+0.5)) / 10,
			Verdict:        verdict, Reason: reason,
		})
	}
	sort.SliceStable(signals, func(i, j int) bool {
		if signals[i].Verdict != signals[j].Verdict {
			return verdictRank(signals[i].Verdict) < verdictRank(signals[j].Verdict)
		}
		return signals[i].BreakoutScore > signals[j].BreakoutScore
	})
	if len(signals) > limit {
		signals = signals[:limit]
	}

	return &JPForecastResponse{
		Signals: signals, TotalJP: totalJP, TotalGlobal: totalGlobal, Success: true,
		Methodology: []string{
			"Sinyal dihitung dari decklist City League Jepang (jpdeck-*) dibandingkan share meta internasional.",
			"breakout = jpShare*8 + topCutRate*0.8 + recentShare*0.3 + bonus 15 jika share global < 1%.",
			"JP memimpin rilis global 3-6 bulan; archetype dengan momentum JP tinggi namun belum muncul global adalah kandidat meta berikutnya.",
			"Nama archetype JP diturunkan dari ikon Pokemon pada decklist; pencocokan global memakai token overlap.",
		},
	}, nil
}

func boolScore(b bool) float64 {
	if b {
		return 1
	}
	return 0
}

func verdictRank(v string) int {
	switch v {
	case "Kandidat meta global":
		return 0
	case "Mulai muncul di global":
		return 1
	case "Sudah meta global":
		return 2
	}
	return 3
}

var stopTokens = map[string]bool{"ex": true, "mega": true, "the": true, "and": true, "box": true, "lead": true}

func tokenizeArchetype(name string) []string {
	out := []string{}
	cur := ""
	for _, ch := range name {
		if ch == ' ' || ch == '-' || ch == '&' {
			if cur != "" && !stopTokens[cur] {
				out = append(out, cur)
			}
			cur = ""
			continue
		}
		cur += string(ch)
	}
	if cur != "" && !stopTokens[cur] {
		out = append(out, cur)
	}
	return out
}

func containsToken(tokens []string, t string) bool {
	for _, x := range tokens {
		if x == t {
			return true
		}
	}
	return false
}
