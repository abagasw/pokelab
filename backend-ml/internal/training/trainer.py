"""Training pipeline for ML models."""

import mlflow
import sqlite3
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, List

import pandas as pd

from internal.models.price_models import ARIMAPredictor, PricePredictor
from internal.models.ranking_models import DeckRanker
from internal.models.anomaly_models import AnomalyDetector


@dataclass
class TrainingConfig:
    """Training configuration."""
    model_type: str = "arima"
    test_size: int = 7
    min_data_points: int = 30
    n_trials: int = 50
    mlflow_tracking: bool = True
    experiment_name: str = "pokemon-tcg-prediction"


class PricePredictionTrainer:
    """Training pipeline for price prediction models."""
    
    def __init__(self, db_path: str, config: TrainingConfig = None):
        self.db_path = db_path
        self.config = config or TrainingConfig()
        self.predictor = PricePredictor(
            model_type=self.config.model_type,
            model_dir=Path("models/saved")
        )
        
    def load_training_data(self, card_ids: List[str] = None) -> Dict[str, pd.Series]:
        \"\"\"Load price history for training.\"\"\"
        
        conn = sqlite3.connect(self.db_path)
        
        # Get cards with sufficient history
        if card_ids is None:
            query = \"\"\"
            SELECT card_id
            FROM price_history
            GROUP BY card_id
            HAVING COUNT(*) >= ?
            \"\"\"
            df = pd.read_sql_query(query, conn, params=(self.config.min_data_points,))
            card_ids = df["card_id"].tolist()
        
        price_data = {}
        for card_id in card_ids:
            try:
                query = \"\"\"
                SELECT recorded_at as date, price_idr as price
                FROM price_history
                WHERE card_id = ? AND currency = 'IDR'
                ORDER BY recorded_at ASC
                \"\"\"
                df = pd.read_sql_query(query, conn, params=(card_id,))
                
                if len(df) >= self.config.min_data_points:
                    df["date"] = pd.to_datetime(df["date"])
                    series = df.set_index("date")["price"]
                    price_data[card_id] = series
            except Exception as e:
                print(f"Error loading data for {card_id}: {e}")
        
        conn.close()
        return price_data
    
    def train(self, card_ids: List[str] = None) -> Dict[str, Dict[str, float]]:
        \"\"\"Train models for specified cards.\"\"\"
        
        print(f"Loading training data...")
        price_data = self.load_training_data(card_ids)
        print(f"Found {len(price_data)} cards with sufficient data")
        
        print(f"Training {self.config.model_type.upper()} models...")
        metrics = self.predictor.train_batch(
            price_data,
            test_size=self.config.test_size
        )
        
        print(f"Training complete. Metrics for {len(metrics)} models:")
        for card_id, card_metrics in metrics.items():
            if "error" not in card_metrics:
                print(f"  {card_id}: MAPE={card_metrics.get('mape', 0):.1f}%")
        
        return metrics
    
    def evaluate(self, test_size: int = 7) -> Dict[str, float]:
        \"\"\"Evaluate model performance on test set.\"\"\"
        
        price_data = self.load_training_data()
        
        overall_metrics = {"mae": [], "rmse": [], "mape": []}
        
        for card_id, prices in price_data.items():
            if len(prices) < test_size + self.config.min_data_points:
                continue
            
            # Train on all but test_size
            train = prices[:-test_size]
            test = prices[-test_size:]
            
            try:
                card_metrics = self.predictor.predictor.train(
                    card_id, train, test_size=0, mlflow_tracking=False
                )
                
                # Generate predictions
                pred = self.predictor.predictor.predict(card_id, horizon_days=test_size)
                
                # Calculate metrics (simplified)
                if test_size == 1:
                    actual = test.iloc[0]
                    predicted = pred.predicted_price
                    mae = abs(actual - predicted)
                    mape = abs((actual - predicted) / actual) * 100
                    
                    overall_metrics["mae"].append(mae)
                    overall_metrics["mape"].append(mape)
            except Exception as e:
                print(f"Error evaluating {card_id}: {e}")
        
        # Calculate overall metrics
        return {
            "mean_mae": np.mean(overall_metrics["mae"]) if overall_metrics["mae"] else 0,
            "mean_mape": np.mean(overall_metrics["mape"]) if overall_metrics["mape"] else 0,
            "num_models": len(overall_metrics["mae"]),
        }


