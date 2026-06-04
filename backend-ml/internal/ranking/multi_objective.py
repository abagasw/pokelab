"""Multi-objective optimization for deck ranking."""

from dataclasses import dataclass
from typing import Dict, List

import numpy as np
from scipy.optimize import minimize


@dataclass
class OptimizedRanking:
    """Result of multi-objective optimization."""
    deck_id: str
    deck_name: str
    score: float
    objective_values: Dict[str, float]
    rank: int
    
    def to_dict(self) -> dict:
        return {
            "deck_id": self.deck_id,
            "deck_name": self.deck_name,
            "score": self.score,
            "objective_values": self.objective_values,
            "rank": self.rank,
        }


class MultiObjectiveOptimizer:
    \"\"\"Multi-objective optimization for deck recommendations.\"\"\"
    
    def __init__(self):
        self.weights = {
            "completeness": 0.30,  # Inventory coverage
            "meta_score": 0.25,    # Tournament performance
            "budget": 0.20,        # Affordability
            "playstyle": 0.15,    # User preference
            "price_trend": 0.10,   # Investment potential
        }
    
    def set_weights(self, weights: Dict[str, float]):
        \"\"\"Update objective weights.\"\"\"
        self.weights.update(weights)
        
    def normalize_features(self, features: List[Dict[str, float]]) -> np.ndarray:
        \"\"\"Normalize features to [0, 1] range.\"\"\"
        
        if not features:
            return np.array([])
        
        # Convert to array
        feature_keys = list(features[0].keys())
        X = np.array([[f.get(k, 0) for k in feature_keys] for f in features])
        
        # Min-max normalization
        X_min = X.min(axis=0)
        X_max = X.max(axis=0)
        
        # Avoid division by zero
        X_range = X_max - X_min
        X_range[X_range == 0] = 1
        
        X_normalized = (X - X_min) / X_range
        
        return X_normalized
    
    def compute_objectives(
        self,
        deck_features: Dict[str, float]
    ) -> Dict[str, float]:
        \"\"\"Compute individual objective values.\"\"\"
        
        return {
            "completeness": deck_features.get("completeness_pct", 0) / 100,
            "meta_score": min(1.0, deck_features.get("meta_score", 0) / 100),
            "budget": 1.0 - min(1.0, deck_features.get("budget_utilization", 0)),  # Lower is better
            "playstyle": deck_features.get("playstyle_match", 0),
            "price_trend": deck_features.get("price_momentum", 0.5),  # Normalized momentum
        }
    
    def weighted_sum(self, objectives: Dict[str, float]) -> float:
        \"\"\"Compute weighted sum of objectives.\"\"\"
        
        score = 0.0
        for obj_name, obj_value in objectives.items():
            weight = self.weights.get(obj_name, 0)
            score += weight * obj_value
        
        return score
    
    def optimize_rankings(
        self,
        decks: List[Dict],
        user_preferences: Dict[str, float] = None
    ) -> List[OptimizedRanking]:
        \"\"\"Optimize deck rankings using multi-objective optimization.\"\"\"
        
        if user_preferences:
            self.set_weights(user_preferences)
        
        rankings = []
        
        for deck in decks:
            # Compute objectives
            objectives = self.compute_objectives(deck)
            
            # Compute weighted score
            score = self.weighted_sum(objectives)
            
            rankings.append(OptimizedRanking(
                deck_id=deck.get("id", ""),
                deck_name=deck.get("name", ""),
                score=score,
                objective_values=objectives,
                rank=0,  # Will be set after sorting
            ))
        
        # Sort by score
        rankings.sort(key=lambda x: x.score, reverse=True)
        
        # Assign ranks
        for i, ranking in enumerate(rankings, 1):
            ranking.rank = i
        
        return rankings
    
    def pareto_front(
        self,
        decks: List[Dict]
    ) -> List[Dict]:
        \"\"\"Find Pareto-optimal decks (non-dominated solutions).\"\"\"
        
        # Compute objectives for all decks
        all_objectives = []
        for deck in decks:
            objectives = self.compute_objectives(deck)
            all_objectives.append(objectives)
        
        # Find non-dominated solutions
        pareto = []
        for i, obj_i in enumerate(all_objectives):
            dominated = False
            for j, obj_j in enumerate(all_objectives):
                if i == j:
                    continue
                
                # Check if obj_j dominates obj_i
                # obj_j dominates obj_i if it's better or equal in all objectives
                # and strictly better in at least one
                better_in_all = all(
                    obj_j[k] >= obj_i[k] for k in obj_i.keys()
                )
                better_in_some = any(
                    obj_j[k] > obj_i[k] for k in obj_i.keys()
                )
                
                if better_in_all and better_in_some:
                    dominated = True
                    break
            
            if not dominated:
                pareto.append(decks[i])
        
        return pareto
    
    def get_recommendation_explanation(
        self,
        ranking: OptimizedRanking
    ) -> Dict[str, str]:
        \"\"\"Generate explanation for ranking.\"\"\"
        
        explanations = {}
        
        for obj_name, obj_value in ranking.objective_values.items():
            weight = self.weights.get(obj_name, 0)
            contribution = weight * obj_value
            
            if obj_name == "completeness":
                explanations[obj_name] = f"{obj_value*100:.1f}% coverage (weight: {weight:.2f})"
            elif obj_name == "meta_score":
                explanations[obj_name] = f"Tournament performance {obj_value*100:.1f}/100 (weight: {weight:.2f})"
            elif obj_name == "budget":
                explanations[obj_name] = f"Affordability {obj_value*100:.1f}% (weight: {weight:.2f})"
            else:
                explanations[obj_name] = f"Score {obj_value:.2f} (weight: {weight:.2f})"
        
        return explanations


