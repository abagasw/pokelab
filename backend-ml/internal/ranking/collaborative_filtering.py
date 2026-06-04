"""Collaborative filtering for personalized recommendations."""

from dataclasses import dataclass
from datetime import datetime
from typing import Dict, List, Tuple

import numpy as np
from scipy.sparse import csr_matrix
from sklearn.metrics.pairwise import cosine_similarity


@dataclass
class UserDeckAffinity:
    """User-deck affinity score from collaborative filtering."""
    user_id: str
    deck_id: str
    affinity_score: float
    computed_at: datetime
    
    # Explanation
    similar_users: List[str]
    common_decks: List[str]
    
    def to_dict(self) -> dict:
        return {
            "user_id": self.user_id,
            "deck_id": self.deck_id,
            "affinity_score": self.affinity_score,
            "computed_at": self.computed_at.isoformat(),
            "similar_users": self.similar_users,
            "common_decks": self.common_decks,
        }


class CollaborativeFilteringRecommender:
    """Collaborative filtering for personalized deck recommendations."""
    
    def __init__(self, db_path: str):
        self.db_path = db_path
        self.user_deck_matrix = None
        self.user_similarity = None
        
    def load_interaction_matrix(self) -> csr_matrix:
        \"\"\"Load user-deck interaction matrix.\"\"\"
        
        import sqlite3
        conn = sqlite3.connect(self.db_path)
        
        # Get user-deck interactions
        # In production, this would come from clicks, favorites, builds, etc.
        query = \"\"\"
        SELECT 
            user_id,
            deck_id,
            1 as interaction  # Binary interaction
        FROM deck_favorites
        UNION ALL
        SELECT 
            ci.user_id,
            dc.deck_id,
            1 as interaction
        FROM collection_items ci
        JOIN deck_cards dc ON ci.card_id = dc.card_id
        WHERE ci.quantity > 0
        \"\"\"
        
        df = pd.read_sql_query(query, conn)
        conn.close()
        
        if df.empty:
            return csr_matrix((0, 0))
        
        # Create user-item matrix
        unique_users = df["user_id"].unique()
        unique_decks = df["deck_id"].unique()
        
        user_map = {uid: idx for idx, uid in enumerate(unique_users)}
        deck_map = {did: idx for idx, did in enumerate(unique_decks)}
        
        rows = df["user_id"].map(user_map)
        cols = df["deck_id"].map(deck_map)
        data = df["interaction"]
        
        matrix = csr_matrix(
            (data, (rows, cols)),
            shape=(len(unique_users), len(unique_decks))
        )
        
        self.user_deck_matrix = matrix
        self.user_ids = unique_users
        self.deck_ids = unique_decks
        self.user_map = user_map
        self.deck_map = deck_map
        
        return matrix
    
    def compute_user_similarity(self) -> np.ndarray:
        \"\"\"Compute user-user similarity matrix.\"\"\"
        
        if self.user_deck_matrix is None:
            self.load_interaction_matrix()
        
        # Cosine similarity between users
        self.user_similarity = cosine_similarity(self.user_deck_matrix)
        
        return self.user_similarity
    
    def recommend_for_user(
        self,
        user_id: str,
        top_k: int = 10
    ) -> List[UserDeckAffinity]:
        \"\"\"Generate personalized recommendations using user-based CF.\"\"\"
        
        if self.user_deck_matrix is None:
            self.load_interaction_matrix()
        
        if user_id not in self.user_map:
            return []
        
        user_idx = self.user_map[user_id]
        
        # Find similar users
        if self.user_similarity is None:
            self.compute_user_similarity()
        
        similar_user_scores = self.user_similarity[user_idx]
        
        # Get decks user hasn't interacted with
        user_decks = set(self.user_deck_matrix[user_idx].nonzero()[1])
        
        recommendations = []
        
        for deck_id in self.deck_ids:
            if deck_id in user_decks:
                continue
            
            deck_idx = self.deck_map[deck_id]
            
            # Score based on similar users who liked this deck
            score = 0.0
            similar_users_who_liked = []
            
            for other_user_idx in range(len(self.user_ids)):
                if other_user_idx == user_idx:
                    continue
                
                # Check if other user interacted with this deck
                if self.user_deck_matrix[other_user_idx, deck_idx] > 0:
                    similarity = similar_user_scores[other_user_idx]
                    score += similarity
                    similar_users_who_liked.append(self.user_ids[other_user_idx])
            
            if score > 0:
                recommendations.append(UserDeckAffinity(
                    user_id=user_id,
                    deck_id=deck_id,
                    affinity_score=float(score),
                    computed_at=datetime.now(),
                    similar_users=similar_users_who_liked[:5],  # Top 5 for explanation
                    common_decks=[deck_id],
                ))
        
        # Sort by affinity score
        recommendations.sort(key=lambda x: x.affinity_score, reverse=True)
        
        return recommendations[:top_k]
    
    def recommend_similar_users(
        self,
        user_id: str,
        top_n: int = 5
    ) -> List[Tuple[str, float]]:
        \"\"\"Find similar users.\"\"\"
        
        if user_id not in self.user_map:
            return []
        
        user_idx = self.user_map[user_id]
        
        if self.user_similarity is None:
            self.compute_user_similarity()
        
        similar_scores = self.user_similarity[user_idx]
        
        # Get top N similar users (excluding self)
        similar_indices = np.argsort(similar_scores)[::-1][1:top_n+1]
        
        return [
            (self.user_ids[idx], similar_scores[idx])
            for idx in similar_indices
        ]
