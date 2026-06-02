package services

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// AIService handles AI interactions with OpenRouter
type AIService struct {
	apiKey string
	model  string
	client *http.Client
}

// OpenRouterRequest represents the request to OpenRouter API
type OpenRouterRequest struct {
	Model    string    `json:"model"`
	Messages []Message `json:"messages"`
}

// Message represents a chat message
type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// OpenRouterResponse represents the response from OpenRouter API
type OpenRouterResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
}

var fallbackOpenRouterModels = []string{
	"meta-llama/llama-3.2-3b-instruct:free",
	"qwen/qwen3-next-80b-a3b-instruct:free",
	"nvidia/nemotron-nano-9b-v2:free",
}

// NewAIService creates a new AIService
func NewAIService(apiKey string) *AIService {
	return NewAIServiceWithModel(apiKey, "meta-llama/llama-3.3-70b-instruct:free")
}

// NewAIServiceWithModel creates a new AIService with a configurable OpenRouter model.
func NewAIServiceWithModel(apiKey, model string) *AIService {
	if model == "" {
		model = "meta-llama/llama-3.3-70b-instruct:free"
	}
	if apiKey == "your_api_key_here" {
		apiKey = ""
	}
	return &AIService{
		apiKey: apiKey,
		model:  model,
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// Ask sends a question to OpenRouter AI
func (s *AIService) Ask(ctx context.Context, systemPrompt, userPrompt string) (string, error) {
	if s.apiKey == "" {
		return s.getFallbackResponse(userPrompt), nil
	}

	models := []string{s.model}
	for _, model := range fallbackOpenRouterModels {
		if model != s.model {
			models = append(models, model)
		}
	}

	var lastErr error
	for _, model := range models {
		answer, err := s.askWithModel(ctx, model, systemPrompt, userPrompt)
		if err == nil {
			return answer, nil
		}
		lastErr = err
	}

	if lastErr == nil {
		lastErr = fmt.Errorf("no response from AI")
	}
	return "", lastErr
}

func (s *AIService) askWithModel(ctx context.Context, model, systemPrompt, userPrompt string) (string, error) {
	reqBody := OpenRouterRequest{
		Model: model,
		Messages: []Message{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: userPrompt},
		},
	}

	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", "https://openrouter.ai/api/v1/chat/completions", bytes.NewBuffer(jsonBody))
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+s.apiKey)
	req.Header.Set("HTTP-Referer", "https://pokemontcg.id")
	req.Header.Set("X-Title", "Pokemon TCG Indonesia API")

	resp, err := s.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("unexpected status code: %d", resp.StatusCode)
	}

	var result OpenRouterResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("failed to decode response: %w", err)
	}

	if len(result.Choices) == 0 {
		return "", fmt.Errorf("no response from AI")
	}

	return result.Choices[0].Message.Content, nil
}

// AskWithContext sends a question with full context
func (s *AIService) AskWithContext(ctx context.Context, context, question string) (string, error) {
	systemPrompt := `Kamu adalah asisten ahli Pokemon TCG Indonesia. Berikan jawaban yang akurat dan informatif berdasarkan data yang tersedia. Gunakan Bahasa Indonesia yang baik dan mudah dipahami.`

	userPrompt := fmt.Sprintf("Context:\n%s\n\nPertanyaan: %s", context, question)

	return s.Ask(ctx, systemPrompt, userPrompt)
}

// ExplainCard asks AI to explain a card
func (s *AIService) ExplainCard(ctx context.Context, cardName, cardData string) (string, error) {
	if s.apiKey == "" {
		return "", fmt.Errorf("openrouter api key not configured")
	}

	systemPrompt := `Kamu adalah scout kompetitif Pokemon TCG untuk PokeLab ID.
Tugasmu menjelaskan kartu berdasarkan data JSON yang diberikan, bukan mengarang angka.
Gunakan Bahasa Indonesia yang padat, praktis, dan mudah dipakai pemain.

Format jawaban:
1. Ringkasan Fungsi: jelaskan efek utama kartu.
2. Peran di Deck: attacker, engine, setup, disruption, mobility, draw/search, energy, atau tech.
3. Kapan Dipakai: fase game dan kondisi board yang cocok.
4. Sinergi: jenis kartu/deck yang biasanya cocok.
5. Risiko: kelemahan tempo, matchup, atau keterbatasan copy.
6. Sinyal Meta: gunakan meta_usage jika ada; kalau kosong, katakan belum ada bukti turnamen cukup.
7. Rekomendasi Copy: beri kisaran copy dan alasan.

Jangan klaim kartu pasti meta jika meta_usage kosong atau rendah.`

	userPrompt := fmt.Sprintf("Kartu: %s\n\nData JSON:\n%s\n\nBuat analisis scout report kartu ini:", cardName, cardData)

	return s.Ask(ctx, systemPrompt, userPrompt)
}

