package services

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
)

// RAGService provides Retrieval-Augmented Generation for deck advice.
type RAGService struct {
	db       *sql.DB
	ai       *AIService
}

// NewRAGService creates a new RAGService.
func NewRAGService(db *sql.DB, ai *AIService) *RAGService {
	return &RAGService{db: db, ai: ai}
}

// AskDeckAdvisor answers questions about decks using RAG.
func (r *RAGService) AskDeckAdvisor(ctx context.Context, question string, collectionID string) (string, error) {
	// Build context from inventory only (fast query)
	inventoryHint := ""
	if collectionID != "" {
		invCtx, _ := r.retrieveInventoryContext(ctx, collectionID)
		if invCtx != "" {
			inventoryHint = "\nUser inventory:\n" + invCtx
		}
	}

	systemPrompt := "You are a Pokemon TCG deck building assistant. Answer questions about card game strategy, deck building, and competitive play. Give specific card recommendations with quantities. Format with bullet points. Be helpful and direct."

	userPrompt := question
	if inventoryHint != "" {
		userPrompt = question + inventoryHint
	}

	return r.ai.Ask(ctx, systemPrompt, userPrompt)
}

// retrieveContext fetches relevant data from the database based on the question.
func (r *RAGService) retrieveContext(ctx context.Context, question string, collectionID string) (string, error) {
	var parts []string

	// Get top 3 tournament decks (minimal query)
	if deckCtx, err := r.retrieveTopDecks(ctx); err == nil && deckCtx != "" {
		parts = append(parts, deckCtx)
	}

	// Get inventory summary if available
	if collectionID != "" {
		if invCtx, err := r.retrieveInventoryContext(ctx, collectionID); err == nil && invCtx != "" {
			parts = append(parts, invCtx)
		}
	}

	return strings.Join(parts, "\n"), nil
}

