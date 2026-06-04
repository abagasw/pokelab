"""Dedicated price anomaly detector."""

from datetime import datetime
from typing import Dict, List

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

from internal.models.anomaly_models import Anomaly


class PriceAnomalyDetector:
    """Detect price spikes and arbitrage opportunities."""
    
    def __init__(self):
        self.scaler = StandardScaler()
        self.isolation_forest = IsolationForest(contamination=0.05, random_state=42)
        self._trained = False
    
    def train(self, price_history: pd.DataFrame) -> Dict[str, float]:
        """Train on historical price data grouped by card_id."""
        
        features = []
        for card_id, group in price_history.groupby("card_id"):
            if len(group) < 7:
                continue
            prices = group["price"].values
            features.append({
                "card_id": card_id,
                "mean_price": np.mean(prices),
                "std_price": np.std(prices),
                "volatility": np.std(prices) / (np.mean(prices) + 1e-6),
                "momentum": (prices[-1] - prices[0]) / (prices[0] + 1e-6),
            })
        
        if not features:
            return {"anomaly_rate": 0.0}
        
        df = pd.DataFrame(features)
        X = self.scaler.fit_transform(df.drop(columns=["card_id"]))
        self.isolation_forest.fit(X)
        self._trained = True
        
        predictions = self.isolation_forest.predict(X)
        return {"anomaly_rate": float(np.mean(predictions == -1))}
    
    def detect_spike(
        self,
        card_id: str,
        current_price: float,
        historical_prices: np.ndarray,
        threshold_std: float = 3.0
    ) -> Anomaly:
        """Detect if current price is an anomalous spike."""
        
        if len(historical_prices) < 10:
            return Anomaly(
                anomaly_type="price_spike", entity_id=card_id, entity_name="",
                anomaly_score=0.0, severity="low", detected_at=datetime.now(),
                features={}, explanation="Insufficient data",
                recommended_action="Collect more history",
            )
        
        mean_p = np.mean(historical_prices)
        std_p = np.std(historical_prices)
        z = abs(current_price - mean_p) / (std_p + 1e-6)
        
        severity = "high" if z > threshold_std * 2 else "medium" if z > threshold_std else "low"
        
        if current_price > mean_p:
            explanation = f"Price {current_price:.0f} is {z:.1f}σ above mean {mean_p:.0f}"
            action = "Arbitrage opportunity — investigate supply/demand"
        else:
            explanation = f"Price {current_price:.0f} is {z:.1f}σ below mean {mean_p:.0f}"
            action = "Price drop detected — check market conditions"
        
        return Anomaly(
            anomaly_type="price_spike", entity_id=card_id, entity_name="",
            anomaly_score=min(1.0, z / (threshold_std * 3)), severity=severity,
            detected_at=datetime.now(),
            features={"z_score": z, "current": current_price, "mean": mean_p, "std": std_p},
            explanation=explanation, recommended_action=action,
        )
    
    def detect_arbitrage(
        self,
        card_id: str,
        idr_price: float,
        usd_price: float,
        exchange_rate: float = 16400.0,
        min_margin: float = 0.2
    ) -> Anomaly:
        """Detect arbitrage opportunity between IDR and USD markets."""
        
        usd_in_idr = usd_price * exchange_rate
        margin = (usd_in_idr - idr_price) / (usd_in_idr + 1e-6)
        
        severity = "high" if margin > 0.4 else "medium" if margin > min_margin else "low"
        
        return Anomaly(
            anomaly_type="arbitrage", entity_id=card_id, entity_name="",
            anomaly_score=min(1.0, margin), severity=severity,
            detected_at=datetime.now(),
            features={"idr_price": idr_price, "usd_in_idr": usd_in_idr, "margin": margin},
            explanation=f"IDR {idr_price:.0f} vs USD {usd_price:.2f} ({usd_in_idr:.0f} IDR). Margin: {margin:.1%}",
            recommended_action="Buy in IDR, sell in USD market" if margin > min_margin else "No arbitrage",
        )
    
    def detect_batch(
        self,
        price_data: pd.DataFrame,
        threshold_std: float = 3.0
    ) -> List[Anomaly]:
        """Detect anomalies for multiple cards."""
        anomalies = []
        for card_id, group in price_data.groupby("card_id"):
            group = group.sort_values("date")
            if len(group) < 10:
                continue
            hist = group.iloc[:-1]["price"].values
            current = float(group.iloc[-1]["price"])
            a = self.detect_spike(card_id, current, hist, threshold_std)
            if a.anomaly_score > 0.1:
                anomalies.append(a)
        return anomalies
