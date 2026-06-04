"""
Anomaly detection models for price spikes and tournament outliers.

Implements statistical and ML-based anomaly detection.
"""

import mlflow
import mlflow.sklearn
import numpy as np
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Tuple

import pandas as pd
from scipy import stats
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler


@dataclass
class Anomaly:
    """Detected anomaly result."""
    anomaly_type: str  # 'price_spike', 'tournament_outlier', 'scraping_fraud'
    entity_id: str
    entity_name: str
    anomaly_score: float
    severity: str  # 'low', 'medium', 'high'
    detected_at: datetime
    features: Dict[str, float]
    explanation: str
    recommended_action: str
    
    def to_dict(self) -> dict:
        return {
            "anomaly_type": self.anomaly_type,
            "entity_id": self.entity_id,
            "entity_name": self.entity_name,
            "anomaly_score": self.anomaly_score,
            "severity": self.severity,
            "detected_at": self.detected_at.isoformat(),
            "features": self.features,
            "explanation": self.explanation,
            "recommended_action": self.recommended_action,
        }


class PriceAnomalyDetector:
    """Detect price anomalies using statistical and ML methods."""
    
    def __init__(self, model_dir: Path = Path("models/saved")):
        self.model_dir = model_dir
        self.model_dir.mkdir(parents=True, exist_ok=True)
        self.scaler = StandardScaler()
        self.isolation_forest = IsolationForest(
            contamination=0.05,  # Expect 5% anomalies
            random_state=42
        )
        
    def train(self, price_history: pd.DataFrame) -> Dict[str, float]:
        \"\"\"Train anomaly detector on historical price data.\"\"\"
        
        # Prepare features: price, volume, volatility
        features = []
        for card_id, group in price_history.groupby("card_id"):
            if len(group) < 7:
                continue
            
            prices = group["price"].values
            feature = {
                "card_id": card_id,
                "mean_price": np.mean(prices),
                "std_price": np.std(prices),
                "min_price": np.min(prices),
                "max_price": np.max(prices),
                "price_range": np.max(prices) - np.min(prices),
                "volatility": np.std(prices) / (np.mean(prices) + 1e-6),
                "momentum": (prices[-1] - prices[0]) / (prices[0] + 1e-6),
            }
            features.append(feature)
        
        df = pd.DataFrame(features)
        X = df.drop(columns=["card_id"])
        X_scaled = self.scaler.fit_transform(X)
        
        # Train isolation forest
        self.isolation_forest.fit(X_scaled)
        
        # Calculate metrics
        predictions = self.isolation_forest.predict(X_scaled)
        anomaly_rate = np.mean(predictions == -1)
        
        return {"anomaly_rate": anomaly_rate}
    
    def detect_price_spike(
        self,
        card_id: str,
        current_price: float,
        historical_prices: pd.Series,
        threshold_std: float = 3.0
    ) -> Anomaly:
        \"\"\"Detect if current price is anomalous spike.\"\"\"
        
        if len(historical_prices) < 10:
            return Anomaly(
                anomaly_type="price_spike",
                entity_id=card_id,
                entity_name="Unknown",
                anomaly_score=0.0,
                severity="low",
                detected_at=datetime.now(),
                features={"insufficient_data": 1.0},
                explanation="Insufficient historical data for spike detection",
                recommended_action="Collect more price history",
            )
        
        # Statistical test: z-score
        mean_price = np.mean(historical_prices)
        std_price = np.std(historical_prices)
        z_score = abs(current_price - mean_price) / (std_price + 1e-6)
        
        # Determine severity
        if z_score > threshold_std * 2:
            severity = "high"
        elif z_score > threshold_std:
            severity = "medium"
        else:
            severity = "low"
        
        # Calculate anomaly score (0-1)
        anomaly_score = min(1.0, z_score / (threshold_std * 3))
        
        # Generate explanation
        if current_price > mean_price:
            explanation = f"Price {current_price:.0f} is {z_score:.1f}σ above mean {mean_price:.0f}"
            recommended_action = "Potential arbitrage opportunity - investigate further"
        else:
            explanation = f"Price {current_price:.0f} is {z_score:.1f}σ below mean {mean_price:.0f}"
            recommended_action = "Price drop - consider buying or investigate market conditions"
        
        return Anomaly(
            anomaly_type="price_spike",
            entity_id=card_id,
            entity_name="Unknown",  # Would need to look up
            anomaly_score=anomaly_score,
            severity=severity,
            detected_at=datetime.now(),
            features={
                "z_score": z_score,
                "current_price": current_price,
                "mean_price": mean_price,
                "std_price": std_price,
                "price_change_pct": ((current_price - mean_price) / mean_price) * 100,
            },
            explanation=explanation,
            recommended_action=recommended_action,
        )
    
    def detect_batch(
        self,
        price_data: pd.DataFrame,
        threshold_std: float = 3.0
    ) -> List[Anomaly]:
        \"\"\"Detect anomalies for multiple cards.\"\"\"
        
        anomalies = []
        
        for card_id, group in price_data.groupby("card_id"):
            group = group.sort_values("date")
            historical = group.iloc[:-1]["price"]
            current = group.iloc[-1]["price"]
            
            try:
                anomaly = self.detect_price_spike(
                    card_id, current, historical, threshold_std
                )
                if anomaly.anomaly_score > 0.1:  # Only report significant anomalies
                    anomalies.append(anomaly)
            except Exception as e:
                print(f"Error detecting anomaly for {card_id}: {e}")
        
        return anomalies


