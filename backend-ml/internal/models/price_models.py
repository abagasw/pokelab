"""
Time series forecasting models for price prediction.

Implements ARIMA and LSTM models with hyperparameter tuning.
"""

import mlflow
import mlflow.sklearn
import numpy as np
import optuna
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import pandas as pd
from scipy import stats
from sklearn.metrics import mean_absolute_error, mean_squared_error
from sklearn.preprocessing import StandardScaler
from statsmodels.tsa.arima.model import ARIMA


@dataclass
class PricePrediction:
    """Price prediction result."""
    card_id: str
    predicted_price: float
    confidence_min: float
    confidence_max: float
    confidence_score: float
    trend: str  # 'up', 'down', 'stable'
    model_version: str
    predicted_at: datetime
    horizon_days: int = 30
    factors: List[str] = None
    
    def __post_init__(self):
        if self.factors is None:
            self.factors = []


class ARIMAPredictor:
    """ARIMA-based time series forecaster."""
    
    def __init__(self, model_dir: Path = Path("models/saved")):
        self.model_dir = model_dir
        self.model_dir.mkdir(parents=True, exist_ok=True)
        self.models: Dict[str, ARIMA] = {}
        self.scalers: Dict[str, StandardScaler] = {}
        
    def train(
        self,
        card_id: str,
        prices: pd.Series,
        test_size: int = 7,
        mlflow_tracking: bool = True
    ) -> Dict[str, float]:
        """Train ARIMA model for a single card."""
        
        if mlflow_tracking:
            mlflow.set_experiment("pokemon-tcg-price-prediction")
            mlflow.start_run()
            mlflow.set_tag("card_id", card_id)
            mlflow.set_tag("model_type", "ARIMA")
        
        try:
            # Split train/test
            train = prices[:-test_size]
            test = prices[-test_size:]
            
            # Auto-ARIMA: find best (p,d,q) parameters
            best_params = self._find_best_params(train, mlflow_tracking)
            
            # Train final model
            model = ARIMA(train, order=best_params)
            fitted_model = model.fit()
            
            # Save model
            self.models[card_id] = fitted_model
            
            # Evaluate
            predictions = fitted_model.forecast(steps=test_size)
            mae = mean_absolute_error(test, predictions)
            rmse = np.sqrt(mean_squared_error(test, predictions))
            mape = np.mean(np.abs((test - predictions) / test)) * 100
            
            metrics = {"mae": mae, "rmse": rmse, "mape": mape}
            
            if mlflow_tracking:
                mlflow.log_params({"order": best_params})
                mlflow.log_metrics(metrics)
                mlflow.sklearn.log_model(fitted_model, f"arima_{card_id}")
            
            return metrics
            
        finally:
            if mlflow_tracking:
                mlflow.end_run()
    
    def _find_best_params(
        self,
        train: pd.Series,
        mlflow_tracking: bool = True
    ) -> Tuple[int, int, int]:
        """Find best ARIMA parameters using grid search."""
        
        best_aic = np.inf
        best_params = (1, 1, 1)
        
        # Grid search over reasonable parameter ranges
        for p in range(0, 3):
            for d in range(0, 2):
                for q in range(0, 3):
                    try:
                        model = ARIMA(train, order=(p, d, q))
                        fitted = model.fit(disp=False)
                        
                        if fitted.aic < best_aic:
                            best_aic = fitted.aic
                            best_params = (p, d, q)
                    except:
                        continue
        
        return best_params
    
    def predict(
        self,
        card_id: str,
        horizon_days: int = 30,
        return_confidence: bool = True
    ) -> PricePrediction:
        """Generate price prediction."""
        
        if card_id not in self.models:
            raise ValueError(f"No trained model for card {card_id}")
        
        model = self.models[card_id]
        
        # Forecast
        forecast = model.forecast(steps=horizon_days)
        predicted_price = float(forecast[-1])
        
        # Calculate confidence interval
        if return_confidence:
            # Use historical residuals for confidence estimation
            residuals = model.resid
            std_residuals = np.std(residuals)
            confidence_min = predicted_price - 1.96 * std_residuals
            confidence_max = predicted_price + 1.96 * std_residuals
            confidence_score = max(0, min(1, 1 - std_residuals / predicted_price))
        else:
            confidence_min = confidence_max = predicted_price
            confidence_score = 0.5
        
        # Determine trend
        current_price = float(model.data.orig_endog[-1])
        if predicted_price > current_price * 1.05:
            trend = "up"
        elif predicted_price < current_price * 0.95:
            trend = "down"
        else:
            trend = "stable"
        
        return PricePrediction(
            card_id=card_id,
            predicted_price=predicted_price,
            confidence_min=max(0, confidence_min),
            confidence_max=confidence_max,
            confidence_score=confidence_score,
            trend=trend,
            model_version=f"arima_{datetime.now().strftime('%Y%m%d')}",
            predicted_at=datetime.now(),
            horizon_days=horizon_days,
        )
    
    def predict_batch(
        self,
        card_ids: List[str],
        horizon_days: int = 30
    ) -> List[PricePrediction]:
        """Generate predictions for multiple cards."""
        predictions = []
        for card_id in card_ids:
            try:
                pred = self.predict(card_id, horizon_days)
                predictions.append(pred)
            except Exception as e:
                print(f"Error predicting {card_id}: {e}")
        return predictions


