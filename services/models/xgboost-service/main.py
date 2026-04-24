import os
import pickle
import numpy as np
from fastapi import FastAPI

app = FastAPI(title="XGBoost Service")

model = None
explainer = None

FEATURES = [
    "amount", "hour_of_day", "day_of_week",
    "txn_count_1h", "txn_amount_sum_1h",
    "new_payee_flag", "device_user_count",
    "amount_deviation", "pin_entry_duration_ms",
    "tap_pressure_avg", "copy_paste_amount",
    "app_bg_switch_count", "qr_mismatch",
    "payee_receive_count_1h",
]


@app.on_event("startup")
def startup():
    global model, explainer

    model_path = "/models/xgboost_model.pkl"
    if os.path.exists(model_path):
        with open(model_path, "rb") as f:
            model = pickle.load(f)

        # Load SHAP TreeExplainer alongside model
        try:
            import shap
            explainer = shap.TreeExplainer(model)
            print("[xgboost-service] SHAP explainer loaded")
        except Exception as e:
            print(f"[xgboost-service] SHAP load failed (non-fatal): {e}")


def score_with_shap(features: dict) -> dict:
    """Score transaction and extract top-3 SHAP reasons."""
    if model is None:
        return {"score": 0.5, "shap_reasons": []}

    vec = [float(features.get(feat, 0.0)) for feat in FEATURES]
    X = np.array([vec], dtype=np.float32)

    probs = model.predict_proba(X)[0]
    prob = float(probs[1])  # fraud probability

    shap_reasons = []
    if explainer is not None:
        try:
            shap_values = explainer.shap_values(X)
            # shap_values may be a list [neg_class, pos_class] or a 2D array
            if isinstance(shap_values, list):
                shap_vals = shap_values[1]  # fraud class
            else:
                shap_vals = shap_values

            top3_idx = np.argsort(np.abs(shap_vals[0]))[::-1][:3]
            shap_reasons = [
                f"{FEATURES[i]}={X[0][i]:.2f}({shap_vals[0][i]:+.3f})"
                for i in top3_idx
            ]
        except Exception as e:
            print(f"[xgboost-service] SHAP explain error: {e}")

    return {"score": round(prob, 4), "shap_reasons": shap_reasons}


@app.post("/score")
async def score_transaction(request: dict):
    features = request.get("features", request)
    # Also accept top-level biometrics fields merged into features
    biometrics = request.get("biometrics", {})
    if biometrics:
        for k, v in biometrics.items():
            features.setdefault(k, v)
    return score_with_shap(features)


@app.get("/health")
async def health():
    return {"status": "ok" if model else "loading"}
