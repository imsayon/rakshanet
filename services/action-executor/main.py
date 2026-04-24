import os
import json
import asyncio
import asyncpg
from datetime import datetime
from aiokafka import AIOKafkaConsumer

KAFKA_BOOTSTRAP = os.getenv("KAFKA_BOOTSTRAP", "localhost:9092")
POSTGRES_DSN = os.getenv(
    "POSTGRES_DSN",
    "postgresql://sentinel:sentinel2024@localhost:5432/fraud_detection",
)

db_pool: asyncpg.Pool = None


async def init_db():
    global db_pool
    for attempt in range(10):
        try:
            db_pool = await asyncpg.create_pool(POSTGRES_DSN)
            print(f"[action-executor] DB pool created")
            return
        except Exception as e:
            print(f"[action-executor] DB connect attempt {attempt+1} failed: {e}")
            await asyncio.sleep(3)
    raise RuntimeError("Could not connect to Postgres after 10 attempts")


async def log_decision(decision: dict):
    """Persist decision to Postgres using async connection pool."""
    try:
        async with db_pool.acquire() as conn:
            # Upsert transaction row if it doesn't exist yet
            await conn.execute(
                """
                INSERT INTO transactions (txn_id, user_vpa, payee_vpa, amount, timestamp)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (txn_id) DO NOTHING
                """,
                decision["txn_id"],
                decision.get("user_vpa", ""),
                decision.get("payee_vpa", ""),
                float(decision.get("amount", 0)),
                datetime.utcnow(),
            )

            # Insert decision record
            await conn.execute(
                "DELETE FROM decisions WHERE txn_id = $1",
                decision["txn_id"],
            )
            await conn.execute(
                """
                INSERT INTO decisions (
                    txn_id, score, decision, reasons, pattern, latency_ms, timestamp
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                """,
                decision["txn_id"],
                float(decision["score"]),
                decision["decision"],
                decision.get("reasons", []),
                decision.get("pattern", "NONE"),
                int(decision.get("latency_ms", 0)),
                datetime.utcnow(),
            )
            print(f"[action-executor] Logged decision for {decision['txn_id']}")
    except Exception as e:
        print(f"[action-executor] DB error: {e}")


async def consume_decisions():
    while True:
        consumer = None
        try:
            print("[action-executor] Connecting to Kafka...")
            consumer = AIOKafkaConsumer(
                "decision.made",
                bootstrap_servers=KAFKA_BOOTSTRAP,
                value_deserializer=lambda m: json.loads(m.decode()),
                group_id="action-executor",
                auto_offset_reset="earliest",
            )

            await consumer.start()
            print("[action-executor] Kafka consumer started, listening...")

            async for message in consumer:
                decision = message.value
                await log_decision(decision)

                action = decision.get("decision")
                txn_id = decision.get("txn_id", "?")
                score = decision.get("score", 0)
                pattern = decision.get("pattern", "NONE")

                if action == "BLOCK":
                    print(f"[BLOCK] {txn_id} | score={score} | pattern={pattern}")
                elif action == "FRICTION":
                    print(f"[FRICTION] {txn_id} | Step-up auth required | pattern={pattern}")
                else:
                    print(f"[ALLOW] {txn_id} | score={score}")

        except Exception as e:
            print(f"[action-executor] Kafka error: {e}, retrying in 5s...")
            await asyncio.sleep(5)
        finally:
            if consumer:
                try:
                    await consumer.stop()
                except:
                    pass


async def main():
    await init_db()
    await consume_decisions()


if __name__ == "__main__":
    asyncio.run(main())
