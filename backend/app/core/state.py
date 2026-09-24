"""Global shared application state for tracker and evaluator singletons."""
from typing import Optional, Dict, Any
from .evaluator import PostureEvaluator

_tracker = None
evaluator = PostureEvaluator()
latest_tracker_result: Optional[Dict[str, Any]] = None


def get_tracker():
    """Lazily initializes PostureTracker only when requested, saving 400MB RAM and avoiding boot delays."""
    global _tracker
    if _tracker is None:
        from .tracker import PostureTracker
        _tracker = PostureTracker(model_complexity=0)
    return _tracker


def get_evaluator() -> PostureEvaluator:
    return evaluator


def set_latest_result(result: Dict[str, Any]) -> None:
    global latest_tracker_result
    latest_tracker_result = result


def get_latest_result() -> Optional[Dict[str, Any]]:
    return latest_tracker_result
