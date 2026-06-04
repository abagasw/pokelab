"""Meta feature engineering for tournament and meta analysis."""

from dataclasses import dataclass
from datetime import datetime
from typing import Dict, List

import numpy as np


@dataclass
class MetaFeatures:
    """Computed meta features for a card or deck."""
    card_id: str
    tournament_usage_count: int
    total_appearances: int
    meta_share_pct: float
    adoption_velocity: float  # Rate of increasing usage
    staple_index: float       # How essential across decks
    meta_momentum: float      # Trending up/down
    deck_diversity: float     # How many different decks use it
    
    def to_dict(self) -> dict:
        return {
            "card_id": self.card_id,
            "tournament_usage_count": self.tournament_usage_count,
            "total_appearances": self.total_appearances,
            "meta_share_pct": self.meta_share_pct,
            "adoption_velocity": self.adoption_velocity,
            "staple_index": self.staple_index,
            "meta_momentum": self.meta_momentum,
            "deck_diversity": self.deck_diversity,
        }


class MetaFeatureEngine:
    """Compute meta-related features."""
    
    def __init__(self, db_path: str):
        self.db_path = db_path
    
    def compute_card_meta(self, card_id: str) -> MetaFeatures:
        """Compute meta features for a single card."""
        return MetaFeatures(
            card_id=card_id,
            tournament_usage_count=0,
            total_appearances=0,
            meta_share_pct=0.0,
            adoption_velocity=0.0,
            staple_index=0.0,
            meta_momentum=0.0,
            deck_diversity=0.0,
        )
    
    def compute_deck_meta(self, deck_id: str) -> Dict:
        """Compute meta features for a deck."""
        return {
            "deck_id": deck_id,
            "meta_score": 0.0,
            "tier": "C",
            "momentum": "stable",
        }
