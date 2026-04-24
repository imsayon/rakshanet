"""
Train the ensemble meta-learner using real component model scores.
"""
import json
import os
import pickle
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from sklearn.calibration import CalibratedClassifierCV
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, classification_report, f1_score
from transformers import AutoModelForSequenceClassification, AutoTokenizer

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from training.train_lstm import FEATURES_PER_STEP, FraudLSTM, SEQ_LEN
from training.train_xgboost import FEATURES as XGB_FEATURES
from training.train_xgboost import engineer_features

MODEL_DIR = Path(os.environ.get("MODEL_DIR", "./models"))
DATA_PATH = Path(os.environ.get("DATA_PATH", "data/transactions.parquet"))
NLP_MODEL_PATH = MODEL_DIR / "nlp_model"
MAX_ROWS = int(os.environ.get("ENSEMBLE_MAX_ROWS", "100000"))
METRICS_PATH = MODEL_DIR / "ensemble_metrics.json"


def load_dataframe() -> pd.DataFrame:
    df = pd.read_parquet(DATA_PATH)
    if MAX_ROWS > 0 and len(df) > MAX_ROWS:
        df = df.sample(MAX_ROWS, random_state=42).copy()
    df = engineer_features(df)
    df = df.sort_values("timestamp").reset_index(drop=True)
    return df


def rule_score(features: dict) -> float:
    violations = 0.0

    amount = float(features.get("amount", 0))
    if amount > 10000:
        violations += 0.5
    if amount > 25000:
        violations += 0.5

    txn_count = float(features.get("txn_count_1h", 0))
    if txn_count > 10:
        violations += 1.0

    new_payee = int(features.get("new_payee_flag", 0))
    if new_payee and amount > 10000:
        violations += 1.0

    return min(violations / 3.0, 1.0)


def build_rule_scores(df: pd.DataFrame) -> np.ndarray:
    cols = ["amount", "txn_count_1h", "new_payee_flag"]
    return np.array([rule_score(row) for row in df[cols].to_dict(orient="records")], dtype=np.float32)


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))


def build_gnn_scores(df: pd.DataFrame) -> np.ndarray:
    emb_path = MODEL_DIR / "gnn_embeddings.pkl"
    if not emb_path.exists():
        return np.full(len(df), 0.5, dtype=np.float32)

    with open(emb_path, "rb") as f:
        embeddings = pickle.load(f)

    scores = []
    for user_vpa, payee_vpa in df[["user_vpa", "payee_vpa"]].itertuples(index=False, name=None):
        user_emb = embeddings.get(user_vpa)
        payee_emb = embeddings.get(payee_vpa)
        if user_emb is None or payee_emb is None:
            scores.append(0.3)
            continue
        scores.append(1.0 - cosine_similarity(user_emb, payee_emb))
    return np.array(scores, dtype=np.float32)


def build_lstm_scores(df: pd.DataFrame) -> np.ndarray:
    model_path = MODEL_DIR / "lstm_best.pt"
    if not model_path.exists():
        return np.full(len(df), 0.5, dtype=np.float32)

    model = FraudLSTM()
    model.load_state_dict(torch.load(model_path, map_location="cpu"))
    model.eval()

    work = df.copy()
    work["amount_norm"] = np.log1p(work["amount"]) / 12.0
    work["hour_norm"] = work["timestamp"].dt.hour / 23.0
    work["dow_norm"] = work["timestamp"].dt.dayofweek / 6.0
    work["npf"] = work["new_payee_flag"].fillna(0).astype(float)

    scores = np.full(len(work), 0.5, dtype=np.float32)
    batch = []
    batch_indices = []

    for _, grp in work.groupby("user_vpa", sort=False):
        vals = grp[["amount_norm", "hour_norm", "dow_norm", "npf"]].values.astype(np.float32)
        idxs = grp.index.to_list()

        for i in range(1, len(grp)):
            start = max(0, i - SEQ_LEN)
            seq = vals[start:i]
            if len(seq) < SEQ_LEN:
                pad = np.zeros((SEQ_LEN - len(seq), FEATURES_PER_STEP), dtype=np.float32)
                seq = np.vstack([pad, seq])
            batch.append(seq)
            batch_indices.append(idxs[i])

            if len(batch) >= 2048:
                with torch.no_grad():
                    probs = model(torch.tensor(np.array(batch), dtype=torch.float32)).numpy()
                for row_idx, prob in zip(batch_indices, probs):
                    scores[row_idx] = float(prob)
                batch.clear()
                batch_indices.clear()

    if batch:
        with torch.no_grad():
            probs = model(torch.tensor(np.array(batch), dtype=torch.float32)).numpy()
        for row_idx, prob in zip(batch_indices, probs):
            scores[row_idx] = float(prob)

    return scores


