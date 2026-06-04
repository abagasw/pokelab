// ML Types
export interface MLPredictionRequest {
  card_ids: string[];
  horizon_days?: number;
}

export interface MLPredictionResponse {
  predictions: MLPricePrediction[];
  model_version: string;
  generated_at: string;
}

export interface MLPricePrediction {
  card_id: string;
  predicted_price: number;
  confidence_min: number;
  confidence_max: number;
  confidence_score: number;
  trend: 'up' | 'down' | 'stable';
  model_version: string;
  predicted_at: string;
  horizon_days: number;
  factors?: string[];
}

export interface MLAnomalyDetectionRequest {
  card_ids: string[];
  threshold_std?: number;
}

export interface MLAnomaly {
  anomaly_type: 'price_spike' | 'arbitrage' | 'tournament_outlier' | 'scraping_fraud';
  entity_id: string;
  entity_name: string;
  anomaly_score: number;
  severity: 'low' | 'medium' | 'high';
  detected_at: string;
  features: Record<string, number>;
  explanation: string;
  recommended_action: string;
}

export interface MLAnomalyResponse {
  anomalies: MLAnomaly[];
}

export interface MLModelInfo {
  price_prediction: {
    type: string;
    loaded: boolean;
    version: string;
  };
  deck_ranking: {
    type: string;
    loaded: boolean;
    version: string;
  };
  anomaly_detection: {
    type: string;
    loaded: boolean;
    version: string;
  };
}

export interface MLDeckRankingRequest {
  user_id: string;
  collection_id: string;
  deck_ids: string[];
  top_k?: number;
}

export interface MLDeckRanking {
  user_id: string;
  collection_id: string;
  deck_id: string;
  deck_name: string;
  score: number;
  rank: number;
  features: Record<string, number>;
  explanation: Record<string, number>;
  predicted_at: string;
}

export interface MLTrainingMetrics {
  model_type: string;
  model_version: string;
  timestamp: string;
  mae?: number;
  rmse?: number;
  mape?: number;
  ndcg?: number;
  anomaly_rate?: number;
}
