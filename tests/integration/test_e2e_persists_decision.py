"""
Integration test: End-to-end transaction pipeline with database persistence.

This test validates the critical path:
  txn-ingestion (POST /v1/transaction) → Kafka → decision-engine (POST /score) → Postgres

Requires: `make up` or `docker compose up -d` to be running.

Flow:
  1. Health check both services
  2. POST a transaction to txn-ingestion (should return 200, {"status":"accepted"})
  3. POST a score request to decision-engine (should return 200 with decision)
  4. Poll Postgres decisions table until the row appears (validates FK constraint + persistence)
  5. Assert decision was recorded correctly
"""
import time
import httpx
import pytest

from tests.integration._helpers import (
    assert_services_healthy,
    build_transaction_payload,
    poll_decision_in_postgres,
    count_decisions_in_postgres,
)


class TestE2ETransactionPersistence:
    """End-to-end integration tests for the fraud detection pipeline."""
    
    @classmethod
    def setup_class(cls):
        """Verify Docker Compose services are running before any tests."""
        assert_services_healthy()
    
    def test_e2e_transaction_flows_through_pipeline_and_persists(self):
        """
        Full end-to-end: ingest → score → database persistence.
        
        This is the critical test that validates:
        - txn-ingestion accepts the transaction and writes to Postgres
        - decision-engine scores without string-to-float errors
        - action-executor consumes the decision and persists to Postgres
        - FK constraint is satisfied (transactions table has the txn_id)
        """
        # Generate unique transaction ID (timestamp-based)
        txn_id = f"E2E_TEST_{int(time.time() * 1000)}"
        
        # Build a realistic transaction payload
        txn_payload = build_transaction_payload(
            txn_id=txn_id,
            user_vpa="test_user@okaxis",
            payee_vpa="test_merchant@paytm",
            amount=999.0,
            remarks="integration test payment",
        )
        
        # Step 1: Ingest transaction via txn-ingestion service
        with httpx.Client() as client:
            ingest_resp = client.post(
                "http://localhost:8000/v1/transaction",
                json=txn_payload,
                timeout=10.0,
            )
        
        assert ingest_resp.status_code == 200, (
            f"txn-ingestion failed: {ingest_resp.status_code} {ingest_resp.text}"
        )
        ingest_data = ingest_resp.json()
        assert ingest_data.get("status") == "accepted"
        assert ingest_data.get("txn_id") == txn_id
        
        # Step 2: Score the transaction via decision-engine
        score_payload = {
            "txn_id": txn_id,
            "user_vpa": txn_payload["user_vpa"],
            "payee_vpa": txn_payload["payee_vpa"],
            "amount": txn_payload["amount"],
            "remarks": txn_payload["remarks"],
            "timestamp": txn_payload["timestamp"],
        }
        
        with httpx.Client() as client:
            score_resp = client.post(
                "http://localhost:8001/score",
                json=score_payload,
                timeout=10.0,
            )
        
        assert score_resp.status_code == 200, (
            f"decision-engine failed: {score_resp.status_code} {score_resp.text}"
        )
        score_data = score_resp.json()
        assert score_data.get("txn_id") == txn_id
        assert score_data.get("decision") in ["ALLOW", "FRICTION", "BLOCK"]
        assert isinstance(score_data.get("score"), (int, float))
        
        # Step 3: Poll Postgres until the decision is persisted
        # This validates:
        #   - txn-ingestion wrote to transactions table (FK constraint)
        #   - action-executor consumed and wrote to decisions table
        decision_row = poll_decision_in_postgres(
            txn_id=txn_id,
            timeout_seconds=20.0,
        )
        
        assert decision_row is not None, (
            f"Decision row for txn_id={txn_id} not found in Postgres after 20s poll. "
            "Ensure action-executor is running and can connect to Postgres."
        )
        
        # Verify the decision row matches what we got from decision-engine
        assert decision_row["txn_id"] == txn_id
        assert decision_row["decision"] == score_data.get("decision")
        # Handle Decimal type from PostgreSQL
        score_diff = abs(float(decision_row["score"]) - float(score_data.get("score")))
        assert score_diff < 0.01, f"Score mismatch: {score_diff}"
        assert isinstance(decision_row["reasons"], (list, type(None)))
    
    def test_e2e_multiple_transactions_persist_independently(self):
        """
        Multiple transactions can be processed in parallel and
        each decision persists independently to Postgres.
        """
        txn_ids = [
            f"MULTI_{i}_{int(time.time() * 1000)}"
            for i in range(3)
        ]
        
        # Ingest all 3 transactions
        with httpx.Client() as client:
            for idx, txn_id in enumerate(txn_ids):
                payload = build_transaction_payload(
                    txn_id=txn_id,
                    amount=500.0 + idx*100,
                )
                resp = client.post(
                    "http://localhost:8000/v1/transaction",
                    json=payload,
                    timeout=10.0,
                )
                assert resp.status_code == 200
        
        # Score all 3 transactions
        with httpx.Client() as client:
            for txn_id in txn_ids:
                payload = build_transaction_payload(txn_id=txn_id)
                score_payload = {
                    "txn_id": payload["txn_id"],
                    "user_vpa": payload["user_vpa"],
                    "payee_vpa": payload["payee_vpa"],
                    "amount": payload["amount"],
                    "remarks": payload["remarks"],
                    "timestamp": payload["timestamp"],
                }
                resp = client.post(
                    "http://localhost:8001/score",
                    json=score_payload,
                    timeout=10.0,
                )
                assert resp.status_code == 200
        
        # Poll for all 3 decisions to be persisted
        for txn_id in txn_ids:
            decision_row = poll_decision_in_postgres(
                txn_id=txn_id,
                timeout_seconds=20.0,
            )
            assert decision_row is not None, (
                f"Decision for txn_id={txn_id} not persisted"
            )
            assert decision_row["txn_id"] == txn_id
