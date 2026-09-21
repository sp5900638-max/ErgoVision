"""Global shared application state for tracker and evaluator singletons."""
from typing import Optional, Dict, Any
from .tracker import PostureTracker
from .evaluator import PostureEvaluator

tracker = PostureTracker()
evaluator = PostureEvaluator()
latest_tracker_result: Optional[Dict[str, Any]] = None


def get_tracker() -> PostureTracker:
    return tracker


def get_evaluator() -> PostureEvaluator:
    return evaluator


def set_latest_result(result: Dict[str, Any]) -> None:
    global latest_tracker_result
    latest_tracker_result = result


def get_latest_result() -> Optional[Dict[str, Any]]:
    return latest_tracker_result
