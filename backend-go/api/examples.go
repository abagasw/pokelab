package api

// Contoh penggunaan API Pokemon TCG Indonesia
//
// File ini berisi contoh request dan response untuk setiap endpoint API

// ===== CARDS =====

// Contoh: Search Cards
// Request: GET /api/v1/cards?name=Pikachu&limit=10
// Response:
/*
{
  "success": true,
  "data": [
    {
      "id": "SV1S-1-pikachu",
      "name_id": "Pikachu",
      "name_en": "Pikachu",
      "expansion_code": "SV1S",
      "collector_number": "1",
      "rarity": "C",
      "category": "Pokemon",
      "hp": 60,
      "card_type": "Lightning"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 150,
    "total_pages": 15
  }
}
*/

// Contoh: Get Card by ID
// Request: GET /api/v1/cards/SV1S-1-pikachu
// Response:
/*
{
  "success": true,
  "data": {
    "id": "SV1S-1-pikachu",
    "name_id": "Pikachu",
    "name_en": "Pikachu",
    "expansion_code": "SV1S",
    "collector_number": "1",
    "rarity": "C",
    "category": "Pokemon",
    "hp": 60,
    "card_type": "Lightning",
    "attacks": [
      {
        "name": "Thunder Shock",
        "damage": "30",
        "energy_cost": ["Lightning"]
      }
    ],
    "prices": {
      "idr": 15000,
      "usd": 0.50,
      "exchange_rate": 16400
    }
  }
}
*/

// ===== DECKS =====

// Contoh: Build Deck
// Request: POST /api/v1/decks/build
// Body:
/*
{
  "name": "Budget Deck",
  "budget": 500000,
  "budget_currency": "IDR",
  "preferred_type": "Fire"
}
*/
// Response:
/*
{
  "success": true,
  "data": {
    "name": "Budget Deck",
    "archetype": "Charizard ex",
    "cards": {
      "pokemon": [
        {"card_id": "SV1S-1", "card_name": "Charizard ex", "count": 2}
      ],
      "trainer": [
        {"card_id": "SV1S-150", "card_name": "Ultra Ball", "count": 4}
      ],
      "energy": [
        {"card_id": "SV1S-200", "card_name": "Fire Energy", "count": 18}
      ]
    },
    "pricing": {
      "total_idr": 485000,
      "total_usd": 29.57,
      "within_budget": true
    }
  }
}
*/

// ===== BATTLE SIMULATOR =====

// Contoh: Simulate Battle
// Request: POST /api/v1/battle/simulate
// Body:
/*
{
  "card1_id": "SV1S-1-charizard",
  "card2_id": "SV1S-2-blastoise"
}
*/
// Response:
/*
{
  "success": true,
  "data": {
    "card1": "Charizard",
    "card2": "Blastoise",
    "winner": "Blastoise",
    "card1_damage": 120,
    "card2_damage": 160,
    "turns_to_win": 2,
    "analysis": "Blastoise memiliki keunggulan tipe Water terhadap Fire..."
  }
}
*/

// ===== PRICES =====

// Contoh: Get Arbitrage Opportunities
// Request: GET /api/v1/prices/arbitrage?min_difference=20&limit=10
// Response:
/*
{
  "success": true,
  "data": {
    "opportunities": [
      {
        "card_id": "SV1S-100",
        "card_name": "Mewtwo ex",
        "expansion_code": "SV1S",
        "idr_price": 500000,
        "usd_price": 20.00,
        "usd_in_idr": 328000,
        "profit_margin": 0.34,
        "potential_profit": 172000,
        "recommendation": "Strong Buy in ID"
      }
    ],
    "total": 1,
    "exchange_rate": 16400,
    "min_margin": 0.20
  }
}
*/

// ===== META =====

// Contoh: Get Meta Overview
// Request: GET /api/v1/meta/overview
// Response:
/*
{
  "success": true,
  "data": {
    "period": {
      "start_date": "2024-01-01",
      "end_date": "2024-01-31"
    },
    "total_tournaments": 24,
    "total_players": 5584,
    "deck_popularity": [
      {
        "deck_id": "1",
        "deck_name": "Dragapult ex",
        "appearances": 150,
        "win_rate": 52.3
      }
    ]
  }
}
*/

// ===== COLLECTIONS =====

// Contoh: Add to Collection
// Request: POST /api/v1/collections/123/items
// Body:
/*
{
  "card_id": "550e8400-e29b-41d4-a716-446655440000",
  "quantity": 2,
  "condition": "NM",
  "purchase_price": 150000,
  "purchase_currency": "IDR"
}
*/
// Response:
/*
{
  "success": true,
  "data": {
    "message": "Added to collection"
  }
}
*/
