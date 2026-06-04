"""
Learning to Rank models for deck recommendation.

Implements LambdaMART and Gradient Boosting for ranking.
"""

import mlflow
import mlflow.sklearn
import numpy as np
import optuna
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Tuple

import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.metrics import ndcg_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler


@dataclass
class DeckRankingResult:
    """Deck ranking result."""
    user_id: str
    collection_id: str
    deck_id: str
    deck_name: str
    score: float
    rank: int
    features: Dict[str, float]
    explanation: Dict[str, float]
    predicted_at: datetime
    
    def to_dict(self) -> dict:
        return {
            "user_id": self.user_id,
            "collection_id": self.collection_id,
            "deck_id": self.deck_id,
            "deck_name": self.deck_name,
            "score": self.score,
            "rank": self.rank,
            "features": self.features,
            "explanation": self.explanation,
            "predicted_at": self.predicted_at.isoformat(),
        }


class LearningToRankModel:
    """Learning to Rank model using Gradient Boosting."""
    
    def __init__(self, model_dir: Path = Path("models/saved")):
        self.model_dir = model_dir
        self.model_dir.mkdir(parents=True, exist_ok=True)
        self.model: GradientBoostingRegressor = None
        self.scaler: StandardScaler = StandardScaler()
        self.feature_names: List[str] = []
        
    def prepare_features(
        self,
        deck_data: pd.DataFrame,
        user_inventory: pd.DataFrame,
        meta_signals: pd.DataFrame
    ) -> pd.DataFrame:
        \"\"\"Prepare ranking features.\"\"\"
        
        features = []
        
        for _, deck in deck_data.iterrows():
            feat = {
                # Meta score features
                "meta_score": deck.get("tournament_count", 0) * 4 + deck.get("win_count", 0) * 12,
                "win_rate": deck.get("win_count", 0) / max(deck.get("tournament_count", 1), 1),
                "top8_rate": deck.get("top8_count", 0) / max(deck.get("tournament_count", 1), 1),
                
                # Inventory features
                "completeness_pct": 0.0,  # Will be computed
                "owned_cards": 0,
                "missing_cards": 0,
                "upgrade_cost": 0.0,
                
                # Price features
                "deck_value": 0.0,
                "avg_card_price": 0.0,
                "price_volatility": 0.0,
                
                # Archetype features
                "archetype_popularity": 0.0,
                "recent_performance": 0.0,
                
                # User-deck affinity
                "user_deck_preference": 0.0,
                "playstyle_match": 0.0,
            }
            
            # Compute inventory coverage
            deck_cards = deck.get("cards", [])
            if deck_cards and not user_inventory.empty:
                owned = sum(1 for card in deck_cards if card in user_inventory["card_id"].values)
                feat["completeness_pct"] = owned / len(deck_cards) if deck_cards else 0
                feat["owned_cards"] = owned
                feat["missing_cards"] = len(deck_cards) - owned
            
            features.append(feat)
        
        return pd.DataFrame(features)
    
    def train(
        self,
        X: pd.DataFrame,
        y: pd.Series,
        query_ids: pd.Series,
        n_trials: int = 50,
        mlflow_tracking: bool = True
    ) -> Dict[str, float]:
        \"\"\"Train ranking model with hyperparameter tuning.\"\"\"
        
        if mlflow_tracking:
            mlflow.set_experiment("pokemon-tcg-deck-ranking")
            mlflow.start_run()
            mlflow.set_tag("model_type", "LTR")
        
        try:
            self.feature_names = X.columns.tolist()
            X_scaled = self.scaler.fit_transform(X)
            
            X_train, X_val, y_train, y_val = train_test_split(
                X_scaled, y, test_size=0.2, random_state=42
            )
            
            # Hyperparameter optimization with Optuna
            def objective(trial):
                params = {
                    "n_estimators": trial.suggest_int("n_estimators", 50, 300),
                    "max_depth": trial.suggest_int("max_depth", 3, 10),
                    "learning_rate": trial.suggest_float("learning_rate", 0.01, 0.3),
                    "subsample": trial.suggest_float("subsample", 0.6, 1.0),
                }
                
                model = GradientBoostingRegressor(**params, random_state=42)
                model.fit(X_train, y_train)
                
                y_pred = model.predict(X_val)
                mse = np.mean((y_pred - y_val) ** 2)
                return -mse  # Minimize negative MSE
            
            study = optuna.create_study(direction="maximize")
            study.optimize(objective, n_trials=n_trials)
            
            best_params = study.best_params
            print(f\"Best parameters: {best_params}\")
            
            # Train final model
            self.model = GradientBoostingRegressor(**best_params, random_state=42)
            self.model.fit(X_scaled, y)
            
            # Calculate NDCG (Normalized Discounted Cumulative Gain)
            # This is a ranking metric
            y_pred = self.model.predict(X_scaled)
            # Simplified NDCG calculation
            ndcg = self._calculate_ndcg(y, y_pred, query_ids)
            
            metrics = {
                "ndcg": ndcg,
                "best_params": best_params,
            }
            
            if mlflow_tracking:
                mlflow.log_params(best_params)
                mlflow.log_metrics({"ndcg": ndcg})
                mlflow.sklearn.log_model(self.model, "deck_ranking")
            
            return metrics
            
        finally:
            if mlflow_tracking:
                mlflow.end_run()
    
    def _calculate_ndcg(self, y_true: pd.Series, y_pred: np.ndarray, query_ids: pd.Series) -> float:
        \"\"\"Calculate NDCG score for ranking evaluation.\"\"\"
        # Group predictions by query (user)
        unique_queries = query_ids.unique()
        ndcg_scores = []
        
        for query_id in unique_queries:
            mask = query_ids == query_id
            query_true = y_true[mask].values
            query_pred = y_pred[mask]
            
            if len(query_true) > 1:
                # Reshape for ndcg_score
                try:
                    score = ndcg_score([query_true], [query_pred], k=10)
                    ndcg_scores.append(score)
                except:
                    pass
        
        return np.mean(ndcg_scores) if ndcg_scores else 0.0
    
    def predict(
        self,
        deck_data: pd.DataFrame,
        user_inventory: pd.DataFrame,
        meta_signals: pd.DataFrame,
        user_id: str,
        collection_id: str
    ) -> List[DeckRankingResult]:
        \"\"\"Generate ranked deck recommendations.\"\"\"
        
        if self.model is None:
            raise ValueError("Model not trained. Call train() first.")
        
        # Prepare features
        X = self.prepare_features(deck_data, user_inventory, meta_signals)
        X_scaled = self.scaler.transform(X)
        
        # Predict scores
        scores = self.model.predict(X_scaled)
        
        # Rank decks
        ranked_indices = np.argsort(scores)[::-1]
        
        results = []
        for rank, idx in enumerate(ranked_indices, 1):
            deck = deck_data.iloc[idx]
            score = scores[idx]
            
            # Feature importance for explanation
            importances = dict(zip(
                self.feature_names,
                self.model.feature_importances_
            ))
            
            result = DeckRankingResult(
                user_id=user_id,
                collection_id=collection_id,
                deck_id=deck["id"],
                deck_name=deck["name"],
                score=float(score),
                rank=rank,
                features=X.iloc[idx].to_dict(),
                explanation=importances,
                predicted_at=datetime.now(),
            )
            results.append(result)
        
        return results
    
    def save(self, path: Path):
        \"\"\"Save model to disk.\"\"\"
        import joblib
        joblib.dump({
            "model": self.model,
            "scaler": self.scaler,
            "feature_names": self.feature_names,
        }, path)
    
    def load(self, path: Path):
        \"\"\"Load model from disk.\"\"\"
        import joblib
        data = joblib.load(path)
        self.model = data["model"]
        self.scaler = data["scaler"]
        self.feature_names = data["feature_names"]


class DeckRanker:
    \"\"\"Factory for deck ranking models.\"\"\"
    
    def __init__(self, model_type: str = "ltr", model_dir: Path = Path("models/saved")):
        self.model_type = model_type
        if model_type == "ltr":
            self.model = LearningToRankModel(model_dir)
        else:
            raise ValueError(f"Unknown model type: {model_type}")
    
    def train_batch(
        self,
        training_data: pd.DataFrame,
        n_trials: int = 50
    ) -> Dict[str, float]:
        \"\"\"Train ranking model.\"\"\"
        # training_data should contain: features, relevance scores, query_ids
        X = training_data.drop(columns=["relevance", "query_id"])
        y = training_data["relevance"]
        query_ids = training_data["query_id"]
        
        return self.model.train(X, y, query_ids, n_trials)