// BuildDeck asks AI to build a deck
func (s *AIService) BuildDeck(ctx context.Context, preferences map[string]interface{}, availableCards string) (string, error) {
	systemPrompt := `Kamu adalah deck builder profesional Pokemon TCG. Buat deck yang kompetitif dengan pertimbangan sinergi, consistency, dan power level. 
	
SANGAT PENTING:
1. Jika data kartu memiliki field 'available_count', kamu HANYA boleh menggunakan kartu tersebut maksimal sejumlah 'available_count'.
2. Total kartu dalam deck harus tepat 60 kartu.
3. Gunakan Bahasa Indonesia untuk penjelasan strateginya.
4. Format output harus berupa JSON yang valid dengan struktur: { "name": "...", "archetype": "...", "description": "...", "cards": { "pokemon": [...], "trainer": [...], "energy": [...] }, "total_cards": 60, "analysis": { "strengths": [...], "weaknesses": [...], "key_cards": [...], "playstyle": "..." } }`

	prefJSON, _ := json.Marshal(preferences)
	userPrompt := fmt.Sprintf("Preferensi: %s\n\nKartu tersedia (dengan limit jumlah):\n%s\n\nBuatkan deck terbaik mengikuti limit jumlah kartu yang tersedia:", string(prefJSON), availableCards)

	return s.Ask(ctx, systemPrompt, userPrompt)
}

// AnalyzeMeta asks AI to analyze meta
func (s *AIService) AnalyzeMeta(ctx context.Context, tournamentData string) (string, error) {
	systemPrompt := `Kamu adalah analis kompetitif Pokemon TCG. Analisis data tournament berikut dan berikan insight tentang meta yang sedang berkembang, deck tier list, dan prediksi tren.`

	userPrompt := fmt.Sprintf("Data tournament:\n%s\n\nAnalisis meta saat ini:", tournamentData)

	return s.Ask(ctx, systemPrompt, userPrompt)
}

// AnalyzePrice asks AI to analyze price
func (s *AIService) AnalyzePrice(ctx context.Context, cardID, priceData string) (string, error) {
	systemPrompt := `Kamu adalah analis pasar Pokemon TCG. Analisis data harga kartu ini dan berikan rekomendasi investasi.`

	userPrompt := fmt.Sprintf("Card ID: %s\nPrice Data: %s\n\nAnalisis harga dan berikan rekomendasi:", cardID, priceData)

	return s.Ask(ctx, systemPrompt, userPrompt)
}

// PredictPrice asks AI to predict future price
func (s *AIService) PredictPrice(ctx context.Context, cardData, historyData, metaData string) (string, error) {
	systemPrompt := `Kamu adalah mesin prediksi harga Pokemon TCG berbasis ML. Tugasmu adalah memprediksi harga kartu dalam 30 hari ke depan.
	
Analisis hal berikut:
1. Tren Historis: Apakah harga naik atau turun belakangan ini?
2. Meta-game: Apakah kartu ini banyak digunakan di deck pemenang turnamen?
3. Rarity: Seberapa langka kartu ini? (Secret Rare cenderung stabil/naik).

Berikan output dalam format JSON valid:
{
  "predicted_price": 1250000,
  "range_min": 1100000,
  "range_max": 1400000,
  "confidence": 0.85,
  "trend": "up",
  "sentiment": "Sangat populer di meta saat ini, stok menipis.",
  "factors": ["Juara di 3 turnamen terakhir", "Kelangkaan Ultra Rare", "Permintaan tinggi di Indonesia"]
}`

	userPrompt := fmt.Sprintf("Data Kartu: %s\nRiwayat Harga: %s\nData Meta: %s\n\nBerikan prediksi harga dalam JSON:",
		cardData, historyData, metaData)

	return s.Ask(ctx, systemPrompt, userPrompt)
}

// getFallbackResponse returns a fallback response when AI is not available
func (s *AIService) getFallbackResponse(prompt string) string {
	return fmt.Sprintf("[AI Service tidak tersedia] Pertanyaan: %s", prompt[:min(len(prompt), 100)])
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
