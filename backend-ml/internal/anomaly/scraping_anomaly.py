"""Scraping fraud detector."""

from datetime import datetime
from typing import List, Tuple

import numpy as np

from internal.models.anomaly_models import Anomaly


class ScrapingFraudDetector:
    """Detect fraudulent or erroneous scraped prices."""
    
    def detect_fraudulent_price(
        self,
        card_id: str,
        source: str,
        price: float,
        historical_prices: np.ndarray,
        other_sources: List[Tuple[str, float]]
    ) -> Anomaly:
        """Detect potentially fraudulent scraped price."""
        
        # Compare to historical
        hist_diff = 0.0
        if len(historical_prices) >= 5:
            mean_p = np.mean(historical_prices)
            hist_diff = abs(price - mean_p) / (mean_p + 1e-6)
        
        # Compare to other sources
        src_diff = 0.0
        if other_sources:
            median_p = np.median([p for _, p in other_sources])
            src_diff = abs(price - median_p) / (median_p + 1e-6) if median_p > 0 else 1.0
        
        fraud_score = max(hist_diff, src_diff)
        severity = "high" if fraud_score > 0.5 else "medium" if fraud_score > 0.3 else "low"
        
        if fraud_score > 0.3:
            explanation = f"Price from {source} differs by {fraud_score:.1%} from expected"
            action = "Verify source and re-scrape"
        else:
            explanation = "Price within expected range"
            action = "No action needed"
        
        return Anomaly(
            anomaly_type="scraping_fraud", entity_id=card_id,
            entity_name=f"Source: {source}",
            anomaly_score=fraud_score, severity=severity,
            detected_at=datetime.now(),
            features={"historical_diff": hist_diff, "source_diff": src_diff},
            explanation=explanation, recommended_action=action,
        )
    
    def detect_batch(
        self,
        scraped_prices: List[Dict],
        historical_data: Dict[str, np.ndarray]
    ) -> List[Anomaly]:
        """Detect fraud in batch of scraped prices."""
        
        anomalies = []
        for entry in scraped_prices:
            card_id = entry["card_id"]
            source = entry["source"]
            price = entry["price"]
            
            hist = historical_data.get(card_id, np.array([]))
            other = [(e["source"], e["price"]) for e in scraped_prices
                     if e["card_id"] == card_id and e["source"] != source]
            
            a = self.detect_fraudulent_price(card_id, source, price, hist, other)
            if a.anomaly_score > 0.2:
                anomalies.append(a)
        
        return anomalies
