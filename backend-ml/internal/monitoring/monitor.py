"""Model monitoring and drift detection."""

import mlflow
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List

import numpy as np
import pandas as pd


@dataclass
class MonitoringMetrics:
    """Model performance metrics."""
    model_type: str
    model_version: str
    timestamp: datetime
    
    # Prediction metrics
    mae: float = 0.0
    rmse: float = 0.0
    mape: float = 0.0
    
    # Data quality metrics
    feature_drift_score: float = 0.0
    missing_data_rate: float = 0.0
    outlier_rate: float = 0.0
    
    # System metrics
    prediction_latency_ms: float = 0.0
    prediction_count: int = 0
    
    def to_dict(self) -> dict:
        return {
            "model_type": self.model_type,
            "model_version": self.model_version,
            "timestamp": self.timestamp.isoformat(),
            "mae": self.mae,
            "rmse": self.rmse,
            "mape": self.mape,
            "feature_drift_score": self.feature_drift_score,
            "missing_data_rate": self.missing_data_rate,
            "outlier_rate": self.outlier_rate,
            "prediction_latency_ms": self.prediction_latency_ms,
            "prediction_count": self.prediction_count,
        }


class ModelMonitor:
    """Monitor model performance and detect drift."""
    
    def __init__(self, db_path: str, mlflow_tracking_uri: str = "sqlite:///mlflow.db"):
        self.db_path = db_path
        mlflow.set_tracking_uri(mlflow_tracking_uri)
        
    def log_prediction_metrics(
        self,
        model_type: str,
        model_version: str,
        predictions: List[float],
        actuals: List[float],
        latency_ms: float = 0.0
    ) -> MonitoringMetrics:
        \"\"\"Calculate and log prediction metrics.\"\"\"
        
        predictions = np.array(predictions)
        actuals = np.array(actuals)
        
        # Calculate metrics
        mae = np.mean(np.abs(predictions - actuals))
        rmse = np.sqrt(np.mean((predictions - actuals) ** 2))
        mape = np.mean(np.abs((actuals - predictions) / (actuals + 1e-6))) * 100
        
        metrics = MonitoringMetrics(
            model_type=model_type,
            model_version=model_version,
            timestamp=datetime.now(),
            mae=mae,
            rmse=rmse,
            mape=mape,
            prediction_latency_ms=latency_ms,
            prediction_count=len(predictions),
        )
        
        # Log to MLflow
        with mlflow.start_run():
            mlflow.log_params({
                "model_type": model_type,
                "model_version": model_version,
            })
            mlflow.log_metrics({
                "mae": mae,
                "rmse": rmse,
                "mape": mape,
                "prediction_latency_ms": latency_ms,
            })
        
        return metrics
    
    def detect_feature_drift(
        self,
        current_features: pd.DataFrame,
        reference_features: pd.DataFrame
    ) -> Dict[str, float]:
        \"\"\"Detect feature distribution drift using Kolmogorov-Smirnov test.\"\"\"
        
        drift_scores = {}
        
        for column in current_features.columns:
            if column in reference_features.columns:
                current = current_features[column].dropna()
                reference = reference_features[column].dropna()
                
                if len(current) > 0 and len(reference) > 0:
                    # KS test
                    from scipy import stats
                    statistic, p_value = stats.ks_2samp(reference, current)
                    drift_scores[column] = statistic  # Higher = more drift
        
        overall_drift = np.mean(list(drift_scores.values())) if drift_scores else 0.0
        
        # Alert if drift is significant
        if overall_drift > 0.2:  # Threshold for significant drift
            print(f\"WARNING: Feature drift detected! Score: {overall_drift:.3f}\")
            print(f\"Drifted features: {[col for col, score in drift_scores.items() if score > 0.2]}\")
        
        return {"overall_drift": overall_drift, "feature_drift": drift_scores}
    
    def check_data_quality(self, df: pd.DataFrame) -> Dict[str, float]:
        \"\"\"Check data quality metrics.\"\"\"
        
        metrics = {
            "missing_rate": df.isnull().sum().sum() / (df.shape[0] * df.shape[1]),
            "duplicate_rate": df.duplicated().sum() / len(df),
        }
        
        # Detect outliers using IQR
        numeric_cols = df.select_dtypes(include=[np.number]).columns
        outlier_counts = []
        
        for col in numeric_cols:
            Q1 = df[col].quantile(0.25)
            Q3 = df[col].quantile(0.75)
            IQR = Q3 - Q1
            outliers = ((df[col] < (Q1 - 1.5 * IQR)) | (df[col] > (Q3 + 1.5 * IQR))).sum()
            outlier_counts.append(outliers)
        
        metrics["outlier_rate"] = sum(outlier_counts) / (len(df) * len(numeric_cols)) if numeric_cols else 0
        
        return metrics
    
    def get_model_performance_history(
        self,
        model_type: str,
        model_version: str,
        days: int = 30
    ) -> pd.DataFrame:
        \"\"\"Get historical performance metrics.\"\"\"
        
        # Query MLflow for metrics
        from mlflow.tracking import MlflowClient
        
        client = MlflowClient()
        experiments = client.search_experiments()
        
        # Find matching experiment
        exp_name = f"pokemon-tcg-{model_type}"
        experiment = next((e for e in experiments if e.name == exp_name), None)
        
        if not experiment:
            return pd.DataFrame()
        
        # Get runs
        runs = client.search_runs(
            experiment_ids=[experiment.experiment_id],
            filter_string=f"params.model_version = '{model_version}'"
        )
        
        metrics_data = []
        for run in runs:
            metrics_data.append({
                "timestamp": run.info.start_time,
                "mae": run.data.metrics.get("mae"),
                "rmse": run.data.metrics.get("rmse"),
                "mape": run.data.metrics.get("mape"),
            })
        
        df = pd.DataFrame(metrics_data)
        if not df.empty:
            df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms")
        
        return df
    
    def generate_monitoring_report(self, model_type: str, model_version: str) -> Dict:
        \"\"\"Generate comprehensive monitoring report.\"\"\"
        
        perf_history = self.get_model_performance_history(model_type, model_version)
        
        if perf_history.empty:
            return {"status": "no_data"}
        
        latest = perf_history.iloc[-1]
        
        return {
            "model_type": model_type,
            "model_version": model_version,
            "latest_metrics": {
                "mae": latest["mae"],
                "rmse": latest["rmse"],
                "mape": latest["mape"],
            },
            "trend": {
                "mae_trend": "improving" if len(perf_history) > 1 and perf_history["mae"].iloc[-1] < perf_history["mae"].iloc[-2] else "stable",
                "mape_trend": "improving" if len(perf_history) > 1 and perf_history["mape"].iloc[-1] < perf_history["mape"].iloc[-2] else "stable",
            },
            "status": "healthy" if latest["mape"] < 20 else "degraded",
            "generated_at": datetime.now().isoformat(),
        }
