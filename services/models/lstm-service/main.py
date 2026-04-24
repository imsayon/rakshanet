import os
import asyncio
import asyncpg
import torch
import torch.nn as nn
import numpy as np
from fastapi import FastAPI

app = FastAPI(title="LSTM Service")

model = None
db_pool: asyncpg.Pool = None

POSTGRES_DSN = os.getenv(
    "POSTGRES_DSN",
    "postgresql://sentinel:sentinel2024@localhost:5432/fraud_detection",
)
SEQ_LEN = 20
FEATURES_PER_STEP = 4
HIDDEN = 128
LAYERS = 2


# ── Model architecture (must match training/train_lstm.py) ──
class FraudLSTM(nn.Module):
    def __init__(self, input_size=FEATURES_PER_STEP, hidden=HIDDEN, layers=LAYERS):
        super().__init__()
        self.lstm = nn.LSTM(input_size, hidden, layers,
                            batch_first=True, dropout=0.3)
        self.classifier = nn.Sequential(
            nn.Linear(hidden, 64),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(64, 1),
            nn.Sigmoid(),
        )

    def forward(self, x):
        out, _ = self.lstm(x)
        return self.classifier(out[:, -1, :]).squeeze(1)


def _load_model() -> FraudLSTM | None:
    """Load the trained LSTM in a Docker-friendly way."""
    best_path = "/models/lstm_best.pt"
    full_path = "/models/lstm_model.pt"

    if os.path.exists(best_path):
        try:
            state_dict = torch.load(best_path, map_location="cpu")
            model = FraudLSTM()
            model.load_state_dict(state_dict)
            model.eval()
            print("[lstm-service] Loaded lstm_best.pt state_dict")
            return model
        except Exception as e:
            print(f"[lstm-service] Failed to load lstm_best.pt: {e}")

    if os.path.exists(full_path):
        try:
            import __main__

            setattr(__main__, "FraudLSTM", FraudLSTM)
            model = torch.load(full_path, map_location="cpu")
            if isinstance(model, nn.Module):
                model.eval()
                print("[lstm-service] Loaded lstm_model.pt module")
                return model

            if isinstance(model, dict):
                restored = FraudLSTM()
                restored.load_state_dict(model)
                restored.eval()
                print("[lstm-service] Loaded lstm_model.pt state_dict")
                return restored
        except Exception as e:
            print(f"[lstm-service] Failed to load lstm_model.pt: {e}")

    return None


@app.on_event("startup")
async def startup():
    global model, db_pool

    model = _load_model()

    # Connect to Postgres with retry logic
    for attempt in range(1, 6):
        try:
            db_pool = await asyncpg.create_pool(POSTGRES_DSN)
            print(f"[lstm-service] DB connected (attempt {attempt})")
            break
        except Exception as e:
            print(f"[lstm-service] DB connection attempt {attempt}/5 failed: {e}")
            if attempt < 5:
                await asyncio.sleep(3 * attempt)  # backoff: 3s, 6s, 9s, 12s
            else:
                print("[lstm-service] DB pool failed after 5 attempts (non-fatal)")


@app.on_event("shutdown")
async def shutdown():
    if db_pool:
        await db_pool.close()


async def build_sequence(user_vpa: str, new_payee_flag: float) -> list:
    """Fetch last 20 transactions from Postgres and build feature sequence."""
    rows = []

    if db_pool:
        try:
            async with db_pool.acquire() as conn:
                rows = await conn.fetch(
                    """
                    SELECT amount,
                           EXTRACT(HOUR FROM timestamp) AS hour,
                           EXTRACT(DOW FROM timestamp)  AS dow
                    FROM transactions
                    WHERE user_vpa = $1
                    ORDER BY timestamp DESC
                    LIMIT 20
                    """,
                    user_vpa,
                )
            rows = list(reversed(rows))  # chronological order
        except Exception as e:
            print(f"[lstm-service] DB query failed: {e}")

    # Build feature sequence: [log1p(amount)/12, hour/23, dow/6, new_payee_flag]
    seq = []
    for row in rows:
        step = [
            float(np.log1p(float(row["amount"])) / 12.0),
            float(row["hour"]) / 23.0,
            float(row["dow"]) / 6.0,
            float(new_payee_flag),
        ]
        seq.append(step)

    # Pad with zeros at beginning if fewer than SEQ_LEN
    while len(seq) < SEQ_LEN:
        seq.insert(0, [0.0, 0.0, 0.0, 0.0])

    return seq[:SEQ_LEN]


@app.post("/score")
async def score_transaction(request: dict):
    features = request.get("features", {})
    user_vpa = request.get("user_vpa") or str(features.get("user_vpa", ""))
    new_payee_flag = float(features.get("new_payee_flag", 0))

    if model is None:
        return {"score": 0.5}

    try:
        seq = await build_sequence(user_vpa, new_payee_flag)
        x = torch.FloatTensor([seq])  # shape: [1, SEQ_LEN, 4]
        with torch.no_grad():
            pred = model(x)
            # Handle both raw tensor and tuple outputs
            if isinstance(pred, tuple):
                pred = pred[0]
            score = float(pred.squeeze()[-1] if pred.dim() > 1 else pred.squeeze())
        return {"score": round(max(0.0, min(1.0, score)), 4)}
    except Exception as e:
        print(f"[lstm-service] Inference error: {e}")
        return {"score": 0.5}


@app.get("/health")
async def health():
    return {"status": "ok" if model else "loading"}
