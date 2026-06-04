"""Feature store for managing and caching features."""

from datetime import datetime
from pathlib import Path
from typing import Dict, List

import numpy as np
import pandas as pd


class FeatureStore:
    """Centralized feature storage and retrieval."""
    
    def __init__(self, db_path: str):
        self.db_path = db_path
        self._cache: Dict[str, pd.DataFrame] = {}
        self._last_updated: Dict[str, datetime] = {}
    
    def get_features(self, entity_type: str, entity_ids: List[str]) -> pd.DataFrame:
        """Get features for entities."""
        
        cache_key = entity_type
        
        if cache_key in self._cache:
            df = self._cache[cache_key]
            return df[df["id"].isin(entity_ids)]
        
        return pd.DataFrame()
    
    def update_features(self, entity_type: str, features: pd.DataFrame):
        """Update cached features."""
        
        self._cache[entity_type] = features
        self._last_updated[entity_type] = datetime.now()
    
    def is_stale(self, entity_type: str, max_age_hours: int = 24) -> bool:
        """Check if features are stale."""
        
        if entity_type not in self._last_updated:
            return True
        
        age = (datetime.now() - self._last_updated[entity_type]).total_seconds() / 3600
        return age > max_age_hours
