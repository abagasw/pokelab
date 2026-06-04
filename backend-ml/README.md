# ML Pipeline Documentation

## Overview

The ML pipeline provides machine learning capabilities for Pokemon TCG Indonesia, including:

1. **Price Prediction**: Time series forecasting using ARIMA/LSTM
2. **Deck Ranking**: Learning-to-Rank with multi-objective optimization
3. **Anomaly Detection**: Price spikes, tournament outliers, and scraping fraud

## Architecture

`
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (Astro)                        │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────────────┐
│              Go Backend API (port 8080)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Card Handler │  │ Deck Handler │  │ ML Handler   │     │
│  └──────────────┘  └──────────────┘  └──────┬───────┘     │
└────────────────────────────────────────────┼────────────────┘
                                               │
┌──────────────────────────────────────────────┴────────────────┐
│         ML Inference Service (FastAPI, port 8081)              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Price Model  │  │ Ranking Model│  │Anomaly Model │     │
│  │   (ARIMA)    │  │    (LTR)     │  │(Isolation F.)│     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└──────────────────────────────────────────────────────────────┘
`

## Setup

### Installation

`ash
cd backend-ml
pip install -r requirements.txt
`

### Configuration

Edit config.toml:

`	oml
[database]
path = "../backend-go/pokemon_tcg.db"

[models]
price_prediction_horizon = 30
min_data_points = 60

[monitoring]
alert_prediction_error_threshold = 0.20
`

## Usage

### Training Models

`ash
# Train all models
python train.py --model all

# Train specific model
python train.py --model price
python train.py --model ranking
python train.py --model anomaly

# With custom parameters
python train.py --model price --model-type lstm --n-trials 100
`

### Running Inference Server

`ash
# Start server
python serve.py

# Custom port
python serve.py --port 8081

# Development mode with auto-reload
python serve.py --reload
`

### API Endpoints

#### Price Prediction
`ash
POST /ml/predict/prices
{
  "card_ids": ["card1", "card2"],
  "horizon_days": 30
}
`

#### Anomaly Detection
`ash
GET /ml/detect/anomalies?card_ids=card1,card2&threshold_std=3.0
`

#### Model Information
`ash
GET /ml/models/info
`

## Models

### 1. Price Prediction (ARIMA)

**Features:**
- Moving averages (7, 14, 30 days)
- Momentum indicators (1d, 7d, 30d)
- Volatility measures (std, coefficient of variation)
- Meta signals (tournament usage)
- Trend analysis (linear regression)

**Training:**
`python
from internal.training import PricePredictionTrainer

trainer = PricePredictionTrainer("pokemon_tcg.db")
metrics = trainer.train(card_ids=["card1", "card2"])
`

**Prediction:**
`python
from internal.models import ARIMAPredictor

predictor = ARIMAPredictor()
predictor.train("card1", price_series)
prediction = predictor.predict("card1", horizon_days=30)
`

### 2. Deck Ranking (Learning to Rank)

**Features:**
- Meta score (tournament performance)
- Inventory completeness
- Budget utilization
- Playstyle match
- Price momentum

**Training:**
`python
from internal.training import RankingTrainer

trainer = RankingTrainer("pokemon_tcg.db")
metrics = trainer.train(n_trials=50)
`

**Ranking:**
`python
from internal.ranking import MultiObjectiveOptimizer

optimizer = MultiObjectiveOptimizer()
rankings = optimizer.optimize_rankings(decks, user_preferences)
`

### 3. Anomaly Detection

**Price Anomalies:**
- Z-score based spike detection
- Arbitrage opportunity detection
- Historical deviation analysis

**Tournament Outliers:**
- Win rate deviation
- Performance anomaly detection

**Scraping Fraud:**
- Cross-source validation
- Historical comparison
- Statistical outlier detection

## Monitoring

### MLflow Tracking

`ash
# Start MLflow UI
mlflow ui --backend-store-uri sqlite:///mlflow.db

# View experiments
http://localhost:5000
`

### Model Performance Metrics