class LSTMPredictor:
    """LSTM-based time series forecaster using PyTorch."""
    
    def __init__(self, model_dir: Path = Path("models/saved")):
        self.model_dir = model_dir
        self.model_dir.mkdir(parents=True, exist_ok=True)
        # Will be implemented with torch.nn.LSTM
        
    def train(
        self,
        card_id: str,
        prices: pd.Series,
        sequence_length: int = 30,
        epochs: int = 100,
        batch_size: int = 32
    ) -> Dict[str, float]:
        \"\"\"Train LSTM model.\"\"\"
        # TODO: Implement PyTorch LSTM training
        # This requires more complex implementation
        # Placeholder for now
        return {"mae": 0.0, "rmse": 0.0, "mape": 0.0}
    
    def predict(self, card_id: str, horizon_days: int = 30) -> PricePrediction:
        \"\"\"Generate LSTM prediction.\"\"\"
        # TODO: Implement LSTM inference
        return PricePrediction(
            card_id=card_id,
            predicted_price=0.0,
            confidence_min=0.0,
            confidence_max=0.0,
            confidence_score=0.0,
            trend=\"stable\",
            model_version=\"lstm_placeholder\",
            predicted_at=datetime.now(),
            horizon_days=horizon_days,
        )


class PricePredictor:
    """Factory for price prediction models."""
    
    def __init__(self, model_type: str = "arima", model_dir: Path = Path("models/saved")):
        self.model_type = model_type
        if model_type == "arima":
            self.predictor = ARIMAPredictor(model_dir)
        elif model_type == "lstm":
            self.predictor = LSTMPredictor(model_dir)
        else:
            raise ValueError(f"Unknown model type: {model_type}")
    
    def train_batch(
        self,
        price_data: Dict[str, pd.Series],
        test_size: int = 7
    ) -> Dict[str, Dict[str, float]]:
        \"\"\"Train models for multiple cards.\"\"\"
        metrics = {}
        for card_id, prices in price_data.items():
            try:
                card_metrics = self.predictor.train(card_id, prices, test_size)
                metrics[card_id] = card_metrics
            except Exception as e:
                print(f"Error training {card_id}: {e}")
                metrics[card_id] = {"error": str(e)}
        return metrics
    
    def predict_batch(self, card_ids: List[str], horizon_days: int = 30) -> List[PricePrediction]:
        \"\"\"Generate predictions for multiple cards.\"\"\"
        return self.predictor.predict_batch(card_ids, horizon_days)
