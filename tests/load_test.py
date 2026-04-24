"""
Locust load testing script for UPI Sentinel transaction ingestion endpoint.

Usage:
    locust -f tests/load_test.py --host http://localhost:8000

This script:
- Simulates realistic UPI transaction payloads
- Validates HTTP 200 and response contains txn_id
- Generates configurable transaction mix (amounts, VPAs)
- Measures response time and throughput

Example with Locust Web UI:
    locust -f tests/load_test.py --host http://localhost:8000
    (Then open http://localhost:8089 in browser)

Example headless (100 users, 10 spawn rate, 2 min):
    locust -f tests/load_test.py --host http://localhost:8000 \\
      --users 100 --spawn-rate 10 --run-time 2m --headless
"""
import json
import time
import random
from locust import HttpUser, task, between


class TransactionSimulator(HttpUser):
    """Locust user that generates realistic UPI transaction requests."""
    
    # Wait 1-3 seconds between requests per user
    wait_time = between(1, 3)
    
    @task(3)
    def post_regular_transaction(self):
        """
        Regular transaction: smaller amounts, common patterns.
        Weight: 3 (relative frequency).
        """
        payload = self._build_transaction_payload(
            amount=random.choice([100, 500, 1000, 2000, 5000]),
            remarks=random.choice([
                "lunch payment",
                "groceries",
                "rent",
                "utility bill",
                "gift",
            ])
        )
        self._post_transaction(payload)
    
    @task(1)
    def post_high_value_transaction(self):
        """
        High-value transaction: larger amounts, potentially higher risk.
        Weight: 1 (less frequent).
        """
        payload = self._build_transaction_payload(
            amount=random.choice([10000, 25000, 50000]),
            remarks=random.choice([
                "merchant payment",
                "business transfer",
                "investment",
            ])
        )
        self._post_transaction(payload)
    
    @task(1)
    def post_refund_scam_pattern(self):
        """
        Simulate refund-scam pattern (small amount, specific remarks).
        Weight: 1.
        """
        payload = self._build_transaction_payload(
            amount=random.choice([199, 499, 999]),
            remarks="refund processing fee",
            copy_paste_amount=True,
        )
        self._post_transaction(payload)
    
    def _build_transaction_payload(
        self,
        amount: float,
        remarks: str = "test payment",
        copy_paste_amount: bool = False,
    ) -> dict:
        """Build a realistic transaction payload."""
        txn_id = f"LOAD_{int(time.time() * 1000000)}_{random.randint(1000, 9999)}"
        
        return {
            "txn_id": txn_id,
            "user_vpa": f"user{random.randint(1, 1000)}@okaxis",
            "payee_vpa": f"merchant{random.randint(1, 5000)}@paytm",
            "amount": amount,
            "currency": "INR",
            "timestamp": str(time.time()),
            "device_id": f"device{random.randint(1, 100)}",
            "app_version": "4.2.1",
            "remarks": remarks,
            "biometrics": {
                "pin_entry_duration_ms": random.randint(1500, 3500),
                "tap_pressure_avg": random.uniform(0.4, 0.9),
                "copy_paste_amount": copy_paste_amount,
            }
        }
    
    def _post_transaction(self, payload: dict):
        """POST transaction and validate response."""
        with self.client.post(
            "/v1/transaction",
            json=payload,
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                try:
                    data = resp.json()
                    if data.get("status") == "accepted" and data.get("txn_id"):
                        resp.success()
                    else:
                        resp.failure(f"Unexpected response: {data}")
                except json.JSONDecodeError:
                    resp.failure(f"Invalid JSON: {resp.text}")
            else:
                resp.failure(f"HTTP {resp.status_code}: {resp.text}")