class PersonalizationEngine:
    \"\"\"Personalization using user feedback and preferences.\"\"\"
    
    def __init__(self, db_path: str):
        self.db_path = db_path
        self.user_preferences = {}
        
    def update_user_preferences(
        self,
        user_id: str,
        clicked_deck_id: str,
        feedback: int  # -1: negative, 0: neutral, 1: positive
    ):
        \"\"\"Update user preferences based on feedback.\"\"\"
        
        if user_id not in self.user_preferences:
            self.user_preferences[user_id] = {
                "clicked_decks": [],
                "feedback": [],
                "playstyle": "balanced",  # Default
            }
        
        self.user_preferences[user_id]["clicked_decks"].append(clicked_deck_id)
        self.user_preferences[user_id]["feedback"].append(feedback)
        
        # Update playstyle preference based on feedback
        # (In production, would analyze deck characteristics)
        feedback_list = self.user_preferences[user_id]["feedback"]
        if len(feedback_list) >= 3:
            avg_feedback = np.mean(feedback_list)
            if avg_feedback > 0.5:
                self.user_preferences[user_id]["playstyle"] = "aggressive"
            elif avg_feedback < -0.5:
                self.user_preferences[user_id]["playstyle"] = "control"
            else:
                self.user_preferences[user_id]["playstyle"] = "balanced"
    
    def get_personalization_weights(self, user_id: str) -> Dict[str, float]:
        \"\"\"Get personalized weights for multi-objective optimization.\"\"\"
        
        if user_id not in self.user_preferences:
            # Default weights
            return {
                "completeness": 0.30,
                "meta_score": 0.25,
                "budget": 0.20,
                "playstyle": 0.15,
                "price_trend": 0.10,
            }
        
        prefs = self.user_preferences[user_id]
        
        # Adjust weights based on user behavior
        weights = {
            "completeness": 0.30,
            "meta_score": 0.25,
            "budget": 0.20,
            "playstyle": 0.15,
            "price_trend": 0.10,
        }
        
        # If user prefers aggressive decks, increase playstyle weight
        if prefs["playstyle"] == "aggressive":
            weights["playstyle"] = 0.25
            weights["budget"] = 0.10
        elif prefs["playstyle"] == "control":
            weights["completeness"] = 0.35
            weights["playstyle"] = 0.20
        
        return weights
