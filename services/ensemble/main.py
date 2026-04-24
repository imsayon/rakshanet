import os
import pickle
import sys
import numpy as np
from fastapi import FastAPI

app = FastAPI(title="Ensemble Service")

model = None
explainer = None  # reserved for future ensemblelevel SHAP

FEATURE_NAMES = [
    "rule_score", "xgb_score", "gnn_score", "lstm_score", "nlp_score",
    "amount_bucket", "is_new_payee", "txn_count_bucket",
]

# Weighted fallback coefficients (sum to 1.0)
WEIGHTS = [0.25, 0.35, 0.15, 0.15, 0.10]


def _install_numpy_pickle_aliases() -> None:
    try:
        import numpy as np_pkg
        import numpy.core as np_core
        import numpy.core.numeric as np_numeric
        import numpy.core.multiarray as np_multiarray

        sys.modules.setdefault("numpy._core", np_core)
        sys.modules.setdefault("numpy._core.numeric", np_numeric)
        sys.modules.setdefault("numpy._core.multiarray", np_multiarray)
        setattr(np_pkg, "_core", np_core)
        setattr(np_core, "numeric", np_numeric)
        setattr(np_core, "multiarray", np_multiarray)
    except Exception:
        pass


@app.on_event("startup")
def startup():
    global model
    _install_numpy_pickle_aliases()
    model_path = "/models/ensemble_model.pkl"
    if os.path.exists(model_path):
        try:
            with open(model_path, "rb") as f:
                model = pickle.load(f)
        except Exception as e:
            model = None
            print(f"[ensemble] Model load failed, using weighted fallback: {e}")


def detect_pattern(scores: list, features: dict) -> str:
    """Map score combinations + feature signals to named fraud patterns."""
    rule_score, xgb_score, gnn_score, lstm_score, nlp_score = (scores + [0.0] * 5)[:5]
    max_score = max(scores) if scores else 0.0

    qr_mismatch = int(features.get("qr_mismatch", 0))
    copy_paste_amount = int(features.get("copy_paste_amount", 0))
    new_payee_flag = int(features.get("new_payee_flag", 0))
    payee_receive_count_1h = float(features.get("payee_receive_count_1h", 0))
    txn_count_1h = float(features.get("txn_count_1h", 0))
    pin_entry_duration_ms = float(features.get("pin_entry_duration_ms", 2500))

    if qr_mismatch == 1:
        return "QR_SWAP"
    if nlp_score > 0.6 and copy_paste_amount == 1:
        return "REFUND_SCAM"
    if gnn_score > 0.5 and payee_receive_count_1h > 10:
        return "MULE_NETWORK"
    if txn_count_1h > 5 and xgb_score > 0.6:
        return "SIM_SWAP_BURST"
    if pin_entry_duration_ms < 800 and new_payee_flag == 1:
        return "COLLECT_REQUEST_FRAUD"
    if max_score > 0.5:
        return "GENERIC_FRAUD"
    return "NONE"


def build_reasons(scores: list, features: dict, pattern: str) -> list:
    """Build human-readable reason list from signals."""
    rule_score, xgb_score, gnn_score, lstm_score, nlp_score = (scores + [0.0] * 5)[:5]
    reasons = []

    if rule_score > 0.4:
        reasons.append("rule_violation")
    if xgb_score > 0.5:
        reasons.append("anomalous_tabular_features")
    if gnn_score > 0.5:
        reasons.append("suspicious_graph_pattern")
    if lstm_score > 0.5:
        reasons.append("unusual_transaction_sequence")
    if nlp_score > 0.5:
        reasons.append("fraud_remark_detected")
    if float(features.get("txn_count_1h", 0)) > 5:
        reasons.append("high_velocity")
    if float(features.get("amount_deviation", 0)) > 2.0:
        reasons.append("amount_deviation")
    if int(features.get("new_payee_flag", 0)):
        reasons.append("new_payee")
    if int(features.get("copy_paste_amount", 0)):
        reasons.append("copy_paste_amount")
    if int(features.get("qr_mismatch", 0)):
        reasons.append("qr_merchant_mismatch")

    return reasons


@app.post("/predict")
async def predict(request: dict):
    scores: list = request.get("scores", [0.0] * 5)
    features: dict = request.get("features", {})

    # Detect pattern first (before scoring, as it uses raw signals)
    pattern = detect_pattern(scores, features)

    if model is not None:
        try:
            amount = float(features.get("amount", 0))
            amount_bucket = min(int(amount / 500), 4) if amount > 0 else 0
            is_new_payee = float(features.get("new_payee_flag", 0))
            txn_count = min(int(float(features.get("txn_count_1h", 1))), 3)

            meta_input = [
                *[float(s) for s in scores[:5]],
                float(amount_bucket),
                is_new_payee,
                float(txn_count),
            ]

            probs = model.predict_proba([meta_input])[0]
            ensemble_score = float(probs[1])
        except Exception as e:
            print(f"[ensemble] Model predict failed: {e}, using weighted fallback")
            ensemble_score = sum(w * s for w, s in zip(WEIGHTS, scores[:5]))
    else:
        # Weighted average fallback
        ensemble_score = sum(w * float(s) for w, s in zip(WEIGHTS, (scores + [0.0] * 5)[:5]))

    reasons = build_reasons(scores, features, pattern)

    return {
        "score": round(ensemble_score, 4),
        "reasons": reasons,
        "pattern": pattern,
    }


# Legacy /score endpoint for backward compatibility
@app.post("/score")
async def score_transaction(request: dict):
    return await predict(request)


@app.get("/health")
async def health():
    return {"status": "ok" if model else "running_fallback"}
