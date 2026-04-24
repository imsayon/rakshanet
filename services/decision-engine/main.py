import os
import json
import asyncio
import time
from pathlib import Path
import httpx
from aiokafka import AIOKafkaConsumer, AIOKafkaProducer
from redis.asyncio import Redis
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

KAFKA_BOOTSTRAP = os.getenv("KAFKA_BOOTSTRAP", "localhost:9092")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
RULE_ENGINE_URL = os.getenv("RULE_ENGINE_URL", "http://localhost:9001")
XGBOOST_URL = os.getenv("XGBOOST_URL", "http://localhost:9002")
GNN_URL = os.getenv("GNN_URL", "http://localhost:9003")
LSTM_URL = os.getenv("LSTM_URL", "http://localhost:9004")
NLP_URL = os.getenv("NLP_URL", "http://localhost:9005")
ENSEMBLE_URL = os.getenv("ENSEMBLE_URL", "http://localhost:8002")
ENSEMBLE_METRICS_PATH = Path(os.getenv("ENSEMBLE_METRICS_PATH", "/models/ensemble_metrics.json"))

app = FastAPI(title="UPI Sentinel - Decision Engine")
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
redis_client = None
producer = None
consumer_task = None
block_threshold = 0.55
friction_threshold = 0.40


def _load_runtime_thresholds() -> tuple[float, float]:
    default_block = 0.55
    default_friction = 0.40

    if not ENSEMBLE_METRICS_PATH.exists():
        return default_block, default_friction

    try:
        with open(ENSEMBLE_METRICS_PATH, "r", encoding="utf-8") as f:
            metrics = json.load(f)
        trained_block = float(metrics.get("best_threshold", default_block))
    except Exception as e:
        print(f"[decision-engine] Failed to load ensemble threshold metadata: {e}")
        return default_block, default_friction

    # Keep thresholds sane even if training metadata is noisy.
    trained_block = min(max(trained_block, 0.10), 0.90)
    trained_friction = max(0.05, min(default_friction, trained_block - 0.05))
    return trained_block, trained_friction

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "block_threshold": block_threshold,
        "friction_threshold": friction_threshold,
    }

@app.get("/decision/{txn_id}")
async def get_decision(txn_id: str):
    if redis_client is None:
        return {"error": "not ready"}
    result = await redis_client.hgetall(f"decision:{txn_id}")
    if not result:
        return {"error": "not found", "txn_id": txn_id}
    return result

async def call_model(client, url, payload, timeout=5.0):
    try:
        resp = await client.post(f"{url}/score", json=payload, timeout=timeout)
        data = resp.json()
        return float(data.get("score", 0.0))
    except Exception as e:
        print(f"[decision-engine] {url} failed: {e}")
        return 0.0

async def score_transaction(features: dict, remarks: str = "") -> dict:
    start = time.time()
    txn_id = features.get("txn_id", "")

    async with httpx.AsyncClient() as client:
        model_payload = {"features": features}
        scores = await asyncio.gather(
            call_model(client, RULE_ENGINE_URL, model_payload),
            call_model(client, XGBOOST_URL, model_payload),
            call_model(client, GNN_URL, model_payload),
            call_model(client, LSTM_URL, model_payload),
            call_model(
                client,
                NLP_URL,
                {
                    "remarks": remarks or str(features.get("remarks", "")),
                    "amount": features.get("amount", 0),
                },
            ),
        )
        rule_score, xgb_score, gnn_score, lstm_score, nlp_score = scores
        print(f"[decision-engine] {txn_id}: rule={rule_score:.2f} xgb={xgb_score:.2f} gnn={gnn_score:.2f} lstm={lstm_score:.2f} nlp={nlp_score:.2f}")

        try:
            ensemble_payload = {
                "features": features,
                "scores": [rule_score, xgb_score, gnn_score, lstm_score, nlp_score],
            }
            resp = await client.post(f"{ENSEMBLE_URL}/predict", json=ensemble_payload, timeout=5.0)
            ensemble_data = resp.json()
            final_score = float(ensemble_data.get("score", 0.0))
            reasons = ensemble_data.get("reasons", [])
            pattern = ensemble_data.get("pattern", None)
        except Exception as e:
            print(f"[decision-engine] Ensemble failed: {e}, using weighted average")
            final_score = (rule_score * 0.25 + xgb_score * 0.35 +
                          gnn_score * 0.15 + lstm_score * 0.10 + nlp_score * 0.15)
            reasons = []
            pattern = None

    if final_score >= block_threshold:
        decision = "BLOCK"
    elif final_score >= friction_threshold:
        decision = "FRICTION"
    else:
        decision = "ALLOW"

    latency_ms = int((time.time() - start) * 1000)
    result = {
        "txn_id": txn_id,
        "user_vpa": str(features.get("user_vpa", "")),
        "payee_vpa": str(features.get("payee_vpa", "")),
        "amount": features.get("amount", 0.0),
        "currency": features.get("currency", "INR"),
        "timestamp": features.get("timestamp", ""),
        "device_id": features.get("device_id", ""),
        "remarks": features.get("remarks", remarks),
        "app_version": features.get("app_version", "4.2.1"),
        "score": round(final_score, 3),
        "decision": decision,
        "reasons": reasons,
        "pattern": pattern,
        "latency_ms": latency_ms,
        "individual_scores": {
            "rule": round(rule_score, 3),
            "xgboost": round(xgb_score, 3),
            "gnn": round(gnn_score, 3),
            "lstm": round(lstm_score, 3),
            "nlp": round(nlp_score, 3),
        }
    }
    print(f"[decision-engine] {txn_id} → score={final_score:.3f} decision={decision} latency={latency_ms}ms")
    return result


