# ML Pipeline Quick Start

## Installation

```bash
cd backend-ml
pip install -r requirements.txt
```

## Training

```bash
python train.py --model price
python train.py --model ranking
python train.py --model anomaly
python train.py --model all
```

## Serving

```bash
python serve.py
# Server at http://localhost:8081
```

## Models

1. Price Prediction (ARIMA) - MAPE target: <15%
2. Deck Ranking (LTR) - NDCG@10 target: >0.75
3. Anomaly Detection (Isolation Forest)

## Testing

```bash
pytest tests/
```
