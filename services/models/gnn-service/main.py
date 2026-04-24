import os
import pickle
import sys
import numpy as np
from fastapi import FastAPI
from redis.asyncio import Redis

app = FastAPI(title="GNN Service")

redis_client = None
embeddings = None


def _install_numpy_pickle_aliases() -> None:
    try:
        import numpy as np_pkg
        import numpy.core as np_core
        import numpy.core.numeric as np_numeric

        sys.modules.setdefault("numpy._core", np_core)
        sys.modules.setdefault("numpy._core.numeric", np_numeric)
        setattr(np_pkg, "_core", np_core)
        setattr(np_core, "numeric", np_numeric)
    except Exception:
        pass


@app.on_event("startup")
async def startup():
    global redis_client, embeddings
    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
    redis_client = Redis.from_url(redis_url, decode_responses=False)
    _install_numpy_pickle_aliases()
    
    # Load embeddings
    emb_path = "/models/gnn_embeddings.pkl"
    if os.path.exists(emb_path):
        try:
            with open(emb_path, "rb") as f:
                embeddings = pickle.load(f)
        except Exception as e:
            embeddings = None
            print(f"[gnn-service] Embeddings load failed, running fallback mode: {e}")


@app.on_event("shutdown")
async def shutdown():
    await redis_client.aclose()


def cosine_distance(a, b):
    """Cosine similarity."""
    dot = np.dot(a, b)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def score(features: dict) -> float:
    """Score using graph embeddings."""
    if embeddings is None:
        return 0.5
    
    user_vpa = features.get("user_vpa", "")
    payee_vpa = features.get("payee_vpa", "")
    
    user_emb = embeddings.get(user_vpa)
    payee_emb = embeddings.get(payee_vpa)
    
    if user_emb is None or payee_emb is None:
        return 0.3  # new nodes get low score
    
    # High distance = anomaly = fraud
    dist = cosine_distance(user_emb, payee_emb)
    return 1.0 - dist


@app.post("/score")
async def score_transaction(request: dict):
    return {"score": score(request.get("features", {}))}


@app.get("/health")
async def health():
    return {"status": "ok" if embeddings else "loading"}
