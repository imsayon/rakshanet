"""
Unit tests for decision-engine feature parsing robustness.

Validates that non-numeric feature values (e.g., currency='INR') are
properly filtered and don't cause float conversion errors during scoring.
"""
import pytest


def parse_features_from_redis(features_raw: dict) -> dict:
    """
    Parse Redis features, keeping only numeric values.
    
    This mimics the logic in decision-engine/main.py:score_transaction()
    that filters out non-numeric feature values before model scoring.
    
    Args:
        features_raw: Raw features dict from Redis (all string values).
    
    Returns:
        Dictionary with only numeric feature values.
    """
    features = {}
    if features_raw:
        for key, value in features_raw.items():
            try:
                features[key] = float(value)
            except (TypeError, ValueError):
                # Skip non-numeric values like strings
                continue
    return features


class TestDecisionEngineFeatureParsing:
    """Feature parsing resilience tests."""
    
    def test_parse_numeric_features_only(self):
        """Numeric features are converted to float."""
        raw = {
            "amount": "999.0",
            "txn_count_1h": "5",
            "velocity_score": "0.8",
        }
        parsed = parse_features_from_redis(raw)
        
        assert parsed["amount"] == 999.0
        assert parsed["txn_count_1h"] == 5.0
        assert parsed["velocity_score"] == 0.8
    
    def test_ignore_non_numeric_features(self):
        """Non-numeric features (like 'currency') are silently skipped."""
        raw = {
            "amount": "999.0",
            "currency": "INR",  # This would cause float() to fail
            "device_id": "device123",
            "velocity_score": "0.5",
        }
        parsed = parse_features_from_redis(raw)
        
        # Should have only the numeric fields
        assert parsed == {
            "amount": 999.0,
            "velocity_score": 0.5,
        }
        # Non-numeric fields removed
        assert "currency" not in parsed
        assert "device_id" not in parsed
    
    def test_empty_features_return_empty_dict(self):
        """Empty features dict returns empty dict."""
        parsed = parse_features_from_redis({})
        assert parsed == {}
    
    def test_all_non_numeric_features(self):
        """If all features are non-numeric, result is empty dict."""
        raw = {
            "currency": "INR",
            "remarks": "test payment",
            "device_id": "device1",
        }
        parsed = parse_features_from_redis(raw)
        assert parsed == {}
    
    def test_none_input_returns_empty_dict(self):
        """None input returns empty dict."""
        parsed = parse_features_from_redis(None)
        assert parsed == {}
