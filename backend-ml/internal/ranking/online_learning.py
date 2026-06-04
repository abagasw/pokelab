"""Online learning from user feedback."""

from dataclasses import dataclass
from datetime import datetime
from typing import Dict, List

import numpy as np


@dataclass
class FeedbackEvent:
    """User feedback event."""
    user_id: str
    deck_id: str
    feedback_type: str  # 'click', 'build', 'favorite', 'skip', 'dislike'
    timestamp: datetime
    context: Dict  # What was shown to user
    
    def to_dict(self) -> dict:
        return {
            "user_id": self.user_id,
            "deck_id": self.deck_id,
            "feedback_type": self.feedback_type,
            "timestamp": self.timestamp.isoformat(),
            "context": self.context,
        }


class OnlineLearningEngine:
    """Online learning for real-time model updates."""
    
    def __init__(self, learning_rate: float = 0.01):
        self.learning_rate = learning_rate
        self.feedback_buffer: List[FeedbackEvent] = []
        self.model_weights: Dict[str, float] = {}
        self.update_count = 0
        
    def process_feedback(self, event: FeedbackEvent):
        \"\"\"Process single feedback event.\"\"\"
        
        self.feedback_buffer.append(event)
        
        # Convert feedback to reward signal
        reward = self._feedback_to_reward(event.feedback_type)
        
        # Update model weights
        deck_id = event.deck_id
        if deck_id not in self.model_weights:
            self.model_weights[deck_id] = 0.5  # Initial score
        
        # Online gradient update
        current_score = self.model_weights[deck_id]
        gradient = reward - current_score
        self.model_weights[deck_id] += self.learning_rate * gradient
        
        self.update_count += 1
        
        # Periodic buffer flush (in production, would persist to DB)
        if len(self.feedback_buffer) >= 100:
            self._flush_buffer()
    
    def _feedback_to_reward(self, feedback_type: str) -> float:
        \"\"\"Convert feedback type to reward signal.\"\"\"
        
        reward_map = {
            "click": 0.6,
            "build": 0.8,
            "favorite": 1.0,
            "skip": 0.3,
            "dislike": 0.0,
        }
        
        return reward_map.get(feedback_type, 0.5)
    
    def _flush_buffer(self):
        \"\"\"Flush feedback buffer.\"\"\"
        
        # In production, would:
        # 1. Persist feedback to database
        # 2. Update feature vectors
        # 3. Retrain model if enough data accumulated
        
        print(f\"Flushing {len(self.feedback_buffer)} feedback events\")
        self.feedback_buffer.clear()
    
    def get_deck_score(self, deck_id: str) -> float:
        \"\"\"Get online-learned score for a deck.\"\"\"
        
        return self.model_weights.get(deck_id, 0.5)
    
    def get_rankings(self, deck_ids: List[str]) -> List[str]:
        \"\"\"Get ranked list of decks based on online scores.\"\"\"
        
        scores = [(deck_id, self.get_deck_score(deck_id)) for deck_id in deck_ids]
        scores.sort(key=lambda x: x[1], reverse=True)
        
        return [deck_id for deck_id, _ in scores]
    
    def get_statistics(self) -> Dict:
        \"\"\"Get online learning statistics.\"\"\"
        
        return {
            "total_updates": self.update_count,
            "buffer_size": len(self.feedback_buffer),
            "tracked_decks": len(self.model_weights),
            "learning_rate": self.learning_rate,
        }
    
    def adjust_learning_rate(self, performance_trend: str):
        \"\"\"Adjust learning rate based on performance.\"\"\"
        
        if performance_trend == "improving":
            self.learning_rate *= 1.1  # Increase to learn faster
        elif performance_trend == "degrading":
            self.learning_rate *= 0.9  # Decrease to stabilize
        
        # Clamp learning rate
        self.learning_rate = max(0.001, min(0.1, self.learning_rate))
    
    def export_weights(self) -> Dict[str, float]:
        \"\"\"Export model weights for persistence.\"\"\"
        
        return {
            "weights": self.model_weights,
            "update_count": self.update_count,
            "learning_rate": self.learning_rate,
            "exported_at": datetime.now().isoformat(),
        }
    
    def import_weights(self, data: Dict):
        \"\"\"Import model weights from persistence.\"\"\"
        
        self.model_weights = data.get("weights", {})
        self.update_count = data.get("update_count", 0)
        self.learning_rate = data.get("learning_rate", 0.01)
