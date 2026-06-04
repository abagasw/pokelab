"""FastAPI application for serving ML predictions."""

import mlflow
import sqlite3
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Dict, List

import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from internal.models.price_models import PricePredictor, PricePrediction
from internal.models.ranking_models import DeckRanker
from internal.models.anomaly_models import AnomalyDetector


# Pydantic models
class PricePredictionRequest(BaseModel):
    card_ids: List[str]
    horizon_days: int = 30


class PricePredictionResponse(BaseModel):
    predictions: List[Dict]
    model_version: str
    generated_at: datetime


class DeckRankingRequest(BaseModel):
    user_id: str
    collection_id: str
    deck_ids: List[str]
    top_k: int = 10


class AnomalyDetectionRequest(BaseModel):
    card_ids: List[str]
    threshold_std: float = 3.0


# Global models
price_predictor: PricePredictor = None
deck_ranker: DeckRanker = None
anomaly_detector: AnomalyDetector = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    \"\"\"Load models on startup.\"\"\"
    
    model_dir = Path("models/saved")
    db_path = Path("../backend-go/pokemon_tcg.db")
    
    global price_predictor, deck_ranker, anomaly_detector
    
    # Initialize models (in production, load from disk)
    price_predictor = PricePredictor("arima", model_dir)
    deck_ranker = DeckRanker("ltr", model_dir)
    anomaly_detector = AnomalyDetector("price", model_dir)
    
    print(f\"Models initialized. MLflow tracking: sqlite:///mlflow.db\")
    
    yield
    
    # Cleanup
    print(\"Shutting down ML inference service\")


def create_app() -> FastAPI:
    \"\"\"Create FastAPI application.\"\"\"
    
    app = FastAPI(
        title="Pokemon TCG ML Inference API",
        description="Machine learning inference service for price prediction, deck ranking, and anomaly detection",
        version="1.0.0",
        lifespan=lifespan,
    )
    
    @app.get("/health")
    async def health_check():
        \"\"\"Health check endpoint.\"\"\"
        return {
            "status": "healthy",
            "service": "pokemon-tcg-ml-inference",
            "version": "1.0.0",
            "models_loaded": {
                "price_prediction": price_predictor is not None,
                "deck_ranking": deck_ranker is not None,
                "anomaly_detection": anomaly_detector is not None,
            }
        }
    
    @app.post("/predict/prices", response_model=PricePredictionResponse)
    async def predict_prices(request: PricePredictionRequest):
        \"\"\"Generate price predictions for multiple cards.\"\"\"
        
        if price_predictor is None:
            raise HTTPException(status_code=503, detail="Price prediction model not loaded")
        
        try:
            predictions = price_predictor.predict_batch(
                request.card_ids,
                request.horizon_days
            )
            
            return PricePredictionResponse(
                predictions=[pred.to_dict() for pred in predictions],
                model_version=f"arima_{datetime.now().strftime('%Y%m%d')}",
                generated_at=datetime.now(),
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    
    @app.post("/predict/single-price")
    async def predict_single_price(card_id: str, horizon_days: int = 30):
        \"\"\"Generate price prediction for a single card.\"\"\"
        
        if price_predictor is None:
            raise HTTPException(status_code=503, detail="Price prediction model not loaded")
        
        try:
            prediction = price_predictor.predict(card_id, horizon_days)
            return prediction.to_dict()
        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    
    @app.post("/rank/decks")
    async def rank_decks(request: DeckRankingRequest):
        \"\"\"Generate ranked deck recommendations.\"\"\"
        
        if deck_ranker is None:
            raise HTTPException(status_code=503, detail="Deck ranking model not loaded")
        
        try:
            # Load data from database
            db_path = Path("../backend-go/pokemon_tcg.db")
            conn = sqlite3.connect(db_path)
            
            # Get deck data
            placeholders = ",".join(["?" for _ in request.deck_ids])
            deck_query = f\"\"\"
            SELECT id, name, tournament_count, win_count, top8_count
            FROM decks
            WHERE id IN ({placeholders})
            \"\"\"
            deck_data = pd.read_sql_query(deck_query, conn, params=request.deck_ids)
            
            # Get user inventory
            inv_query = \"\"\"
            SELECT card_id, quantity
            FROM collection_items
            WHERE collection_id = ?
            \"\"\"
            inventory = pd.read_sql_query(inv_query, conn, params=(request.collection_id,))
            
            conn.close()
            
            # Generate rankings
            results = deck_ranker.model.predict(
                deck_data=deck_data,
                user_inventory=inventory,
                meta_signals=pd.DataFrame(),  # Would need to implement
                user_id=request.user_id,
                collection_id=request.collection_id
            )
            
            return [r.to_dict() for r in results[:request.top_k]]
            
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    
    @app.post("/detect/anomalies")
    async def detect_anomalies(request: AnomalyDetectionRequest):
        \"\"\"Detect price anomalies.\"\"\"
        
        if anomaly_detector is None:
            raise HTTPException(status_code=503, detail="Anomaly detection model not loaded")
        
        try:
            db_path = Path("../backend-go/pokemon_tcg.db")
            conn = sqlite3.connect(db_path)
            
            # Get price data
            placeholders = ",".join(["?" for _ in request.card_ids])
            query = f\"\"\"
            SELECT 
                card_id,
                recorded_at as date,
                price_idr as price
            FROM price_history
            WHERE card_id IN ({placeholders}) AND currency = 'IDR'
            ORDER BY card_id, recorded_at
            \"\"\"
            df = pd.read_sql_query(query, conn, params=request.card_ids)
            conn.close()
            
            # Detect anomalies
            anomalies = anomaly_detector.detector.detect_batch(df, request.threshold_std)
            
            return [a.to_dict() for a in anomalies]
            
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    
    @app.get("/models/info")
    async def models_info():
        \"\"\"Get information about loaded models.\"\"\"
        
        return {
            "price_prediction": {
                "type": "arima",
                "loaded": price_predictor is not None,
                "version": datetime.now().strftime("%Y%m%d"),
            },
            "deck_ranking": {
                "type": "learning_to_rank",
                "loaded": deck_ranker is not None,
                "version": datetime.now().strftime("%Y%m%d"),
            },
            "anomaly_detection": {
                "type": "isolation_forest",
                "loaded": anomaly_detector is not None,
                "version": datetime.now().strftime("%Y%m%d"),
            },
        }
    
    return app


# Create app instance
app = create_app()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8081)
