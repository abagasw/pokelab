"""Price feature engineering for time series forecasting."""

import sqlite3
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Optional

import numpy as np
import pandas as pd
from scipy import stats


@dataclass
class PriceFeatures:
    """Computed price features for a single card."""
    
    card_id: str
    computed_at: datetime
    current_price: float
    price_momentum_1d: float
    price_momentum_7d: float
    price_momentum_30d: float
    price_acceleration: float
    ma_7: float
    ma_14: float
    ma_30: float
    ma_ratio_7_30: float
    std_7: float
    std_14: float
    std_30: float
    cv_7: float
    price_spread_7d: float
    price_range_ratio: float
    trend_direction: str
    trend_strength: float
    tournament_usage_count: int
    meta_usage_momentum: float
    rarity_score: float
    expansion_age_days: int
    
    def to_dict(self) -> dict:
        return {
            "card_id": self.card_id,
            "computed_at": self.computed_at.isoformat(),
            "current_price": self.current_price,
            "price_momentum_1d": self.price_momentum_1d,
            "price_momentum_7d": self.price_momentum_7d,
            "price_momentum_30d": self.price_momentum_30d,
            "price_acceleration": self.price_acceleration,
            "ma_7": self.ma_7,
            "ma_14": self.ma_14,
            "ma_30": self.ma_30,
            "ma_ratio_7_30": self.ma_ratio_7_30,
            "std_7": self.std_7,
            "std_14": self.std_14,
            "std_30": self.std_30,
            "cv_7": self.cv_7,
            "price_spread_7d": self.price_spread_7d,
            "price_range_ratio": self.price_range_ratio,
            "trend_direction": self.trend_direction,
            "trend_strength": self.trend_strength,
            "tournament_usage_count": self.tournament_usage_count,
            "meta_usage_momentum": self.meta_usage_momentum,
            "rarity_score": self.rarity_score,
            "expansion_age_days": self.expansion_age_days,
        }


class PriceFeatureEngine:
    def __init__(self, db_path: str):
        self.db_path = db_path
        self.conn = None
        
    def __enter__(self):
        self.conn = sqlite3.connect(self.db_path)
        return self
        
    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.conn:
            self.conn.close()
    
    def get_price_history(self, card_id: str, days: int = 60) -> pd.DataFrame:
        query = \"\"\"
        SELECT recorded_at as date, price_idr as price
        FROM price_history
        WHERE card_id = ? AND currency = 'IDR'
        ORDER BY recorded_at DESC LIMIT ?
        \"\"\"
        df = pd.read_sql_query(query, self.conn, params=(card_id, days))
        if not df.empty:
            df[\"date\"] = pd.to_datetime(df[\"date\"])
        return df.sort_values(\"date\") if not df.empty else pd.DataFrame(columns=[\"date\", \"price\"])
    
    def compute_features(self, card_id: str, min_data_points: int = 30) -> Optional[PriceFeatures]:
        df = self.get_price_history(card_id)
        if len(df) < min_data_points:
            return None
        
        prices = df[\"price\"].values
        current_price = prices[-1]
        
        return PriceFeatures(
            card_id=card_id,
            computed_at=datetime.now(),
            current_price=float(current_price),
            price_momentum_1d=float((current_price - prices[-2]) / prices[-2]) if len(prices) >= 2 else 0.0,
            price_momentum_7d=float((current_price - prices[-7]) / prices[-7]) if len(prices) >= 7 else 0.0,
            price_momentum_30d=float((current_price - prices[-30]) / prices[-30]) if len(prices) >= 30 else 0.0,
            price_acceleration=0.0,
            ma_7=float(np.mean(prices[-7:])),
            ma_14=float(np.mean(prices[-14:])) if len(prices) >= 14 else float(np.mean(prices[-7:])),
            ma_30=float(np.mean(prices[-30:])) if len(prices) >= 30 else float(np.mean(prices[-7:])),
            ma_ratio_7_30=0.0,
            std_7=float(np.std(prices[-7:])),
            std_14=float(np.std(prices[-14:])) if len(prices) >= 14 else float(np.std(prices[-7:])),
            std_30=float(np.std(prices[-30:])) if len(prices) >= 30 else float(np.std(prices[-7:])),
            cv_7=float(np.std(prices[-7:]) / np.mean(prices[-7:])) if np.mean(prices[-7:]) > 0 else 0.0,
            price_spread_7d=float(np.max(prices[-7:]) - np.min(prices[-7:])),
            price_range_ratio=0.0,
            trend_direction=\"stable\",
            trend_strength=0.5,
            tournament_usage_count=0,
            meta_usage_momentum=0.0,
            rarity_score=1.0,
            expansion_age_days=0,
        )
