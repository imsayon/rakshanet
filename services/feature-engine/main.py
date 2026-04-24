import os
import json
import time
import asyncio
from aiokafka import AIOKafkaConsumer, AIOKafkaProducer
from aiokafka.errors import KafkaConnectionError
from redis.asyncio import Redis

KAFKA_BOOTSTRAP = os.getenv("KAFKA_BOOTSTRAP", "localhost:9092")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
WINDOW_1H = 3600
WINDOW_24H = 86400

redis_client = None
producer = None


async def startup():
    global redis_client, producer
    redis_client = Redis.from_url(REDIS_URL, decode_responses=True)

    # Retry producer start until Kafka is ready
    for attempt in range(10):
        try:
            producer = AIOKafkaProducer(
                bootstrap_servers=KAFKA_BOOTSTRAP,
                value_serializer=lambda v: json.dumps(v).encode(),
            )
            await producer.start()
            print(f"[feature-engine] Producer connected to Kafka")
            break
        except Exception as e:
            print(f"[feature-engine] Producer connection attempt {attempt+1}/10 failed: {e}")
            await asyncio.sleep(5)
    else:
        raise RuntimeError("Could not connect producer to Kafka after 10 attempts")


async def shutdown():
    await producer.stop()
    await redis_client.aclose()


async def compute_features(txn: dict) -> dict:
    txn_id = txn.get("txn_id", "")
    user_vpa = txn.get("user_vpa", "")
    payee_vpa = txn.get("payee_vpa", "")
    device_id = txn.get("device_id", "")
    amount = float(txn.get("amount", 0))

    now = time.time()
    biometrics = txn.get("biometrics") or {}

    pipe = redis_client.pipeline()
    pipe.incr(f"velocity:{user_vpa}:count")
    pipe.expire(f"velocity:{user_vpa}:count", WINDOW_1H)
    pipe.incrbyfloat(f"amount:{user_vpa}:sum", amount)
    pipe.expire(f"amount:{user_vpa}:sum", WINDOW_1H)
    pipe.setnx(f"payee:{payee_vpa}:first_seen", str(now))
    pipe.get(f"payee:{payee_vpa}:first_seen")
    pipe.incr(f"payee:{payee_vpa}:recv_count")
    pipe.expire(f"payee:{payee_vpa}:recv_count", WINDOW_1H)
    pipe.sadd(f"device:{device_id}:users", user_vpa)
    pipe.expire(f"device:{device_id}:users", WINDOW_24H)
    pipe.scard(f"device:{device_id}:users")
    pipe.get(f"stats:{user_vpa}:avg_amount")

    results = await pipe.execute()

    txn_count_1h = int(results[0])
    txn_amount_sum_1h = float(results[2])
    first_seen_ts = float(results[5]) if results[5] else now
    new_payee_flag = 1 if (now - first_seen_ts) < WINDOW_24H and results[4] else 0
    payee_receive_count_1h = int(results[6])
    device_user_count = int(results[10])
    old_avg_str = results[11]

    old_avg = float(old_avg_str) if old_avg_str else amount
    new_avg = 0.9 * old_avg + 0.1 * amount
    await redis_client.set(f"stats:{user_vpa}:avg_amount", str(new_avg))
    amount_deviation = abs(amount - old_avg) / (old_avg + 1e-6)

    pin_entry_duration_ms = int(biometrics.get("pin_entry_duration_ms", 2500))
    tap_pressure_avg = float(biometrics.get("tap_pressure_avg", 0.6))
    copy_paste_amount = int(bool(biometrics.get("copy_paste_amount", False)))
    app_bg_switch_count = int(biometrics.get("app_bg_switch_count", 0))

    from datetime import datetime
    try:
        ts = datetime.fromisoformat(txn.get("timestamp", "").replace("Z", "+00:00"))
    except Exception:
        ts = datetime.utcnow()

    features = {
        "txn_id": txn_id,
        "user_vpa": user_vpa,
        "payee_vpa": payee_vpa,
        "remarks": str(txn.get("remarks", "")),
        "amount": amount,
        "hour_of_day": ts.hour,
        "day_of_week": ts.weekday(),
        "txn_count_1h": txn_count_1h,
        "txn_amount_sum_1h": txn_amount_sum_1h,
        "new_payee_flag": new_payee_flag,
        "device_user_count": device_user_count,
        "amount_deviation": round(amount_deviation, 4),
        "payee_receive_count_1h": payee_receive_count_1h,
        "pin_entry_duration_ms": pin_entry_duration_ms,
        "tap_pressure_avg": tap_pressure_avg,
        "copy_paste_amount": copy_paste_amount,
        "app_bg_switch_count": app_bg_switch_count,
        "qr_mismatch": int(txn.get("qr_mismatch", False)),
    }

    await redis_client.hset(
        f"features:{txn_id}",
        mapping={k: str(v) for k, v in features.items()},
    )
    await redis_client.expire(f"features:{txn_id}", WINDOW_1H)

    print(f"[feature-engine] Enriched {txn_id} → new_payee={new_payee_flag} deviation={amount_deviation:.2f} velocity={txn_count_1h}")
    return features


async def consume_and_enrich():
    # Retry consumer start until topics are available
    for attempt in range(20):
        try:
            consumer = AIOKafkaConsumer(
                "txn.raw",
                bootstrap_servers=KAFKA_BOOTSTRAP,
                value_deserializer=lambda m: json.loads(m.decode()),
                group_id="feature-engine",
                auto_offset_reset="earliest",
            )
            await consumer.start()
            print(f"[feature-engine] Consumer connected, listening on txn.raw")
            break
        except Exception as e:
            print(f"[feature-engine] Consumer attempt {attempt+1}/20 failed: {e}")
            await asyncio.sleep(5)
    else:
        raise RuntimeError("Could not connect consumer after 20 attempts")

    try:
        async for message in consumer:
            txn = message.value
            try:
                enriched = await compute_features(txn)
                await producer.send_and_wait("txn.enriched", enriched)
                print(f"[feature-engine] Sent enriched txn to txn.enriched")
            except Exception as e:
                print(f"[feature-engine] Error enriching {txn.get('txn_id')}: {e}")
    finally:
        await consumer.stop()


async def main():
    await startup()
    try:
        await consume_and_enrich()
    finally:
        await shutdown()


if __name__ == "__main__":
    asyncio.run(main())
