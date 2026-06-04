"""Tests for anomaly detection models."""

import numpy as np
import pandas as pd
import pytest
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from internal.models.anomaly_models import Anomaly, PriceAnomalyDetector, TournamentOutlierDetector, ScrapingFraudDetector
from internal.anomaly.price_anomaly import PriceAnomalyDetector as PriceAnomalyImpl
from datetime import datetime


class TestPriceAnomalyDetection:
    """Test price anomaly detection."""
    
    @pytest.fixture
    def sample_price_history(self):
        np.random.seed(42)
        df = pd.DataFrame({
            "card_id": ["card-1"] * 60,
            "date": pd.date_range("2026-01-01", periods=60, freq="D"),
            "price": 100000 + np.cumsum(np.random.randn(60) * 2000)
        })
        return df
    
    def test_train(self, sample_price_history):
        detector = PriceAnomalyImpl()
        metrics = detector.train(sample_price_history)
        assert "anomaly_rate" in metrics
        assert 0 <= metrics["anomaly_rate"] <= 1
    
    def test_detect_spike_normal(self):
        detector = PriceAnomalyImpl()
        hist = np.array([100000, 102000, 101000, 103000, 102000, 101000, 100000, 102000])
        anomaly = detector.detect_spike("test", 101500, hist)
        assert anomaly.severity == "low"
    
    def test_detect_spike_high(self):
        detector = PriceAnomalyImpl()
        hist = np.array([100000] * 20)
        anomaly = detector.detect_spike("test", 150000, hist)
        assert anomaly.severity in ["medium", "high"]
    
    def test_detect_arbitrage(self):
        detector = PriceAnomalyImpl()
        anomaly = detector.detect_arbitrage("card-1", idr_price=100000, usd_price=8.0, exchange_rate=16400)
        assert anomaly.anomaly_type == "arbitrage"
        # 8 * 16400 = 131200 vs 100000 = ~24% margin
        assert anomaly.anomaly_score > 0.2
    
    def test_detect_batch(self):
        detector = PriceAnomalyImpl()
        df = pd.DataFrame({
            "card_id": ["c1"] * 20 + ["c2"] * 20,
            "date": list(pd.date_range("2026-01-01", periods=20)) * 2,
            "price": list(np.random.randn(20) * 5000 + 100000) + list(np.random.randn(20) * 5000 + 100000)
        })
        anomalies = detector.detect_batch(df)
        assert isinstance(anomalies, list)


class TestTournamentOutlier:
    """Test tournament outlier detection."""
    
    def test_detect_outlier_normal(self):
        detector = TournamentOutlierDetector()
        detector.fit({"d1": {"win_rate": 0.5, "tournament_count": 5}})
        anomaly = detector.detect_outlier({"deck_id": "d1", "deck_name": "Test", "win_rate": 0.52, "tournament_count": 6})
        assert anomaly.severity == "low"
    
    def test_detect_outlier_high(self):
        detector = TournamentOutlierDetector()
        detector.fit({"d1": {"win_rate": 0.5, "tournament_count": 5}, "d2": {"win_rate": 0.48, "tournament_count": 4}})
        anomaly = detector.detect_outlier({"deck_id": "d3", "deck_name": "High", "win_rate": 0.95, "tournament_count": 10})
        assert anomaly.severity == "high"


class TestScrapingFraud:
    """Test scraping fraud detection."""
    
    def test_normal_price(self):
        detector = ScrapingFraudDetector()
        hist = np.array([100000] * 10)
        anomaly = detector.detect_fraudulent_price("c1", "tokopedia", 102000, hist, [("shopee", 101000)])
        assert anomaly.severity == "low"
    
    def test_fraudulent_price(self):
        detector = ScrapingFraudDetector()
        hist = np.array([100000] * 10)
        anomaly = detector.detect_fraudulous_price("c1", "unknown", 50000, hist, [("tokopedia", 102000)])
        assert anomaly.severity in ["medium", "high"]
