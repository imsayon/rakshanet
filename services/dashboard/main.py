import os
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import FastAPI, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import psycopg2
from psycopg2.pool import SimpleConnectionPool

app = FastAPI(title="UPI Sentinel Dashboard")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

POSTGRES_DSN = os.getenv(
    "POSTGRES_DSN",
    "postgresql://sentinel:sentinel2024@localhost:5432/fraud_detection",
)

db_pool: SimpleConnectionPool | None = None


@app.on_event("startup")
def startup() -> None:
    global db_pool
    db_pool = SimpleConnectionPool(1, 10, POSTGRES_DSN)


@app.on_event("shutdown")
def shutdown() -> None:
    global db_pool
    if db_pool is not None:
        db_pool.closeall()


app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
def index() -> FileResponse:
    return FileResponse("static/index.html")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


def _query_one(sql: str, params: tuple[Any, ...] = ()) -> dict[str, Any]:
    assert db_pool is not None
    conn = db_pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            row = cur.fetchone()
            if row is None:
                return {}
            cols = [desc[0] for desc in cur.description]
            return dict(zip(cols, row))
    finally:
        db_pool.putconn(conn)


def _query_all(sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    assert db_pool is not None
    conn = db_pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()
            cols = [desc[0] for desc in cur.description]
            return [dict(zip(cols, row)) for row in rows]
    finally:
        db_pool.putconn(conn)


@app.get("/api/overview")
def overview(minutes: int = Query(default=60, ge=1, le=1440)) -> dict[str, Any]:
    since = datetime.now(timezone.utc) - timedelta(minutes=minutes)

    window = _query_one(
        """
        SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE decision='ALLOW') AS allow_count,
            COUNT(*) FILTER (WHERE decision='FRICTION') AS friction_count,
            COUNT(*) FILTER (WHERE decision='BLOCK') AS block_count,
            COALESCE(AVG(score), 0) AS avg_score,
            COALESCE(AVG(latency_ms), 0) AS avg_latency_ms,
            COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms), 0) AS p95_latency_ms
        FROM decisions
        WHERE timestamp >= %s
        """,
        (since,),
    )

    all_time = _query_one(
        """
        SELECT
            COUNT(*) AS total_all_time,
            COUNT(*) FILTER (WHERE decision='ALLOW') AS allow_all_time,
            COUNT(*) FILTER (WHERE decision='FRICTION') AS friction_all_time,
            COUNT(*) FILTER (WHERE decision='BLOCK') AS block_all_time
        FROM decisions
        """
    )

    total = int(window.get("total", 0) or 0)
    block = int(window.get("block_count", 0) or 0)
    friction = int(window.get("friction_count", 0) or 0)

    block_rate = (block / total * 100) if total else 0.0
    friction_rate = (friction / total * 100) if total else 0.0

    return {
        "window_minutes": minutes,
        "window": {
            "total": total,
            "allow": int(window.get("allow_count", 0) or 0),
            "friction": friction,
            "block": block,
            "block_rate_percent": round(block_rate, 2),
            "friction_rate_percent": round(friction_rate, 2),
            "avg_score": round(float(window.get("avg_score", 0) or 0), 3),
            "avg_latency_ms": round(float(window.get("avg_latency_ms", 0) or 0), 2),
            "p95_latency_ms": round(float(window.get("p95_latency_ms", 0) or 0), 2),
        },
        "all_time": {
            "total": int(all_time.get("total_all_time", 0) or 0),
            "allow": int(all_time.get("allow_all_time", 0) or 0),
            "friction": int(all_time.get("friction_all_time", 0) or 0),
            "block": int(all_time.get("block_all_time", 0) or 0),
        },
    }


@app.get("/api/recent")
def recent(limit: int = Query(default=25, ge=1, le=200)) -> list[dict[str, Any]]:
    rows = _query_all(
        """
        SELECT d.txn_id, d.score, d.decision, d.reasons, d.pattern, d.latency_ms, d.timestamp,
               t.user_vpa, t.payee_vpa, t.amount
        FROM decisions d
        LEFT JOIN transactions t ON d.txn_id = t.txn_id
        ORDER BY d.timestamp DESC
        LIMIT %s
        """,
        (limit,),
    )

    for row in rows:
        ts = row.get("timestamp")
        if hasattr(ts, "isoformat"):
            row["timestamp"] = ts.isoformat()
        if row.get("score") is not None:
            row["score"] = float(row["score"])
    return rows


@app.get("/api/timeseries")
def timeseries(minutes: int = Query(default=60, ge=5, le=1440)) -> list[dict[str, Any]]:
    since = datetime.now(timezone.utc) - timedelta(minutes=minutes)
    rows = _query_all(
        """
        SELECT
            DATE_TRUNC('minute', timestamp) AS minute_bucket,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE decision='ALLOW') AS allow_count,
            COUNT(*) FILTER (WHERE decision='FRICTION') AS friction_count,
            COUNT(*) FILTER (WHERE decision='BLOCK') AS block_count
        FROM decisions
        WHERE timestamp >= %s
        GROUP BY minute_bucket
        ORDER BY minute_bucket ASC
        """,
        (since,),
    )

    out: list[dict[str, Any]] = []
    for row in rows:
        bucket = row.get("minute_bucket")
        out.append(
            {
                "minute": bucket.isoformat() if hasattr(bucket, "isoformat") else str(bucket),
                "total": int(row.get("total", 0) or 0),
                "allow": int(row.get("allow_count", 0) or 0),
                "friction": int(row.get("friction_count", 0) or 0),
                "block": int(row.get("block_count", 0) or 0),
            }
        )
    return out
