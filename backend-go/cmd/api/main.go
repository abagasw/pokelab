package main

import (
	"log"
	"os"
	"pokemon-tcg-indonesia/internal/auth"
	"pokemon-tcg-indonesia/internal/cache"
	"pokemon-tcg-indonesia/internal/config"
	"pokemon-tcg-indonesia/internal/database"
	"pokemon-tcg-indonesia/internal/handlers"
	"pokemon-tcg-indonesia/internal/middleware"
	"pokemon-tcg-indonesia/internal/services"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

// @title Pokemon TCG Indonesia API
// @version 1.0
// @description API untuk PokeLab ID - Pokemon TCG Indonesia Research Lab, Deck Builder, Price Analysis, dan Inventory Scoring
// @termsOfService http://swagger.io/terms/

// @contact.name API Support
// @contact.email support@pokemontcg.id

// @license.name MIT
// @license.url https://opensource.org/licenses/MIT

// @host localhost:8080
// @BasePath /api/v1

// @schemes http https

func main() {
	// Load .env file
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using environment variables")
	}

	// Load config
	cfg := config.Load()

	// Initialize SQLite database
	dbPath := cfg.DBPath
	if dbPath == "" {
		dbPath = "pokemon_tcg.db"
	}

	db, err := database.NewDB(dbPath)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	// Initialize schema
	if err := db.InitSchema(); err != nil {
		log.Fatalf("Failed to initialize schema: %v", err)
	}

	// Initialize Redis (optional)
	var redis *cache.RedisClient
	if cfg.RedisURL != "" {
		redis, err = cache.NewRedisClient(cfg.RedisURL)
		if err != nil {
			log.Printf("Warning: Failed to connect to Redis: %v", err)
			log.Println("Continuing without Redis caching...")
		} else {
			defer redis.Close()
		}
	}

	// Initialize JWT service
	jwtSecret := cfg.JWTSecret
	if jwtSecret == "" {
		jwtSecret = "your-secret-key-change-in-production"
		log.Println("WARNING: Using default JWT secret. Set JWT_SECRET in production!")
	}
	jwtService := auth.NewJWTService(jwtSecret)

	// Initialize services
	aiService := services.NewAIServiceWithModel(cfg.OpenRouterAPIKey, cfg.OpenRouterModel)
	cachedCardService := services.NewCachedCardService(db.DB, aiService, redis)
	deckService := services.NewDeckService(db.DB, aiService)
	priceService := services.NewPriceService(db.DB, aiService)
	collectionService := services.NewCollectionService(db.DB, priceService)
	researchService := services.NewResearchService(db.DB, aiService)
	authService := services.NewAuthService(db.DB, jwtService)

	// Initialize handlers
	cardHandler := handlers.NewCardHandler(cachedCardService.CardService)
	deckHandler := handlers.NewDeckHandler(deckService)
	collectionHandler := handlers.NewCollectionHandler(collectionService)
	priceHandler := handlers.NewPriceHandler(priceService)
	aiHandler := handlers.NewAIHandler(cachedCardService.CardService)
	authHandler := handlers.NewAuthHandler(authService)
	researchHandler := handlers.NewResearchHandler(researchService)

	// Setup router
	ginMode := os.Getenv("GIN_MODE")
	if ginMode == "" {
		ginMode = gin.DebugMode
	}
	gin.SetMode(ginMode)

	router := gin.Default()

	// CORS middleware
	router.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	// Security headers middleware
	router.Use(securityHeadersMiddleware())

	// Rate limiting middleware
	rateLimiter := middleware.NewMemoryRateLimiter(100, time.Minute)
	rateLimiter.StartCleanup(5 * time.Minute)

	authRateLimiter := middleware.NewMemoryRateLimiter(5, time.Minute) // Stricter for auth
	authRateLimiter.StartCleanup(5 * time.Minute)

	router.Use(middleware.RateLimitMiddleware(rateLimiter, middleware.DefaultRateLimitConfig()))

	// API v1 routes
	v1 := router.Group("/api/v1")
	{
		// Health check
		v1.GET("/health", func(c *gin.Context) {
			c.JSON(200, gin.H{
				"status":  "ok",
				"service": "pokemon-tcg-indonesia",
				"version": "1.0.0",
				"cache":   redis != nil,
			})
		})

		// Cards
		cards := v1.Group("/cards")
		{
			cards.GET("", cardHandler.SearchCards)
			cards.GET("/image-proxy", cardHandler.ProxyCardImage)
			cards.GET("/by-id", cardHandler.GetCardByIDQuery)
			cards.GET("/:id", cardHandler.GetCardByID)
			cards.GET("/:id/prices", cardHandler.GetCardPrices)
		}

		// Expansions
		expansions := v1.Group("/expansions")
		{
			expansions.GET("", cardHandler.GetExpansions)
			expansions.GET("/:code", cardHandler.GetExpansionByCode)
			expansions.GET("/:code/cards", cardHandler.GetCardsByExpansion)
		}

		// Decks
		decks := v1.Group("/decks")
		{
			decks.GET("", deckHandler.GetDecks)
			decks.GET("/:id", deckHandler.GetDeckByID)
			decks.GET("/:id/decklists", deckHandler.GetDeckDecklists)
			decks.POST("/build", deckHandler.BuildDeck)
			decks.POST("/analyze", deckHandler.AnalyzeDeck)

			// Protected deck routes
			protected := decks.Group("")
			protected.Use(middleware.JWTAuthMiddleware(jwtService))
			{
				protected.POST("", deckHandler.CreateDeck)
			}
		}

		// Tournaments
		tournaments := v1.Group("/tournaments")
		{
			tournaments.GET("", deckHandler.GetTournaments)
			tournaments.GET("/:id", deckHandler.GetTournamentByID)
			tournaments.GET("/:id/standings", deckHandler.GetTournamentStandings)
		}

		// Price Analysis
		prices := v1.Group("/prices")
		{
			prices.GET("/compare", priceHandler.ComparePrices)
			prices.GET("/arbitrage", priceHandler.GetArbitrageOpportunities)
			prices.GET("/trends", priceHandler.GetPriceTrends)
			prices.GET("/best-deals", priceHandler.GetBestDeals)
			prices.GET("/:id/prediction", priceHandler.GetPricePrediction)
		}

		// PokeLab ID Research Lab (protected)
		research := v1.Group("/research")
		research.Use(middleware.JWTAuthMiddleware(jwtService))
		{
			research.GET("/recommendations", researchHandler.GetRecommendations)
			research.GET("/deck-gap", researchHandler.GetDeckGap)
			research.GET("/deck-analysis", researchHandler.GetDeckAnalysis)
			research.POST("/anti-meta", researchHandler.GetAntiMeta)
			research.GET("/predictions", researchHandler.GetPredictions)
			research.POST("/advisor", researchHandler.AskAdvisor)
		}

		// Auth (public) - with stricter rate limiting
		authGroup := v1.Group("/auth")
		authGroup.Use(middleware.RateLimitMiddleware(authRateLimiter, middleware.AuthRateLimitConfig()))
		{
			authGroup.POST("/register", authHandler.Register)
			authGroup.POST("/login", authHandler.Login)
			authGroup.POST("/refresh", authHandler.RefreshToken)
			authGroup.POST("/forgot-password", authHandler.ForgotPassword)
			authGroup.POST("/reset-password", authHandler.ResetPassword)
		}

		// Auth (protected)
		authProtected := v1.Group("/auth")
		authProtected.Use(middleware.JWTAuthMiddleware(jwtService))
		{
			authProtected.GET("/me", authHandler.GetMe)
			authProtected.PUT("/profile", authHandler.UpdateProfile)
			authProtected.POST("/logout", authHandler.Logout)
			authProtected.POST("/logout-all", authHandler.LogoutAll)
		}

		// Collections (protected)
		collections := v1.Group("/collections")
		collections.Use(middleware.JWTAuthMiddleware(jwtService))
		{
			collections.GET("", collectionHandler.GetCollections)
			collections.POST("", collectionHandler.CreateCollection)
			collections.GET("/:id", collectionHandler.GetCollection)
			collections.PUT("/:id", collectionHandler.UpdateCollection)
			collections.DELETE("/:id", collectionHandler.DeleteCollection)
			collections.POST("/:id/items", collectionHandler.AddToCollection)
			collections.PUT("/:id/items/:itemId", collectionHandler.UpdateCollectionItem)
			collections.DELETE("/:id/items/:itemId", collectionHandler.RemoveFromCollection)
			collections.GET("/:id/summary", collectionHandler.GetCollectionSummary)
			collections.GET("/:id/insight", collectionHandler.GetPortfolioInsight)
		}

		// Price Alerts (protected)
		alerts := v1.Group("/alerts")
		alerts.Use(middleware.JWTAuthMiddleware(jwtService))
		{
			alerts.GET("", collectionHandler.GetPriceAlerts)
			alerts.POST("", collectionHandler.CreatePriceAlert)
			alerts.DELETE("/:id", collectionHandler.DeletePriceAlert)
		}

		// AI Assistant
		ai := v1.Group("/ai")
		{
			ai.POST("/ask", aiHandler.AskAI)
			ai.POST("/explain-card", cardHandler.ExplainCard)
			ai.POST("/suggest-decks", deckHandler.SuggestDecks)
		}
	}

	// Get port from env
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Server starting on port %s", port)
	if redis != nil {
		log.Println("Redis caching enabled")
	} else {
		log.Println("Redis caching disabled")
	}

	if err := router.Run(":" + port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}

// Security headers middleware
func securityHeadersMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Writer.Header().Set("X-Content-Type-Options", "nosniff")
		c.Writer.Header().Set("X-Frame-Options", "DENY")
		c.Writer.Header().Set("X-XSS-Protection", "1; mode=block")
		c.Writer.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		c.Next()
	}
}