// retrieveMetaContext gets overall meta statistics.
func (r *RAGService) retrieveMetaContext(ctx context.Context) (string, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT COALESCE(archetype, name), COUNT(*) as cnt,
		       SUM(COALESCE(tournament_count,0)) as tc,
		       SUM(COALESCE(win_count,0)) as wc
		FROM decks WHERE user_id IS NULL
		GROUP BY COALESCE(archetype, name)
		ORDER BY tc DESC, wc DESC
		LIMIT 3
	`)
	if err != nil {
		return "", err
	}
	defer rows.Close()

	var lines []string
	lines = append(lines, "Top 15 archetypes by tournament presence:")
	for rows.Next() {
		var name string
		var cnt, tc, wc int
		if rows.Scan(&name, &cnt, &tc, &wc) == nil {
			lines = append(lines, fmt.Sprintf("- %s: %d variants, %d tournament entries, %d wins", name, cnt, tc, wc))
		}
	}
	return strings.Join(lines, "\n"), nil
}

// retrieveCardContext searches for cards mentioned in the question.
func (r *RAGService) retrieveCardContext(ctx context.Context, question string) (string, error) {
	// Extract potential card names from question (words > 3 chars)
	words := strings.Fields(question)
	var searchTerms []string
	for _, w := range words {
		w = strings.Trim(w, "?,.!()[]{}\"'")
		if len(w) > 3 {
			searchTerms = append(searchTerms, w)
		}
	}
	if len(searchTerms) == 0 {
		return "", nil
	}

	// Search for cards matching any term
	likeClauses := make([]string, 0, len(searchTerms))
	args := make([]interface{}, 0, len(searchTerms))
	for _, term := range searchTerms {
		likeClauses = append(likeClauses, "LOWER(c.name_id) LIKE ?")
		args = append(args, "%"+term+"%")
	}

	query := fmt.Sprintf(`
		SELECT c.name_id, c.category, COALESCE(c.card_type,''), COALESCE(c.rarity,''), 
		       COALESCE(c.hp,0), COALESCE(c.evolution_stage,''),
		       (SELECT MIN(cp.price_idr) FROM card_prices cp WHERE cp.card_id = c.id AND cp.price_idr > 0)
		FROM cards c
		WHERE %s
		LIMIT 5
	`, strings.Join(likeClauses, " OR "))

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return "", err
	}
	defer rows.Close()

	var lines []string
	for rows.Next() {
		var name, cat, cardType, rarity, evo string
		var hp int
		var price sql.NullFloat64
		if rows.Scan(&name, &cat, &cardType, &rarity, &hp, &evo, &price) == nil {
			line := fmt.Sprintf("- %s [%s/%s] HP:%d %s %s", name, cat, cardType, hp, rarity, evo)
			if price.Valid {
				line += fmt.Sprintf(" — Rp %.0f", price.Float64)
			}
			lines = append(lines, line)
		}
	}

	// Also get deck usage for these cards
	if len(searchTerms) > 0 {
		likeClauses2 := make([]string, 0, len(searchTerms))
		args2 := make([]interface{}, 0, len(searchTerms))
		for _, term := range searchTerms {
			likeClauses2 = append(likeClauses2, "LOWER(c.name_id) LIKE ?")
			args2 = append(args2, "%"+term+"%")
		}
		usageQuery := fmt.Sprintf(`
			SELECT c.name_id, d.name, COALESCE(d.archetype,''), dc.count
			FROM deck_cards dc
			JOIN cards c ON dc.card_id = c.id
			JOIN decks d ON dc.deck_id = d.id
			WHERE d.user_id IS NULL AND (%s)
			ORDER BY d.tournament_count DESC
			LIMIT 5
		`, strings.Join(likeClauses2, " OR "))
		
		usageRows, err := r.db.QueryContext(ctx, usageQuery, args2...)
		if err == nil {
			defer usageRows.Close()
			var usageLines []string
			for usageRows.Next() {
				var cardName, deckName, archetype string
				var count int
				if usageRows.Scan(&cardName, &deckName, &archetype, &count) == nil {
					usageLines = append(usageLines, fmt.Sprintf("  %dx %s in %s (%s)", count, cardName, deckName, archetype))
				}
			}
			if len(usageLines) > 0 {
				lines = append(lines, "\nUsed in tournament decks:")
				lines = append(lines, usageLines...)
			}
		}
	}

	return strings.Join(lines, "\n"), nil
}

// retrieveInventoryContext gets user's collection summary.
func (r *RAGService) retrieveInventoryContext(ctx context.Context, collectionID string) (string, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT c.name_id, ci.quantity, c.category, COALESCE(c.card_type,'')
		FROM collection_items ci
		JOIN cards c ON ci.card_id = c.id
		WHERE ci.collection_id = ?
		ORDER BY ci.quantity DESC
		LIMIT 15
	`, collectionID)
	if err != nil {
		return "", err
	}
	defer rows.Close()

	var lines []string
	totalCards := 0
	for rows.Next() {
		var name, cat, cardType string
		var qty int
		if rows.Scan(&name, &qty, &cat, &cardType) == nil {
			lines = append(lines, fmt.Sprintf("- %dx %s [%s/%s]", qty, name, cat, cardType))
			totalCards += qty
		}
	}
	if len(lines) == 0 {
		return "", nil
	}

	header := fmt.Sprintf("Total: %d cards, %d unique entries\n", totalCards, len(lines))
	return header + strings.Join(lines, "\n"), nil
}

// retrieveTopDecks gets the top tournament decks.
func (r *RAGService) retrieveTopDecks(ctx context.Context) (string, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT d.name, COALESCE(d.archetype,''), 
		       COALESCE(d.tournament_count,0), COALESCE(d.win_count,0), COALESCE(d.top8_count,0),
		       (SELECT GROUP_CONCAT(c.name_id || ' x' || dc.count, ', ')
		        FROM deck_cards dc JOIN cards c ON dc.card_id = c.id
		        WHERE dc.deck_id = d.id AND dc.is_pokemon = 1
		        LIMIT 8)
		FROM decks d
		WHERE d.user_id IS NULL
		ORDER BY d.tournament_count DESC, d.win_count DESC
		LIMIT 3
	`)
	if err != nil {
		return "", err
	}
	defer rows.Close()

	var lines []string
	for rows.Next() {
		var name, archetype, pokemonList string
		var tc, wc, t8 int
		if rows.Scan(&name, &archetype, &tc, &wc, &t8, &pokemonList) == nil {
			lines = append(lines, fmt.Sprintf("- %s [%s] — %d events, %d wins, %d top8\n  Pokemon: %s",
				name, archetype, tc, wc, t8, pokemonList))
		}
	}
	return strings.Join(lines, "\n"), nil
}
