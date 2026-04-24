"""
Helper utilities for integration tests.

Provides:
- Service health checking (http://localhost:8000/health, etc.)
- Postgres connection pooling and polling utilities
- Transaction payload builders
- Decision row polling (with timeout and retry logic)
"""
import os
import time
from typing import Optional, Dict, Any
import httpx
import psycopg2
from psycopg2 import pool


# Postgres connection
_pg_pool: Optional[pool.SimpleConnectionPool] = None


def get_postgres_dsn() -> str:
    """
    Get Postgres DSN from environment or use default.
    
    Defaults to localhost:5432 fraud_detection database with sentinel:sentinel2024 credentials.
    Can be overridden via POSTGRES_DSN environment variable.
    """
    return os.getenv(
        "POSTGRES_DSN",
        "postgresql://sentinel:sentinel2024@localhost:5432/fraud_detection"
    )


def get_postgres_connection():
    """
    Get a PostgreSQL connection from the pool.
    
    Initializes the pool on first call with 1 min, 5 max connections.
    """
    global _pg_pool
    if _pg_pool is None:
        dsn = get_postgres_dsn()
        _pg_pool = psycopg2.pool.SimpleConnectionPool(1, 5, dsn)
    return _pg_pool.getconn()


def return_postgres_connection(conn):
    """Return a connection to the pool."""
    global _pg_pool
    if _pg_pool:
        _pg_pool.putconn(conn)


def check_service_health(url: str, timeout: float = 5.0) -> bool:
    """
    Check if a service's /health endpoint is reachable and returns 200.
    
    Args:
        url: Base URL of the service (e.g., http://localhost:8000).
        timeout: Request timeout in seconds.
    
    Returns:
        True if service is healthy, False otherwise.
    """
    try:
        resp = httpx.get(f"{url}/health", timeout=timeout)
        return resp.status_code == 200
    except Exception:
        return False


def assert_services_healthy():
    """
    Assert that required services are reachable.
    
    Raises AssertionError if txn-ingestion or decision-engine are not healthy.
    """
    services = {
        "txn-ingestion (8000)": "http://localhost:8000",
        "decision-engine (8001)": "http://localhost:8001",
    }
    
    unhealthy = []
    for name, url in services.items():
        if not check_service_health(url):
            unhealthy.append(name)
    
    if unhealthy:
        raise AssertionError(
            f"Services not healthy: {', '.join(unhealthy)}. "
            "Ensure 'make up' or 'docker compose up -d' is running."
        )


def build_transaction_payload(
    txn_id: str,
    user_vpa: str = "user@okaxis",
    payee_vpa: str = "merchant@paytm",
    amount: float = 999.0,
    remarks: str = "test payment",
) -> Dict[str, Any]:
    """
    Build a minimal transaction payload for testing.
    
    Args:
        txn_id: Unique transaction ID.
        user_vpa: Sender UPI address.
        payee_vpa: Receiver UPI address.
        amount: Transaction amount in rupees.
        remarks: Transaction remarks (optional).
    
    Returns:
        Transaction dict suitable for POST to /v1/transaction.
    """
    return {
        "txn_id": txn_id,
        "user_vpa": user_vpa,
        "payee_vpa": payee_vpa,
        "amount": amount,
        "currency": "INR",
        "timestamp": str(time.time()),
        "device_id": "device1",
        "app_version": "1.0.0",
        "remarks": remarks,
        "biometrics": {
            "pin_entry_duration_ms": 2200,
            "tap_pressure_avg": 0.6,
            "copy_paste_amount": False,
        }
    }


def poll_decision_in_postgres(
    txn_id: str,
    timeout_seconds: float = 20.0,
    poll_interval_seconds: float = 0.5,
) -> Optional[Dict[str, Any]]:
    """
    Poll PostgreSQL until a decision row is found for the given txn_id.
    
    Args:
        txn_id: The transaction ID to look for.
        timeout_seconds: Maximum time to wait before giving up.
        poll_interval_seconds: Time to wait between poll attempts.
    
    Returns:
        Decision row dict (txn_id, score, decision, reasons, pattern, latency_ms, timestamp)
        or None if not found within timeout.
    """
    conn = get_postgres_connection()
    try:
        start_time = time.time()
        while time.time() - start_time < timeout_seconds:
            cur = conn.cursor()
            try:
                cur.execute(
                    "SELECT txn_id, score, decision, reasons, pattern, latency_ms, timestamp "
                    "FROM decisions WHERE txn_id = %s",
                    (txn_id,)
                )
                row = cur.fetchone()
                if row:
                    return {
                        "txn_id": row[0],
                        "score": row[1],
                        "decision": row[2],
                        "reasons": row[3],
                        "pattern": row[4],
                        "latency_ms": row[5],
                        "timestamp": row[6],
                    }
            finally:
                cur.close()
            
            time.sleep(poll_interval_seconds)
        
        return None
    finally:
        return_postgres_connection(conn)


def count_decisions_in_postgres() -> int:
    """Get total count of rows in decisions table."""
    conn = get_postgres_connection()
    try:
        cur = conn.cursor()
        try:
            cur.execute("SELECT COUNT(*) FROM decisions")
            return cur.fetchone()[0]
        finally:
            cur.close()
    finally:
        return_postgres_connection(conn)
