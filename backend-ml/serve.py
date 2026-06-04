#!/usr/bin/env python3
"""Pokemon TCG ML Inference Server.

Usage:
    python serve.py
    python serve.py --port 8081
    python serve.py --host 0.0.0.0 --port 8081
"""

import argparse
import sys
from pathlib import Path

import uvicorn

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent))

from internal.inference.api import app


def main():
    parser = argparse.ArgumentParser(description="Pokemon TCG ML Inference Server")
    parser.add_argument(
        "--host",
        default="0.0.0.0",
        help="Host to bind to",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8081,
        help="Port to bind to",
    )
    parser.add_argument(
        "--reload",
        action="store_true",
        help="Enable auto-reload for development",
    )
    
    args = parser.parse_args()
    
    print(f"Starting ML Inference API on {args.host}:{args.port}")
    print(f"Health check: http://{args.host}:{args.port}/health")
    print(f"API docs: http://{args.host}:{args.port}/docs")
    
    uvicorn.run(
        "internal.inference.api:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
    )


if __name__ == "__main__":
    main()
