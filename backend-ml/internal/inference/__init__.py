"""Inference service for serving ML predictions."""

from .api import app, create_app

__all__ = ["app", "create_app"]
