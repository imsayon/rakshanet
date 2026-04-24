"""
Generate 1M synthetic UPI transactions with injected fraud patterns.
Usage: python generate_synthetic.py --n 1000000 --output data/transactions.parquet
"""
import argparse
import random
import uuid
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
from faker import Faker

fake = Faker("en_IN")
rng = np.random.default_rng(42)

UPI_SUFFIXES = ["@okaxis", "@paytm", "@ybl", "@okhdfcbank", "@oksbi", "@ibl"]
FRAUD_PATTERNS = ["REFUND_SCAM", "QR_SWAP", "COLLECT_REQUEST_FRAUD", "MULE_NETWORK", "SIM_SWAP_BURST"]


def gen_vpa(name: str = None) -> str:
    base = (name or fake.user_name()).lower().replace(" ", "").replace(".", "")[:10]
    return base + random.choice(UPI_SUFFIXES)


def gen_device_id() -> str:
    return uuid.uuid4().hex[:12]


def gen_legit_txn(user_vpa: str, ts: datetime, device_pool: list) -> dict:
    amount = float(rng.lognormal(mean=7.5, sigma=1.2))  # ₹1800 median
    amount = round(min(max(amount, 1.0), 200000.0), 2)
    return {
        "txn_id": f"TXN{ts.strftime('%Y%m%d%H%M%S')}{rng.integers(1000,9999)}",
        "user_vpa": user_vpa,
        "payee_vpa": gen_vpa(),
        "amount": amount,
        "timestamp": ts.isoformat(),
        "device_id": random.choice(device_pool),
        "remarks": random.choice(["", "lunch", "rent", "gift", "groceries", "fuel", "recharge"]),
        "pin_entry_duration_ms": int(rng.normal(2500, 600)),
        "tap_pressure_avg": float(rng.uniform(0.4, 0.9)),
        "copy_paste_amount": False,
        "app_bg_switch_count": int(rng.poisson(0.5)),
        "qr_mismatch": False,
        "label": 0,
        "fraud_pattern": None,
    }


def inject_refund_scam(user_vpa: str, ts: datetime, device_pool: list) -> dict:
    txn = gen_legit_txn(user_vpa, ts, device_pool)
    txn["remarks"] = random.choice(["refund processing fee", "refund charges", "KYC update required urgent"])
    txn["amount"] = float(rng.choice([199, 499, 999, 1999]))
    txn["copy_paste_amount"] = True
    txn["label"] = 1
    txn["fraud_pattern"] = "REFUND_SCAM"
    return txn


def inject_qr_swap(user_vpa: str, ts: datetime, device_pool: list) -> dict:
    txn = gen_legit_txn(user_vpa, ts, device_pool)
    txn["qr_mismatch"] = True
    txn["amount"] = round(float(rng.uniform(500, 50000)), 2)
    txn["label"] = 1
    txn["fraud_pattern"] = "QR_SWAP"
    return txn


def inject_sim_swap_burst(user_vpa: str, ts: datetime, device_pool: list) -> list:
    """Burst of 5–8 transactions within 10 minutes from new device."""
    new_device = gen_device_id()
    txns = []
    for i in range(rng.integers(5, 9)):
        offset = timedelta(minutes=i * rng.uniform(0.5, 2))
        txn = gen_legit_txn(user_vpa, ts + offset, [new_device])
        txn["amount"] = round(float(rng.uniform(5000, 50000)), 2)
        txn["label"] = 1
        txn["fraud_pattern"] = "SIM_SWAP_BURST"
        txns.append(txn)
    return txns


def inject_collect_fraud(user_vpa: str, ts: datetime, device_pool: list) -> dict:
    txn = gen_legit_txn(user_vpa, ts, device_pool)
    # collect request = UPI pull; payee initiates
    txn["remarks"] = random.choice(["collect request", "prize claim", "cashback credited"])
    txn["pin_entry_duration_ms"] = int(rng.normal(800, 200))  # fast = confused user
    txn["label"] = 1
    txn["fraud_pattern"] = "COLLECT_REQUEST_FRAUD"
    return txn


def generate(n: int) -> pd.DataFrame:
    users = [gen_vpa(fake.first_name()) for _ in range(n // 50)]  # ~50 txns/user avg
    device_pool_per_user = {u: [gen_device_id() for _ in range(rng.integers(1, 4))] for u in users}

    base_ts = datetime(2025, 1, 1)
    records = []
    fraud_budget = int(n * 0.01)  # 1% fraud rate
    fraud_count = 0

    report_interval = max(n // 10, 1)
    for i in range(n):
        if i > 0 and i % report_interval == 0:
            print(f"  Progress: {i:,}/{n:,} ({i*100//n}%) — {fraud_count} fraud injected")
        user = random.choice(users)
        days_offset = rng.integers(0, 365)
        hour = int(rng.choice(range(24), p=_hour_probs()))
        ts = base_ts + timedelta(days=int(days_offset), hours=hour, minutes=int(rng.integers(0, 60)))
        devices = device_pool_per_user[user]

        inject_fraud = fraud_count < fraud_budget and rng.random() < 0.015
        if inject_fraud:
            pattern = random.choice(FRAUD_PATTERNS)
            if pattern == "REFUND_SCAM":
                records.append(inject_refund_scam(user, ts, devices))
                fraud_count += 1
            elif pattern == "QR_SWAP":
                records.append(inject_qr_swap(user, ts, devices))
                fraud_count += 1
            elif pattern == "SIM_SWAP_BURST":
                burst = inject_sim_swap_burst(user, ts, devices)
                records.extend(burst)
                fraud_count += len(burst)
            elif pattern == "COLLECT_REQUEST_FRAUD":
                records.append(inject_collect_fraud(user, ts, devices))
                fraud_count += 1
            else:
                records.append(gen_legit_txn(user, ts, devices))
        else:
            records.append(gen_legit_txn(user, ts, devices))

    df = pd.DataFrame(records)
    df["timestamp"] = pd.to_datetime(df["timestamp"], format='ISO8601')
    df.sort_values("timestamp", inplace=True)
    df.reset_index(drop=True, inplace=True)
    print(f"Generated {len(df)} rows | Fraud: {df['label'].sum()} ({df['label'].mean()*100:.2f}%)")
    return df


def _hour_probs():
    # Peak at 10am and 7pm, low 1–5am
    weights = np.array([0.5,0.3,0.2,0.2,0.2,0.3,0.8,1.5,2.5,3.5,4.0,3.8,
                        3.5,3.2,3.0,3.2,3.5,4.5,4.0,3.5,3.0,2.5,1.8,1.0])
    return weights / weights.sum()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--n", type=int, default=1_000_000)
    parser.add_argument("--output", default="data/transactions.parquet")
    args = parser.parse_args()
    df = generate(args.n)
    df.to_parquet(args.output, index=False)
    print(f"Saved → {args.output}")