async def persist_and_publish_decision(result: dict):
    """Store latest decision for lookup and publish to action executor."""
    if redis_client is not None:
        await redis_client.hset(
            f"decision:{result['txn_id']}",
            mapping={k: str(v) for k, v in result.items()},
        )
        await redis_client.expire(f"decision:{result['txn_id']}", 3600)

    if producer is not None:
        await producer.send_and_wait("decision.made", result)


async def get_enriched_features(txn_id: str, attempts: int = 10, delay: float = 0.1) -> dict:
    """Fetch feature-engine output for an ingested transaction when available."""
    if redis_client is None or not txn_id:
        return {}

    for _ in range(attempts):
        features = await redis_client.hgetall(f"features:{txn_id}")
        if features:
            return features
        await asyncio.sleep(delay)
    return {}


@app.post("/score")
async def score_direct(request: dict):
    """Direct scoring endpoint for UI demos and smoke tests."""
    explicit_features = request.get("features")
    features = explicit_features or request
    txn_id = str(features.get("txn_id", request.get("txn_id", "")))

    if explicit_features is None:
        enriched = await get_enriched_features(txn_id)
        if enriched:
            features = {**features, **enriched}

    remarks = str(request.get("remarks", "") or features.get("remarks", ""))
    result = await score_transaction(features, remarks=remarks)
    await persist_and_publish_decision(result)
    return result

@app.post("/config/thresholds")
async def update_thresholds(request: dict):
    global block_threshold, friction_threshold
    if "block" in request:
        block_threshold = float(request["block"])
    if "friction" in request:
        friction_threshold = float(request["friction"])
    print(f"[decision-engine] Thresholds updated via API: block={block_threshold:.2f}, friction={friction_threshold:.2f}")
    return {
        "status": "ok",
        "block_threshold": block_threshold,
        "friction_threshold": friction_threshold
    }

async def consume_and_decide():
    for attempt in range(20):
        try:
            consumer = AIOKafkaConsumer(
                "txn.enriched",
                bootstrap_servers=KAFKA_BOOTSTRAP,
                value_deserializer=lambda m: json.loads(m.decode()),
                group_id="decision-engine",
                auto_offset_reset="earliest",
            )
            await consumer.start()
            print(f"[decision-engine] Consumer connected on txn.enriched")
            break
        except Exception as e:
            print(f"[decision-engine] Consumer attempt {attempt+1}/20 failed: {e}")
            await asyncio.sleep(5)
    else:
        raise RuntimeError("Could not connect consumer after 20 attempts")

    try:
        async for message in consumer:
            features = message.value
            txn_id = features.get("txn_id", "unknown")
            try:
                if await redis_client.exists(f"decision:{txn_id}"):
                    print(f"[decision-engine] Skipping {txn_id}; decision already exists")
                    continue
                remarks = await redis_client.get(f"remarks:{txn_id}") or ""
                if not remarks:
                    remarks = str(features.get("remarks", ""))
                result = await score_transaction(features, remarks=remarks)
                await persist_and_publish_decision(result)
                print(f"[decision-engine] Published decision for {txn_id}")
            except Exception as e:
                print(f"[decision-engine] Error scoring {txn_id}: {e}")
    finally:
        await consumer.stop()

@app.on_event("startup")
async def startup():
    global redis_client, producer, consumer_task, block_threshold, friction_threshold
    redis_client = Redis.from_url(REDIS_URL, decode_responses=True)
    block_threshold, friction_threshold = _load_runtime_thresholds()
    print(
        f"[decision-engine] Runtime thresholds loaded: "
        f"block={block_threshold:.2f}, friction={friction_threshold:.2f}"
    )
    for attempt in range(10):
        try:
            producer = AIOKafkaProducer(
                bootstrap_servers=KAFKA_BOOTSTRAP,
                value_serializer=lambda v: json.dumps(v).encode(),
            )
            await producer.start()
            print(f"[decision-engine] Producer connected")
            break
        except Exception as e:
            print(f"[decision-engine] Producer attempt {attempt+1}/10 failed: {e}")
            await asyncio.sleep(5)
    consumer_task = asyncio.create_task(consume_and_decide())

@app.on_event("shutdown")
async def shutdown():
    if consumer_task:
        consumer_task.cancel()
    if producer:
        await producer.stop()
    if redis_client:
        await redis_client.aclose()

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=False)
