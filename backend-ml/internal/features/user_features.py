"""User feature engineering."""

from dataclasses import dataclass
from datetime import datetime
from typing import List


@dataclass
class UserFeatures:
    """Computed features for a user."""
    user_id: str
    total_cards: int
    total_value: float
    collection_completeness: float
    favorite_archetypes: List[str]
    budget_preference: str  # 'budget', 'mid', 'premium'
    playstyle: str
    
    def to_dict(self) -> dict:
        return {
            "user_id": self.user_id,
            "total_cards": self.total_cards,
            "total_value": self.total_value,
            "collection_completeness": self.collection_completeness,
            "favorite_archetypes": self.favorite_archetypes,
            "budget_preference": self.budget_preference,
            "playstyle": self.playstyle,
        }


class UserFeatureEngine:
    """Compute user-related features."""
    
    def compute_features(self, user_id: str) -> UserFeatures:
        """Compute features for a user."""
        return UserFeatures(
            user_id=user_id,
            total_cards=0,
            total_value=0.0,
            collection_completeness=0.0,
            favorite_archetypes=[],
            budget_preference="mid",
            playstyle="balanced",
        )