class RankingTrainer:
    """Training pipeline for deck ranking models.\"\"\"
    
    def __init__(self, db_path: str, config: TrainingConfig = None):
        self.db_path = db_path
        self.config = config or TrainingConfig(model_type="ltr")
        self.ranker = DeckRanker(
            model_type=self.config.model_type,
            model_dir=Path("models/saved")
        )
        
    def load_training_data(self) -> pd.DataFrame:
        \"\"\"Load training data for ranking.\"\"\"
        
        conn = sqlite3.connect(self.db_path)
        
        # For ranking, we need user-deck interaction data
        # This would typically come from user clicks, deck building, etc.
        # For now, we'll create synthetic data based on completeness
        
        query = \"\"\"
        SELECT 
            d.id as deck_id,
            d.name as deck_name,
            d.tournament_count,
            d.win_count,
            d.top8_count,
            ci.collection_id,
            ci.user_id
        FROM decks d
        CROSS JOIN collections ci
        WHERE d.tournament_count > 0
        LIMIT 1000
        \"\"\"
        
        df = pd.read_sql_query(query, conn)
        conn.close()
        
        # Generate synthetic relevance scores
        # In production, this would come from actual user interactions
        np.random.seed(42)
        df["relevance"] = np.random.randint(0, 5, size=len(df))
        df["query_id"] = df["user_id"]
        
        return df
    
    def train(self, n_trials: int = 50) -> Dict[str, float]:
        \"\"\"Train ranking model.\"\"\"
        
        print("Loading training data...")
        training_data = self.load_training_data()
        print(f"Found {len(training_data)} training examples")
        
        print("Training ranking model...")
        metrics = self.ranker.train_batch(training_data, n_trials)
        
        print(f"Training complete. NDCG: {metrics.get('ndcg', 0):.3f}")
        
        return metrics


class AnomalyTrainer:
    \"\"\"Training pipeline for anomaly detection.\"\"\"
    
    def __init__(self, db_path: str, config: TrainingConfig = None):
        self.db_path = db_path
        self.config = config or TrainingConfig(model_type="price")
        self.detector = AnomalyDetector(
            model_type=self.config.model_type,
            model_dir=Path("models/saved")
        )
        
    def train(self) -> Dict[str, float]:
        \"\"\"Train anomaly detector.\"\"\"
        
        print("Loading price history...")
        conn = sqlite3.connect(self.db_path)
        
        query = \"\"\"
        SELECT 
            ph.card_id,
            ph.recorded_at as date,
            ph.price_idr as price
        FROM price_history ph
        WHERE ph.currency = 'IDR'
        ORDER BY ph.card_id, ph.recorded_at
        \"\"\"
        
        df = pd.read_sql_query(query, conn)
        conn.close()
        
        if df.empty:
            print("No price history found")
            return {}
        
        print(f"Training anomaly detector on {len(df)} price points...")
        metrics = self.detector.detector.train(df)
        
        print(f"Training complete. Anomaly rate: {metrics.get('anomaly_rate', 0):.2%}")
        
        return metrics


def train_all_models(db_path: str) -> Dict[str, Dict[str, float]]:
    \"\"\"Train all ML models.\"\"\"
    
    results = {}
    
    # Train price prediction
    print("=" * 60)
    print("TRAINING PRICE PREDICTION MODELS")
    print("=" * 60)
    price_trainer = PricePredictionTrainer(db_path)
    results["price_prediction"] = price_trainer.train()
    
    # Train ranking
    print(\"\\n\" + \"=\" * 60)
    print(\"TRAINING DECK RANKING MODELS\")
    print(\"=\" * 60)
    ranking_trainer = RankingTrainer(db_path)
    results[\"deck_ranking\"] = ranking_trainer.train()
    
    # Train anomaly detection
    print(\"\\n\" + \"=\" * 60)
    print(\"TRAINING ANOMALY DETECTION MODELS\")
    print(\"=\" * 60)
    anomaly_trainer = AnomalyTrainer(db_path)
    results[\"anomaly_detection\"] = anomaly_trainer.train()
    
    return results