class TournamentOutlierDetector:
    \"\"\"Detect unusual tournament results.\"\"\"
    
    def __init__(self, model_dir: Path = Path("models/saved")):
        self.model_dir = model_dir
        self.model_dir.mkdir(parents=True, exist_ok=True)
        
    def detect_outlier_deck(
        self,
        deck_stats: Dict,
        baseline_stats: Dict
    ) -> Anomaly:
        \"\"\"Detect if deck performance is outlier.\"\"\"
        
        # Compare deck stats to baseline
        win_rate = deck_stats.get("win_rate", 0)
        baseline_win_rate = baseline_stats.get("avg_win_rate", 0.5)
        
        tournament_count = deck_stats.get("tournament_count", 0)
        baseline_tournament_count = baseline_stats.get("avg_tournament_count", 5)
        
        # Calculate z-scores
        win_rate_z = abs(win_rate - baseline_win_rate) / 0.2  # Assume 20% std
        tournament_z = abs(tournament_count - baseline_tournament_count) / 3
        
        # Combined anomaly score
        anomaly_score = max(win_rate_z, tournament_z) / 3
        
        severity = "high" if anomaly_score > 0.7 else "medium" if anomaly_score > 0.4 else "low"
        
        return Anomaly(
            anomaly_type="tournament_outlier",
            entity_id=deck_stats.get("deck_id", "unknown"),
            entity_name=deck_stats.get("deck_name", "Unknown"),
            anomaly_score=anomaly_score,
            severity=severity,
            detected_at=datetime.now(),
            features={
                "win_rate": win_rate,
                "win_rate_z": win_rate_z,
                "tournament_count": tournament_count,
                "tournament_z": tournament_z,
            },
            explanation=f"Deck has {win_rate:.1%} win rate vs {baseline_win_rate:.1%} baseline",
            recommended_action="Investigate deck list and player skill for fraud or meta shift",
        )


class ScrapingFraudDetector:
    \"\"\"Detect fraudulent or erroneous scraped data.\"\"\"
    
    def __init__(self, model_dir: Path = Path("models/saved")):
        self.model_dir = model_dir
        self.model_dir.mkdir(parents=True, exist_ok=True)
        
    def detect_fraudulent_price(
        self,
        card_id: str,
        source: str,
        price: float,
        historical_prices: pd.Series,
        other_sources: List[Tuple[str, float]]
    ) -> Anomaly:
        \"\"\"Detect potentially fraudulent scraped price.\"\"\"
        
        # Check 1: Compare to historical
        if len(historical_prices) >= 5:
            mean_price = np.mean(historical_prices)
            historical_diff = abs(price - mean_price) / mean_price
        else:
            historical_diff = 0
        
        # Check 2: Compare to other sources
        if other_sources:
            other_prices = [p for _, p in other_sources]
            median_price = np.median(other_prices)
            source_diff = abs(price - median_price) / median_price if median_price > 0 else 1
        else:
            source_diff = 0
        
        # Combined fraud score
        fraud_score = max(historical_diff, source_diff)
        
        severity = "high" if fraud_score > 0.5 else "medium" if fraud_score > 0.3 else "low"
        
        if fraud_score > 0.3:
            explanation = f"Price from {source} differs by {fraud_score:.1%} from expected"
            recommended_action = "Verify source and re-scrape"
        else:
            explanation = "Price within expected range"
            recommended_action = "No action"
        
        return Anomaly(
            anomaly_type="scraping_fraud",
            entity_id=card_id,
            entity_name=f"Source: {source}",
            anomaly_score=fraud_score,
            severity=severity,
            detected_at=datetime.now(),
            features={
                "historical_diff": historical_diff,
                "source_diff": source_diff,
                "price": price,
                "source": source,
            },
            explanation=explanation,
            recommended_action=recommended_action,
        )


class AnomalyDetector:
    \"\"\"Factory for anomaly detection models.\"\"\"
    
    def __init__(self, model_type: str = "price", model_dir: Path = Path("models/saved")):
        self.model_type = model_type
        if model_type == "price":
            self.detector = PriceAnomalyDetector(model_dir)
        elif model_type == "tournament":
            self.detector = TournamentOutlierDetector(model_dir)
        elif model_type == "scraping":
            self.detector = ScrapingFraudDetector(model_dir)
        else:
            raise ValueError(f"Unknown model type: {model_type}")
    
    def detect_batch(self, data: pd.DataFrame, **kwargs) -> List[Anomaly]:
        \"\"\"Detect anomalies in batch.\"\"\"
        return self.detector.detect_batch(data, **kwargs)
