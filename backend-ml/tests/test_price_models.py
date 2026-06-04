"""Tests for price prediction models."""

import numpy as np
import pandas as pd
import pytest
from datetime import datetime
from pathlib import Path

# Use relative imports for testing
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from internal.models.price_models import ARIMAPredictor, PricePrediction


class TestARIMAPredictor:
    """Test ARIMA price predictor."""
    
    @pytest.fixture
    def sample_prices(self):
        """Generate sample price data."""
        np.random.seed(42)
        dates = pd.date_range("2026-01-01", periods=60, freq="D")
        prices = 100000 + np.cumsum(np.random.randn(60) * 1000)
        return pd.Series(prices, index=dates)
    
    @pytest.fixture
    def predictor(self, tmp_path):
        """Create predictor instance."""
        return ARIMAPredictor(model_dir=tmp_path)
    
    def test_train(self, predictor, sample_prices):
        """Test model training."""
        metrics = predictor.train(
            card_id="test-card-1",
            prices=sample_prices,
            test_size=7,
            mlflow_tracking=False,
        )
        
        assert "mae" in metrics
        assert "rmse" in metrics
        assert "mape" in metrics
        assert metrics["mae"] >= 0
        assert metrics["rmse"] >= 0
        assert metrics["mape"] >= 0
    
    def test_predict(self, predictor, sample_prices):
        """Test prediction generation."""
        predictor.train("test-card-1", sample_prices, test_size=7, mlflow_tracking=False)
        
        prediction = predictor.predict("test-card-1", horizon_days=30)
        
        assert prediction.card_id == "test-card-1"
        assert prediction.predicted_price > 0
        assert prediction.confidence_min <= prediction.predicted_price
        assert prediction.confidence_max >= prediction.predicted_price
        assert prediction.trend in ["up", "down", "stable"]
    
    def test_predict_untrained_card(self, predictor, sample_prices):
        """Test prediction for untrained card raises error."""
        with pytest.raises(ValueError):
            predictor.predict("unknown-card")
    
    def test_batch_predict(self, predictor, sample_prices):
        """Test batch prediction."""
        predictor.train("card-1", sample_prices, test_size=7, mlflow_tracking=False)
        
        # Generate second card data
        np.random.seed(43)
        prices2 = 200000 + np.cumsum(np.random.randn(60) * 2000)
        predictor.train("card-2", pd.Series(prices2, index=sample_prices.index), test_size=7, mlflow_tracking=False)
        
        predictions = predictor.predict_batch(["card-1", "card-2", "unknown"])
        
        assert len(predictions) == 2  # Unknown card should be skipped


class TestPricePrediction:
    """Test PricePrediction dataclass."""
    
    def test_creation(self):
        """Test prediction creation."""
        pred = PricePrediction(
            card_id="test",
            predicted_price=100000.0,
            confidence_min=90000.0,
            confidence_max=110000.0,
            confidence_score=0.85,
            trend="up",
            model_version="arima_20260604",
            predicted_at=datetime.now(),
        )
        
        assert pred.card_id == "test"
        assert pred.predicted_price == 100000.0
        assert pred.trend == "up"
    
    def test_default_factors(self):
        """Test default factors list."""
        pred = PricePrediction(
            card_id="test",
            predicted_price=100000.0,
            confidence_min=90000.0,
            confidence_max=110000.0,
            confidence_score=0.85,
            trend="up",
            model_version="arima_20260604",
            predicted_at=datetime.now(),
        )
        
        assert pred.factors == []