def build_nlp_scores(df: pd.DataFrame) -> np.ndarray:
    if not NLP_MODEL_PATH.exists() or not (
        (NLP_MODEL_PATH / "model.safetensors").exists() or 
        (NLP_MODEL_PATH / "pytorch_model.bin").exists()
    ):
        return np.full(len(df), 0.5, dtype=np.float32)

    tokenizer = AutoTokenizer.from_pretrained(NLP_MODEL_PATH)
    model = AutoModelForSequenceClassification.from_pretrained(NLP_MODEL_PATH)
    model.eval()

    unique_remarks = pd.Series(df["remarks"].fillna("").astype(str).unique())
    remark_to_score = {}

    batch_size = 128
    for start in range(0, len(unique_remarks), batch_size):
        batch_remarks = unique_remarks.iloc[start:start + batch_size].tolist()
        enc = tokenizer(
            batch_remarks,
            max_length=32,
            padding=True,
            truncation=True,
            return_tensors="pt",
        )
        with torch.no_grad():
            logits = model(**enc).logits
            probs = torch.softmax(logits, dim=1)[:, 1].cpu().numpy()
        for remark, prob in zip(batch_remarks, probs):
            remark_to_score[remark] = float(prob)

    return df["remarks"].fillna("").astype(str).map(remark_to_score).astype(np.float32).values


def build_xgb_scores(df: pd.DataFrame) -> np.ndarray:
    model_path = MODEL_DIR / "xgboost_model.pkl"
    with open(model_path, "rb") as f:
        model = pickle.load(f)
    probs = model.predict_proba(df[XGB_FEATURES].values)[:, 1]
    return probs.astype(np.float32)


def build_meta_features(df: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
    print("Scoring rule engine...")
    rule_scores = build_rule_scores(df)
    print("Scoring XGBoost...")
    xgb_scores = build_xgb_scores(df)
    print("Scoring GNN...")
    gnn_scores = build_gnn_scores(df)
    print("Scoring LSTM...")
    lstm_scores = build_lstm_scores(df)
    print("Scoring NLP...")
    nlp_scores = build_nlp_scores(df)
    print("Building meta features...")

    amount_bucket = pd.cut(
        df["amount"],
        bins=[0, 500, 2000, 10000, 50000, 1e9],
        labels=[0, 1, 2, 3, 4],
        include_lowest=True,
    ).astype(float).values
    is_new_payee = df["new_payee_flag"].astype(float).values
    txn_count_bucket = np.clip(df["txn_count_1h"].astype(float).values, 0, 3)

    X = np.column_stack(
        [
            rule_scores,
            xgb_scores,
            gnn_scores,
            lstm_scores,
            nlp_scores,
            amount_bucket,
            is_new_payee,
            txn_count_bucket,
        ]
    )
    y = df["label"].astype(int).values
    return X, y


def train():
    print("Loading and engineering features...")
    df = load_dataframe()
    print(f"Using {len(df):,} rows for ensemble training/evaluation")
    X, y = build_meta_features(df)

    split_ts = df["timestamp"].quantile(0.8)
    split_idx = int((df["timestamp"] < split_ts).sum())
    X_train, X_test = X[:split_idx], X[split_idx:]
    y_train, y_test = y[:split_idx], y[split_idx:]

    model = LogisticRegression(class_weight="balanced", max_iter=1000, C=1.0)
    calibrated = CalibratedClassifierCV(model, cv=3, method="isotonic")
    calibrated.fit(X_train, y_train)

    probs = calibrated.predict_proba(X_test)[:, 1]
    preds = (probs > 0.5).astype(int)

    prauc = average_precision_score(y_test, probs)
    fraud_f1 = f1_score(y_test, preds, pos_label=1)

    # Threshold search for reporting and runtime metadata.
    best_threshold = 0.5
    best_f1 = fraud_f1
    for threshold in np.arange(0.05, 0.96, 0.05):
        candidate_preds = (probs >= threshold).astype(int)
        candidate_f1 = f1_score(y_test, candidate_preds, pos_label=1, zero_division=0)
        if candidate_f1 > best_f1:
            best_f1 = candidate_f1
            best_threshold = float(threshold)

    print(f"Ensemble PR-AUC: {prauc:.4f}")
    print(f"Ensemble F1 (fraud) @0.50: {fraud_f1:.4f}")
    print(f"Best threshold for fraud F1: {best_threshold:.2f}")
    print(f"Best fraud F1: {best_f1:.4f}")
    print(classification_report(y_test, preds, target_names=["legit", "fraud"]))

    with open(MODEL_DIR / "ensemble_model.pkl", "wb") as f:
        pickle.dump(calibrated, f)

    metrics = {
        "prauc": float(prauc),
        "fraud_f1_at_0_50": float(fraud_f1),
        "best_threshold": float(best_threshold),
        "best_fraud_f1": float(best_f1),
        "evaluation_rows": int(len(df)),
        "test_rows": int(len(y_test)),
        "test_fraud_count": int(y_test.sum()),
    }
    with open(METRICS_PATH, "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)

    print(f"Saved → {MODEL_DIR}/ensemble_model.pkl")
    print(f"Saved → {METRICS_PATH}")


if __name__ == "__main__":
    train()
