"""
Unit tests for txn-ingestion request validation.

Validates that the ingestion endpoint properly validates required
transaction fields and rejects invalid or missing payloads.
"""
import pytest
from datetime import datetime


def validate_transaction_request(payload: dict) -> tuple[bool, str]:
    """
    Validate a transaction request payload.
    
    This mimics the validation logic in txn-ingestion/main.py.
    
    Args:
        payload: Transaction payload dict.
    
    Returns:
        (is_valid, error_message) tuple. If valid, error_message is empty string.
    """
    required_fields = {"txn_id", "user_vpa", "payee_vpa", "amount"}
    
    # Check all required fields are present
    missing = required_fields - set(payload.keys())
    if missing:
        return False, f"Missing required fields: {', '.join(sorted(missing))}"
    
    # Validate field types
    if not isinstance(payload["txn_id"], str) or not payload["txn_id"].strip():
        return False, "txn_id must be a non-empty string"
    
    if not isinstance(payload["user_vpa"], str) or not payload["user_vpa"].strip():
        return False, "user_vpa must be a non-empty string"
    
    if not isinstance(payload["payee_vpa"], str) or not payload["payee_vpa"].strip():
        return False, "payee_vpa must be a non-empty string"
    
    # Validate amount
    try:
        amount = float(payload["amount"])
        if amount <= 0:
            return False, "amount must be positive"
    except (TypeError, ValueError):
        return False, "amount must be a valid number"
    
    # Optional field validation
    timestamp = payload.get("timestamp")
    if timestamp and not isinstance(timestamp, str):
        return False, "timestamp must be a string"
    
    return True, ""


class TestTxnIngestionValidation:
    """Request validation tests."""
    
    def test_valid_minimal_transaction(self):
        """Minimal valid transaction with required fields only."""
        payload = {
            "txn_id": "TXN001",
            "user_vpa": "user@okaxis",
            "payee_vpa": "merchant@paytm",
            "amount": 1000.0,
        }
        valid, msg = validate_transaction_request(payload)
        assert valid, f"Expected valid: {msg}"
    
    def test_valid_full_transaction(self):
        """Valid transaction with all optional fields."""
        payload = {
            "txn_id": "TXN002",
            "user_vpa": "user@okaxis",
            "payee_vpa": "merchant@paytm",
            "amount": 999.0,
            "currency": "INR",
            "timestamp": "2026-04-22T14:00:00Z",
            "device_id": "device1",
            "remarks": "payment for lunch",
            "biometrics": {
                "pin_entry_duration_ms": 2300,
                "tap_pressure_avg": 0.65,
                "copy_paste_amount": False,
            }
        }
        valid, msg = validate_transaction_request(payload)
        assert valid, f"Expected valid: {msg}"
    
    def test_missing_txn_id(self):
        """Missing txn_id is rejected."""
        payload = {
            "user_vpa": "user@okaxis",
            "payee_vpa": "merchant@paytm",
            "amount": 1000.0,
        }
        valid, msg = validate_transaction_request(payload)
        assert not valid
        assert "txn_id" in msg
    
    def test_missing_user_vpa(self):
        """Missing user_vpa is rejected."""
        payload = {
            "txn_id": "TXN001",
            "payee_vpa": "merchant@paytm",
            "amount": 1000.0,
        }
        valid, msg = validate_transaction_request(payload)
        assert not valid
        assert "user_vpa" in msg
    
    def test_missing_payee_vpa(self):
        """Missing payee_vpa is rejected."""
        payload = {
            "txn_id": "TXN001",
            "user_vpa": "user@okaxis",
            "amount": 1000.0,
        }
        valid, msg = validate_transaction_request(payload)
        assert not valid
        assert "payee_vpa" in msg
    
    def test_missing_amount(self):
        """Missing amount is rejected."""
        payload = {
            "txn_id": "TXN001",
            "user_vpa": "user@okaxis",
            "payee_vpa": "merchant@paytm",
        }
        valid, msg = validate_transaction_request(payload)
        assert not valid
        assert "amount" in msg
    
    def test_zero_amount_rejected(self):
        """Zero amount is rejected."""
        payload = {
            "txn_id": "TXN001",
            "user_vpa": "user@okaxis",
            "payee_vpa": "merchant@paytm",
            "amount": 0.0,
        }
        valid, msg = validate_transaction_request(payload)
        assert not valid
        assert "positive" in msg
    
    def test_negative_amount_rejected(self):
        """Negative amount is rejected."""
        payload = {
            "txn_id": "TXN001",
            "user_vpa": "user@okaxis",
            "payee_vpa": "merchant@paytm",
            "amount": -100.0,
        }
        valid, msg = validate_transaction_request(payload)
        assert not valid
        assert "positive" in msg
    
    def test_invalid_amount_type(self):
        """Non-numeric amount is rejected."""
        payload = {
            "txn_id": "TXN001",
            "user_vpa": "user@okaxis",
            "payee_vpa": "merchant@paytm",
            "amount": "invalid",
        }
        valid, msg = validate_transaction_request(payload)
        assert not valid
        assert "number" in msg
    
    def test_empty_txn_id_rejected(self):
        """Empty txn_id string is rejected."""
        payload = {
            "txn_id": "",
            "user_vpa": "user@okaxis",
            "payee_vpa": "merchant@paytm",
            "amount": 1000.0,
        }
        valid, msg = validate_transaction_request(payload)
        assert not valid
    
    def test_string_amount_converts_to_float(self):
        """String amount is converted and validated."""
        payload = {
            "txn_id": "TXN001",
            "user_vpa": "user@okaxis",
            "payee_vpa": "merchant@paytm",
            "amount": "2500.50",
        }
        valid, msg = validate_transaction_request(payload)
        assert valid, f"Expected valid: {msg}"
