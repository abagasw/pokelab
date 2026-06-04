"""Tournament outlier detector."""

from datetime import datetime
from typing import Dict

import numpy as np

from internal.models.anomaly_models import Anomaly


class TournamentOutlierDetector:
    """Detect unusual tournament results."""
    
    def __init__(self):
        self.baseline = None
    
    def fit(self, tournament_data: Dict):
        \"\"\"Compute baseline statistics.\"\"\"
        
        win_rates = [d.get(\"win_rate\", 0.5) for d in tournament_data.values()]
        t_counts = [d.get(\"tournament_count\", 0) for d in tournament_data.values()]
        
        self.baseline = {
            \"avg_win_rate\": np.mean(win_rates) if win_rates else 0.5,
            \"std_win_rate\": np.std(win_rates) if win_rates else 0.2,
            \"avg_tournament_count\": np.mean(t_counts) if t_counts else 5,
        }
    
    def detect_outlier(
        self,
        deck_stats: Dict
    ) -> Anomaly:
        \"\"\"Check if deck performance is outlier.\"\"\"
        
        if not self.baseline:
            return Anomaly(
                anomaly_type=\"tournament_outlier\",
                entity_id=deck_stats.get(\"deck_id\", \"unknown\"),
                entity_name=deck_stats.get(\"deck_name\", \"\"),
                anomaly_score=0.0, severity=\"low\",
                detected_at=datetime.now(),
                features={},
                explanation=\"Detector not trained\",
                recommended_action=\"Train on historical data\",
            )
        
        wr = deck_stats.get(\"win_rate\", 0)
        tc = deck_stats.get(\"tournament_count\", 0)
        
        wr_z = abs(wr - self.baseline[\"avg_win_rate\"]) / (self.baseline[\"std_win_rate\"] + 1e-6)
        score = min(1.0, wr_z / 3.0)
        severity = \"high\" if score > 0.7 else \"medium\" if score > 0.4 else \"low\"
        
        return Anomaly(
            anomaly_type=\"tournament_outlier\",
            entity_id=deck_stats.get(\"deck_id\", \"unknown\"),
            entity_name=deck_stats.get(\"deck_name\", \"\"),
            anomaly_score=score, severity=severity,
            detected_at=datetime.now(),
            features={\"win_rate\": wr, \"win_rate_z\": wr_z, \"tournament_count\": tc},
            explanation=f\"Deck has {wr:.1%} win rate vs {self.baseline['avg_win_rate']:.1%} baseline\",
            recommended_action=\"Investigate deck list or player skill for fraud/meta shift\",
        )
