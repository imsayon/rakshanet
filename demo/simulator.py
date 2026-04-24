"""
Demo transaction simulator for testing the fraud detection pipeline.
"""
import argparse
import random
import asyncio
import json
from datetime import datetime
import httpx


async def simulate_transaction(client: httpx.AsyncClient, txn_type: str = "legit"):
    """Simulate a transaction."""
    amount = random.choice([100, 500, 2000, 5000, 10000])
    
    if txn_type == "refund_scam":
        amount = random.choice([199, 499, 999])
        remarks = "refund processing fee"
    elif txn_type == "qr_swap":
        amount = random.choice([5000, 10000, 25000])
        remarks = "merchant payment"
    else:
        remarks = random.choice(["lunch", "rent", "gift", "groceries", ""])
    
    txn = {
        "txn_id": f"TXN{datetime.utcnow().timestamp()}",
        "user_vpa": f"user{random.randint(1,100)}@okaxis",
        "payee_vpa": f"merchant{random.randint(1,1000)}@paytm",
        "amount": amount,
        "currency": "INR",
        "timestamp": datetime.utcnow().isoformat(),
        "device_id": f"device{random.randint(1,50)}",
        "app_version": "4.2.1",
        "remarks": remarks,
        "biometrics": {
            "pin_entry_duration_ms": random.randint(1500, 3500),
            "tap_pressure_avg": random.uniform(0.4, 0.9),
            "copy_paste_amount": txn_type == "refund_scam",
        }
    }
    
    try:
        resp = await client.post("http://localhost:8000/v1/transaction", json=txn)
        if resp.status_code == 200:
            print(f"✓ {txn_type:15} | Amount: ₹{amount:6.0f} | {resp.json()}")
        else:
            print(f"✗ Error: {resp.status_code}")
    except Exception as e:
        print(f"✗ Connection error: {e}")


async def main(mode: str = "all", count: int = 10):
    """Run simulator."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        for i in range(count):
            if mode == "legit":
                await simulate_transaction(client, "legit")
            elif mode == "fraud":
                fraud_type = random.choice(["refund_scam", "qr_swap"])
                await simulate_transaction(client, fraud_type)
            else:  # all
                txn_type = random.choice(["legit", "legit", "legit", "refund_scam", "qr_swap"])
                await simulate_transaction(client, txn_type)
            
            await asyncio.sleep(0.5)
        
        print(f"\n✓ Simulated {count} transactions")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["legit", "fraud", "all"], default="all")
    parser.add_argument("--count", type=int, default=10)
    args = parser.parse_args()
    
    asyncio.run(main(args.mode, args.count))
