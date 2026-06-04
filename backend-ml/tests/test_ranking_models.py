"""Tests for ranking models."""

import numpy as np
import pandas as pd
import pytest
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from internal.models.ranking_models import LearningToRankModel, DeckRankingResult
from internal.ranking.multi_objective import MultiObjectiveOptimizer, PersonalizationEngine
from internal.ranking.online_learning import OnlineLearningEngine, FeedbackEvent
from internal.ranking.collaborative_filtering import CollaborativeFilteringRecommender
from datetime import datetime


class TestMultiObjectiveOptimizer:
    """Test multi-objective optimization."""
    
    def test_weighted_sum(self):
        opt = MultiObjectiveOptimizer()
        objectives = {"completeness": 0.8, "meta_score": 0.7, "budget": 0.6, "playstyle": 0.5, "price_trend": 0.4}
        score = opt.weighted_sum(objectives)
        assert 0 < score < 1
    
    def test_optimize_rankings(self):
        opt = MultiObjectiveOptimizer()
        decks = [
            {"id": "1", "name": "Deck A", "completeness_pct": 90, "meta_score": 80, "budget_utilization": 0.3, "playstyle_match": 0.8, "price_momentum": 0.6},
            {"id": "2", "name": "Deck B", "completeness_pct": 50, "meta_score": 95, "budget_utilization": 0.8, "playstyle_match": 0.4, "price_momentum": 0.3},
        ]
        rankings = opt.optimize_rankings(decks)
        assert len(rankings) == 2
        assert rankings[0].rank == 1
        assert rankings[0].score >= rankings[1].score
    
    def test_pareto_front(self):
        opt = MultiObjectiveOptimizer()
        decks = [
            {"id": "1", "completeness_pct": 90, "meta_score": 80, "budget_utilization": 0.3, "playstyle_match": 0.8, "price_momentum": 0.6},
            {"id": "2", "completeness_pct": 50, "meta_score": 95, "budget_utilization": 0.8, "playstyle_match": 0.4, "price_momentum": 0.3},
            {"id": "3", "completeness_pct": 30, "meta_score": 30, "budget_utilization": 0.9, "playstyle_match": 0.1, "price_momentum": 0.1},
        ]
        pareto = opt.pareto_front(decks)
        assert len(pareto) >= 1  # At least deck 3 should be dominated
    
    def test_custom_weights(self):
        opt = MultiObjectiveOptimizer()
        opt.set_weights({"completeness": 0.5, "meta_score": 0.5, "budget": 0.0, "playstyle": 0.0, "price_trend": 0.0})
        objectives = {"completeness": 1.0, "meta_score": 0.0, "budget": 0.0, "playstyle": 0.0, "price_trend": 0.0}
        score = opt.weighted_sum(objectives)
        assert score == 0.5


class TestOnlineLearning:
    """Test online learning engine."""
    
    def test_process_feedback(self):
        engine = OnlineLearningEngine()
        event = FeedbackEvent(
            user_id="u1", deck_id="d1", feedback_type="favorite",
            timestamp=datetime.now(), context={}
        )
        engine.process_feedback(event)
        assert engine.get_deck_score("d1") > 0.5
    
    def test_negative_feedback(self):
        engine = OnlineLearningEngine()
        event = FeedbackEvent(user_id="u1", deck_id="d1", feedback_type="dislike", timestamp=datetime.now(), context={})
        engine.process_feedback(event)
        assert engine.get_deck_score("d1") < 0.5
    
    def test_rankings(self):
        engine = OnlineLearningEngine()
        engine.process_feedback(FeedbackEvent("u1", "d1", "favorite", datetime.now(), {}))
        engine.process_feedback(FeedbackEvent("u1", "d2", "click", datetime.now(), {}))
        engine.process_feedback(FeedbackEvent("u1", "d3", "dislike", datetime.now(), {}))
        
        ranked = engine.get_rankings(["d1", "d2", "d3"])
        assert ranked[0] == "d1"
        assert ranked[-1] == "d3"
    
    def test_export_import(self):
        engine = OnlineLearningEngine()
        engine.process_feedback(FeedbackEvent("u1", "d1", "favorite", datetime.now(), {}))
        
        exported = engine.export_weights()
        engine2 = OnlineLearningEngine()
        engine2.import_weights(exported)
        assert engine2.get_deck_score("d1") == engine.get_deck_score("d1")


class TestPersonalizationEngine:
    """Test personalization engine."""
    
    def test_default_weights(self):
        engine = PersonalizationEngine("")
        weights = engine.get_personalization_weights("unknown_user")
        assert "completeness" in weights
    
    def test_update_preferences(self):
        engine = PersonalizationEngine("")
        for _ in range(5):
            engine.update_user_preferences("u1", "d1", 1)
        prefs = engine.user_preferences["u1"]
        assert prefs["playstyle"] == "aggressive"
