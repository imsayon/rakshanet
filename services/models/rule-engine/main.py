from fastapi import FastAPI

app = FastAPI(title="Rule Engine")


def score(features: dict) -> float:
    """Deterministic rule-based scoring."""
    violations = 0
    
    amount = features.get("amount", 0)
    if amount > 10000:
        violations += 0.5
    if amount > 25000:
        violations += 0.5
    
    txn_count = features.get("txn_count_1h", 0)
    if txn_count > 10:
        violations += 1
    
    new_payee = features.get("new_payee_flag", 0)
    if new_payee and amount > 10000:
        violations += 1
    
    return min(violations / 3.0, 1.0)


@app.post("/score")
async def score_transaction(request: dict):
    features = request.get("features", request)
    return {"score": score(features)}


@app.get("/health")
async def health():
    return {"status": "ok"}
