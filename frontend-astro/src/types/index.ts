// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// User Types
export interface User {
  id: string;
  email: string;
  username: string;
  full_name: string;
  avatar_url?: string;
  email_verified: boolean;
  last_login?: string;
  created_at: string;
  updated_at: string;
}

export interface AuthResponse {
  user: User;
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  username: string;
  password: string;
  full_name?: string;
}

// Card Types
export interface Card {
  id: string;
  external_id?: number;
  name_id: string;
  name_en?: string;
  category: 'Pokemon' | 'Trainer' | 'Energy';
  expansion_code?: string;
  collector_number?: string;
  regulation_mark?: string;
  rarity?: string;
  illustrator?: string;
  image_url?: string;
  hp?: number;
  card_type?: string;
  evolution_stage?: string;
  evolves_from?: string;
  retreat_cost?: number;
  attacks?: Record<string, any> | any[];
  abilities?: Record<string, any> | any[];
  weakness?: Record<string, any> | any[];
  resistance?: Record<string, any> | any[];
  pokedex?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

export interface CardSearchParams {
  q?: string;
  query?: string;
  expansion?: string;
  category?: string;
  type?: string;
  rarity?: string;
  page?: number;
  limit?: number;
  sort?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc' | string;
}

export interface CardFilters extends CardSearchParams {
  query?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  current_page: number;
  total_pages: number;
  total_count: number;
  has_more: boolean;
}

export interface CardSearchResponse {
  cards: Card[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

// Expansion Types
export interface Expansion {
  id: number;
  code: string;
  name_id?: string;
  name_en?: string;
  series_id?: number;
  series_name_en?: string;
  series_name_id?: string;
  product_type?: string;
  total_cards?: number;
  released_at?: string;
  pack_image_url?: string;
  set_symbol_url?: string;
}

// Deck Types
export interface Deck {
  id: string;
  external_id?: string;
  name: string;
  archetype?: string;
  format?: string;
  description?: string;
  total_price_idr?: number;
  total_price_usd?: number;
  tournament_count?: number;
  win_count?: number;
  top8_count?: number;
  user_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface DeckSearchResponse {
  decks: Deck[];
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

export interface DeckBuildRequest {
  strategy?: string;
  budget_idr?: number;
  budget?: number;
  budget_currency?: 'IDR' | 'USD';
  preferred_types?: string[];
  preferred_type?: string;
  key_cards?: string[];
  regulation_marks?: string[];
  name?: string;
  use_inventory?: boolean;
  collection_id?: string;
}

export interface DeckBuildResponse {
  deck_id: string;
  name: string;
  archetype?: string;
  description?: string;
  cards: {
    card_id: string;
    name: string;
    count: number;
  }[] | {
    pokemon: { card_id: string; card_name: string; count: number; price_idr?: number }[];
    trainer: { card_id: string; card_name: string; count: number; price_idr?: number }[];
    energy: { card_id: string; card_name: string; count: number; price_idr?: number }[];
  };
  total_cards: number;
  estimated_price_idr: number;
  strategy_explanation: string;
  pricing?: {
    total_idr: number;
    total_usd: number;
    within_budget: boolean;
  };
  analysis?: {
    strengths?: string[];
    weaknesses?: string[];
  };
}

// Price Types
export interface PriceComparison {
  card_id: string;
  card_name: string;
  prices: {
    source: string;
    price_idr?: number;
    price_usd?: number;
    condition: string;
    url?: string;
    updated_at?: string;
  }[];
  best_deal?: {
    source: string;
    price: number;
    currency: string;
  };
}

export interface ArbitrageOpportunity {
  card_id: string;
  card_name: string;
  expansion_code: string;
  idr_price: number;
  usd_price: number;
  usd_in_idr: number;
  profit_margin: number;
  potential_profit: number;
  recommendation: string;
}

export interface PricePrediction {
  card_id: string;
  current_price_idr: number;
  predicted_price: number;
  price_range_min: number;
  price_range_max: number;
  confidence_score: number;
  trend: 'up' | 'down' | 'stable';
  sentiment: string;
  factors: string[];
  forecast_days: number;
  updated_at: string;
}

// Tournament Types
export interface Tournament {
  id: string;
  external_id?: string;
  name: string;
  date?: string;
  format?: string;
  location?: string;
  player_count?: number;
  created_at?: string;
}

// Collection Types
export interface Collection {
  id: string;
  user_id: string;
  name: string;
  is_default?: boolean;
  total_cards?: number;
  total_value_idr?: number;
  items?: CollectionItem[];
  created_at?: string;
  updated_at?: string;
}

export interface CollectionItem {
  id: number;
  collection_id: string;
  card_id: string;
  quantity: number;
  condition: string;
  purchase_price?: number;
  purchase_currency?: string;
  purchase_date?: string;
  notes?: string;
  card?: Card;
}

export interface PriceAlert {
  id: string;
  user_id: string;
  card_id: string;
  target_price: number;
  condition: 'below' | 'above';
  is_active: boolean;
  created_at: string;
  card?: Card;
}

export interface CollectionSummary {
  collection_id: string;
  name: string;
  card_count: {
    total: number;
    unique: number;
    pokemon: number;
    trainer: number;
    energy: number;
  };
  value: {
    current_idr: number;
    current_usd: number;
    purchase_cost: number;
    profit_loss: number;
    profit_loss_pct: number;
  };
  expansions: {
    code: string;
    name: string;
    count: number;
  }[];
}

export interface PortfolioInsight {
  collection_id: string;
  value_history: {
    date: string;
    value: number;
  }[];
  type_distribution: {
    type: string;
    count: number;
  }[];
  rarity_distribution: {
    rarity: string;
    count: number;
  }[];
  expansion_progress: {
    code: string;
    name: string;
    collected: number;
    total_cards: number;
    percentage: number;
  }[];
  notable_movements: {
    card_id: string;
    name: string;
    change_percent: number;
    current_price: number;
    trend: 'up' | 'down';
  }[];
}

// PokeLab ID Research Types
export interface MissingCard {
  card_id: string;
  card_name: string;
  category: string;
  required_count: number;
  owned_count: number;
  missing_count: number;
  estimated_price_idr: number;
  total_estimated_idr: number;
  buy_priority: 'high' | 'medium' | 'low';
  substitute_suggestions?: string[];
}

export interface ResearchDeckRecommendation {
  deck_id: string;
  deck_name: string;
  archetype: string;
  tier: string;
  completeness_pct: number;
  owned_cards: number;
  required_cards: number;
  missing_cards: MissingCard[];
  estimated_upgrade_cost_idr: number;
  meta_score: number;
  recommendation_reason: string;
  ai_advice?: string;
}

export interface ResearchRecommendationsResponse {
  collection_id: string;
  recommendations: ResearchDeckRecommendation[];
}

export interface DeckGapAnalysis {
  collection_id: string;
  deck_id: string;
  deck_name: string;
  completeness_pct: number;
  owned_cards: number;
  required_cards: number;
  missing_cards: MissingCard[];
  estimated_upgrade_cost_idr: number;
}

export interface ResearchTournamentStats {
  tournament_count: number;
  win_count: number;
  top8_count: number;
}

export interface ResearchDeckSource {
  decklist_id: string;
  decklist_name: string;
  player_name: string;
  tournament_name: string;
  tournament_date: string;
  placement: number;
}

export interface ResearchCategoryBreakdown {
  category: string;
  required_count: number;
  owned_count: number;
  missing_count: number;
  completeness_pct: number;
}

export interface ResearchDeckStatistics {
  unique_cards: number;
  total_copies: number;
  pokemon_copies: number;
  trainer_copies: number;
  energy_copies: number;
  missing_unique_cards: number;
  missing_copies: number;
  high_priority_missing_cards: number;
  average_copies_per_card: number;
  max_copies: number;
  deck_value_idr: number;
  owned_value_idr: number;
  missing_value_idr: number;
  price_coverage_pct: number;
  consistency_score: number;
}

export interface ResearchCardStatistics {
  overall_rank: number;
  category_rank: number;
  deck_share_pct: number;
  owned_share_pct: number;
  missing_share_pct: number;
  missing_cost_share_pct: number;
  avg_copies_when_seen: number;
  meta_deck_appearances: number;
  meta_total_copies: number;
  copy_delta: number;
  ownership_status: 'missing' | 'partial' | 'complete' | 'extra' | 'unknown' | string;
}

export interface ResearchCardUsage {
  card_id: string;
  card_name: string;
  category: string;
  card_type?: string;
  required_count: number;
  owned_count: number;
  missing_count: number;
  coverage_pct: number;
  estimated_price_idr: number;
  total_missing_cost_idr: number;
  role: 'attacker' | 'engine' | 'draw' | 'search' | 'switch' | 'gust' | 'disruption' | 'stadium' | 'energy' | 'support' | string;
  importance_score: number;
  meta_frequency?: number;
  buy_priority: 'high' | 'medium' | 'low';
  substitutes?: string[];
  usage_note: string;
  statistics: ResearchCardStatistics;
}

export interface ResearchUpgradeStep {
  priority: 'high' | 'medium' | 'low';
  card_id: string;
  card_name: string;
  missing_count: number;
  estimated_cost_idr: number;
  reason: string;
}

export interface ResearchTacticalProfile {
  playstyle: string;
  game_plan: string[];
  strengths: string[];
  weaknesses: string[];
  key_cards: string[];
  matchup_notes: string[];
}

export interface ResearchDeckAnalysis {
  collection_id: string;
  deck_id: string;
  deck_name: string;
  archetype: string;
  tier: string;
  meta_score: number;
  completeness_pct: number;
  owned_cards: number;
  required_cards: number;
  estimated_upgrade_cost_idr: number;
  tournament_stats: ResearchTournamentStats;
  deck_source: ResearchDeckSource;
  deck_statistics: ResearchDeckStatistics;
  category_breakdown: ResearchCategoryBreakdown[];
  card_usage: ResearchCardUsage[];
  missing_cards: MissingCard[];
  upgrade_plan: ResearchUpgradeStep[];
  tactical_profile: ResearchTacticalProfile;
  data_quality_warnings: string[];
}

export interface AntiMetaRecommendation {
  target_deck_id: string;
  target_deck_name: string;
  counter_deck_id: string;
  counter_deck_name: string;
  archetype: string;
  counter_score: number;
  tech_cards: string[];
  matchup_notes: string[];
  ai_advice?: string;
}

export interface MetaPrediction {
  card_id: string;
  card_name: string;
  category: string;
  card_type?: string;
  rarity?: string;
  appearances: number;
  total_copies: number;
  prediction_score: number;
  trend: 'rising' | 'watch' | 'stable' | string;
  reason: string;
  factors: string[];
}

export interface AIResearchAdvice {
  question: string;
  answer: string;
  context?: string;
}