`python
from internal.monitoring import ModelMonitor

monitor = ModelMonitor("pokemon_tcg.db")
metrics = monitor.log_prediction_metrics(
    model_type="price_prediction",
    model_version="arima_20260604",
    predictions=[...],
    actuals=[...],
)
`

## Feature Engineering

### Price Features

`python
from internal.features import PriceFeatureEngine

with PriceFeatureEngine("pokemon_tcg.db") as engine:
    features = engine.compute_features("card1")
`

### Meta Features

`python
from internal.features import MetaFeatureEngine

engine = MetaFeatureEngine("pokemon_tcg.db")
features = engine.compute_card_meta("card1")
`

### User Features

`python
from internal.features import UserFeatureEngine

engine = UserFeatureEngine()
features = engine.compute_features("user1")
`

## Testing

`ash
# Run all tests
pytest

# Run specific test
pytest tests/test_price_models.py

# With coverage
pytest --cov=internal tests/
`

## Deployment

### Docker

`ash
# Build image
docker build -t pokemon-ml:latest .

# Run container
docker run -p 8081:8081 pokemon-ml:latest
`

### Docker Compose

Add to docker-compose.yml:

`yaml
services:
  ml-service:
    build: ./backend-ml
    ports:
      - "8081:8081"
    environment:
      - DB_PATH=/app/data/pokemon_tcg.db
    volumes:
      - ./backend-go:/app/data
      - ./backend-ml/models:/app/models
`

## Model Performance Targets

### Price Prediction
- **MAPE**: < 15%
- **RMSE**: < 100k IDR
- **Latency**: < 100ms
- **Coverage**: > 90% of cards

### Deck Ranking
- **NDCG@10**: > 0.75
- **Click-through rate**: > 40%
- **Personalization accuracy**: > 70%

### Anomaly Detection
- **Precision**: > 80%
- **Recall**: > 85%
- **False positive rate**: < 5%

## Troubleshooting

### Training Issues

**Insufficient Data:**
`
Error: Not enough data points for training
`
Solution: Ensure at least 60 days of price history

**Memory Issues:**
`
Error: Out of memory during training
`
Solution: Reduce batch size or use fewer cards

### Inference Issues

**Model Not Loaded:**
`
Error: Model not trained. Call train() first.
`
Solution: Train models before starting inference server

**Slow Predictions:**
Solution: Enable caching or reduce model complexity

## Advanced Features

### Collaborative Filtering

`python
from internal.ranking import CollaborativeFilteringRecommender

cf = CollaborativeFilteringRecommender("pokemon_tcg.db")
cf.load_interaction_matrix()
recommendations = cf.recommend_for_user("user1", top_k=10)
`

### Online Learning

`python
from internal.ranking import OnlineLearningEngine, FeedbackEvent

engine = OnlineLearningEngine()
event = FeedbackEvent(
    user_id="user1",
    deck_id="deck1",
    feedback_type="favorite",
    timestamp=datetime.now(),
    context={},
)
engine.process_feedback(event)
`

### Multi-Objective Optimization

`python
from internal.ranking import MultiObjectiveOptimizer

optimizer = MultiObjectiveOptimizer()
optimizer.set_weights({
    "completeness": 0.4,  # Prioritize inventory coverage
    "meta_score": 0.3,    # Tournament performance
    "budget": 0.2,         # Affordability
    "playstyle": 0.1,      # User preference
})
rankings = optimizer.optimize_rankings(decks)
`

## Data Flow

1. **Data Collection**: Scrapers collect price/tournament data
2. **Feature Engineering**: Compute features daily
3. **Model Training**: Retrain models weekly
4. **Model Evaluation**: Track performance with MLflow
5. **Inference**: Serve predictions via FastAPI
6. **Monitoring**: Detect drift and performance degradation

## Future Improvements

- [ ] LSTM implementation for price prediction
- [ ] Graph Neural Networks for card relationships
- [ ] Reinforcement Learning for deck building
- [ ] Real-time streaming inference
- [ ] Model ensemble for improved accuracy
- [ ] Automated hyperparameter optimization
- [ ] Feature importance visualization
- [ ] A/B testing framework for production
