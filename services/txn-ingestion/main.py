import os
import json
import hashlib
from datetime import datetime
from typing import Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator
from aiokafka import AIOKafkaProducer
from redis.asyncio import Redis

app = FastAPI(title="UPI Sentinel - Transaction Ingestion")

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

KAFKA_BOOTSTRAP = os.getenv("KAFKA_BOOTSTRAP", "localhost:9092")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
POSTGRES_DSN = os.getenv(
    "POSTGRES_DSN",
    "postgresql://sentinel:sentinel2024@localhost:5432/fraud_detection",
)

producer: AIOKafkaProducer = None
redis_client: Redis = None

# Lazy asyncpg pool — avoid blocking psycopg2 in the event loop
_db_pool = None


async def _get_db_pool():
    global _db_pool
    if _db_pool is None:
        import asyncpg
        _db_pool = await asyncpg.create_pool(POSTGRES_DSN)
    return _db_pool


def _parse_timestamp(value: str) -> datetime:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except Exception:
        return datetime.utcnow()


@app.on_event("startup")
async def startup():
    global producer, redis_client
    producer = AIOKafkaProducer(
        bootstrap_servers=KAFKA_BOOTSTRAP,
        value_serializer=lambda v: json.dumps(v).encode(),
        compression_type="gzip",
    )
    await producer.start()
    redis_client = Redis.from_url(REDIS_URL, decode_responses=True)


@app.on_event("shutdown")
async def shutdown():
    global _db_pool
    await producer.stop()
    await redis_client.aclose()
    if _db_pool:
        await _db_pool.close()


class QRMetadata(BaseModel):
    qr_id: Optional[str] = None
    merchant_name: Optional[str] = None


class Biometrics(BaseModel):
    pin_entry_duration_ms: int = 2500
    tap_pressure_avg: float = 0.6
    copy_paste_amount: bool = False
    app_bg_switch_count: int = 0


class Transaction(BaseModel):
    txn_id: str
    user_vpa: str
    payee_vpa: str
    amount: float
    currency: str = "INR"
    timestamp: str
    device_id: str
    app_version: str = "1.0.0"
    remarks: str = ""
    qr_metadata: Optional[QRMetadata] = None
    biometrics: Optional[Biometrics] = None

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, v):
        if v < 0 or v > 200000:
            raise ValueError("amount must be between 0 and 200000")
        return v


@app.post("/v1/transaction")
async def ingest_transaction(txn: Transaction):
    try:
        # 1. Deduplicate
        dedup_key = f"txn_dedup:{txn.txn_id}"
        if await redis_client.exists(dedup_key):
            return {"status": "duplicate", "txn_id": txn.txn_id}

        # 2. QR mismatch detection
        qr_mismatch = False
        if txn.qr_metadata and txn.qr_metadata.merchant_name:
            merchant_slug = txn.qr_metadata.merchant_name.lower().replace(" ", "")
            payee_prefix = txn.payee_vpa.split("@")[0].lower()
            qr_mismatch = (
                merchant_slug not in payee_prefix
                and payee_prefix not in merchant_slug
            )

        # 3. Persist to Postgres (async)
        try:
            pool = await _get_db_pool()
            async with pool.acquire() as conn:
                await conn.execute(
                    """
                    INSERT INTO transactions (
                        txn_id, user_vpa, payee_vpa, amount, timestamp,
                        device_id, remarks, app_version
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    ON CONFLICT (txn_id) DO NOTHING
                    """,
                    txn.txn_id,
                    txn.user_vpa,
                    txn.payee_vpa,
                    txn.amount,
                    _parse_timestamp(txn.timestamp),
                    txn.device_id,
                    txn.remarks,
                    txn.app_version,
                )
        except Exception as db_err:
            print(f"[txn-ingestion] DB insert warning: {db_err}")

        # 4. Mark deduplicated
        await redis_client.setex(dedup_key, 3600, "1")
        await redis_client.setex(f"remarks:{txn.txn_id}", 3600, txn.remarks or "")

        # 5. Build Kafka payload (include qr_mismatch + biometrics)
        payload = txn.dict()
        payload["qr_mismatch"] = qr_mismatch

        await producer.send_and_wait("txn.raw", payload)

        return {"status": "accepted", "txn_id": txn.txn_id}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health():
    return {"status": "ok"}
