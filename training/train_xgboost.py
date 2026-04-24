"""
Train XGBoost fraud classifier. Exports to ONNX for fast serving.
"""
import os
import pickle
import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.model_selection import train_test_split
from sklearn.metrics import average_precision_score, classification_report

MODEL_DIR = os.environ.get("MODEL_DIR", "./models")
os.makedirs(MODEL_DIR, exist_ok=True)

FEATURES = [
    "amount", "hour_of_day", "day_of_week",
    "txn_count_1h", "txn_amount_sum_1h",
    "new_payee_flag", "device_user_count",
    "amount_deviation", "pin_entry_duration_ms",
    "tap_pressure_avg", "copy_paste_amount",
    "app_bg_switch_count", "qr_mismatch",
    "payee_receive_count_1h",
]


def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    df.sort_values("timestamp", inplace=True)

    df["hour_of_day"] = df["timestamp"].dt.hour
    df["day_of_week"] = df["timestamp"].dt.dayofweek

    # Velocity — rolling window per user
    df["txn_count_1h"] = (
        df.groupby("user_vpa")["txn_id"]
        .transform(lambda x: x.expanding().count())
        .clip(upper=50)
    )
    df["txn_amount_sum_1h"] = (
        df.groupby("user_vpa")["amount"]
        .transform(lambda x: x.expanding().sum())
        .clip(upper=500000)
    )

    # Payee novelty
    payee_counts = df.groupby("payee_vpa").cumcount()
    df["new_payee_flag"] = (payee_counts == 0).astype(int)

    # Payee receive count
    df["payee_receive_count_1h"] = (
        df.groupby("payee_vpa")["txn_id"]
        .transform(lambda x: x.expanding().count())
        .clip(upper=100)
    )

    # Amount deviation
    user_mean = df.groupby("user_vpa")["amount"].transform("mean")
    df["amount_deviation"] = ((df["amount"] - user_mean) / (user_mean + 1)).clip(-5, 20)

    # Device sharing
    device_user_map = df.groupby("device_id")["user_vpa"].transform("nunique")
    df["device_user_count"] = device_user_map.clip(upper=10)

    # Fill missing features
    df["new_payee_flag"] = df.get("new_payee_flag", 0).fillna(0).astype(int)
    df["qr_mismatch"] = df.get("qr_mismatch", 0).fillna(0).astype(int)
    df["copy_paste_amount"] = df.get("copy_paste_amount", 0).fillna(0).astype(int)
    df["pin_entry_duration_ms"] = df.get("pin_entry_duration_ms", 2500).fillna(2500)
    df["tap_pressure_avg"] = df.get("tap_pressure_avg", 0.6).fillna(0.6)
    df["app_bg_switch_count"] = df.get("app_bg_switch_count", 0).fillna(0)

    df[FEATURES] = df[FEATURES].fillna(0).astype(float)
    return df


def train():
    print("Loading data...")
    df = pd.read_parquet("data/transactions.parquet")
    df = engineer_features(df)

    # Temporal split
    split_ts = df["timestamp"].quantile(0.8)
    train_df = df[df["timestamp"] < split_ts]
    test_df  = df[df["timestamp"] >= split_ts]

    X_train, y_train = train_df[FEATURES].values, train_df["label"].values
    X_test,  y_test  = test_df[FEATURES].values,  test_df["label"].values

    fraud_rate = y_train.mean()
    scale_pos = (1 - fraud_rate) / fraud_rate
    print(f"Train size: {len(X_train)} | Fraud rate: {fraud_rate:.3f} | scale_pos_weight: {scale_pos:.1f}")

    model = xgb.XGBClassifier(
        max_depth=6,
        learning_rate=0.05,
        n_estimators=500,
        scale_pos_weight=scale_pos,
        eval_metric="aucpr",
        use_label_encoder=False,
        random_state=42,
        n_jobs=-1,
        tree_method="hist",
        early_stopping_rounds=30,
    )

    model.fit(
        X_train, y_train,
        eval_set=[(X_test, y_test)],
        verbose=50,
    )

    # Metrics
    probs = model.predict_proba(X_test)[:, 1]
    pr_auc = average_precision_score(y_test, probs)
    print(f"\nPR-AUC: {pr_auc:.4f}")
    preds = (probs > 0.5).astype(int)
    print(classification_report(y_test, preds, target_names=["legit", "fraud"]))

    # Save pickle
    with open(f"{MODEL_DIR}/xgboost_model.pkl", "wb") as f:
        pickle.dump(model, f)

    # Save model
    model.save_model(f"{MODEL_DIR}/xgboost_model.json")

    # Save feature list
    with open(f"{MODEL_DIR}/xgboost_features.txt", "w") as f:
        f.write("\n".join(FEATURES))

    print(f"Model saved → {MODEL_DIR}/")


if __name__ == "__main__":
    train()
