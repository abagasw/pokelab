#!/usr/bin/env python3
"""Pokemon TCG ML Training Pipeline.

Usage:
    python train.py --model price        # Train price prediction
    python train.py --model ranking      # Train deck ranking
    python train.py --model anomaly      # Train anomaly detection
    python train.py --model all          # Train all models
"""

import argparse
import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent))

from internal.training.trainer import (
    PricePredictionTrainer,
    RankingTrainer,
    AnomalyTrainer,
    train_all_models,
    TrainingConfig,
)


def main():
    parser = argparse.ArgumentParser(description="Pokemon TCG ML Training Pipeline")
    parser.add_argument(
        "--model",
        choices=["price", "ranking", "anomaly", "all"],
        default="all",
        help="Which model to train",
    )
    parser.add_argument(
        "--db-path",
        default="../backend-go/pokemon_tcg.db",
        help="Path to SQLite database",
    )
    parser.add_argument(
        "--n-trials",
        type=int,
        default=50,
        help="Number of hyperparameter tuning trials",
    )
    parser.add_argument(
        "--no-mlflow",
        action="store_true",
        help="Disable MLflow tracking",
    )
    parser.add_argument(
        "--model-type",
        choices=["arima", "lstm"],
        default="arima",
        help="Price prediction model type",
    )
    
    args = parser.parse_args()
    
    config = TrainingConfig(
        model_type=args.model_type,
        n_trials=args.n_trials,
        mlflow_tracking=not args.no_mlflow,
    )
    
    if args.model == "price" or args.model == "all":
        print("\n" + "=" * 60)
        print("TRAINING PRICE PREDICTION MODEL")
        print("=" * 60)
        trainer = PricePredictionTrainer(args.db_path, config)
        metrics = trainer.train()
        print(f"\nResults: {len(metrics)} models trained")
        for card_id, m in list(metrics.items())[:5]:
            if "error" not in m:
                print(f"  {card_id}: MAPE={m.get('mape', 0):.1f}%")
    
    if args.model == "ranking" or args.model == "all":
        print("\n" + "=" * 60)
        print("TRAINING DECK RANKING MODEL")
        print("=" * 60)
        trainer = RankingTrainer(args.db_path, config)
        metrics = trainer.train(n_trials=args.n_trials)
        print(f"\nResults: NDCG={metrics.get('ndcg', 0):.3f}")
    
    if args.model == "anomaly" or args.model == "all":
        print("\n" + "=" * 60)
        print("TRAINING ANOMALY DETECTION MODEL")
        print("=" * 60)
        trainer = AnomalyTrainer(args.db_path, config)
        metrics = trainer.train()
        print(f"\nResults: anomaly_rate={metrics.get('anomaly_rate', 0):.2%}")
    
    print("\n" + "=" * 60)
    print("TRAINING COMPLETE")
    print("=" * 60)


if __name__ == "__main__":
    main()
