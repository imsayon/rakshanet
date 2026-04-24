"""
Dummy GNN training for demo purposes.
"""
import os
import pickle
import numpy as np
import pandas as pd

MODEL_DIR = os.environ.get("MODEL_DIR", "./models")
os.makedirs(MODEL_DIR, exist_ok=True)


def train():
    print("Training GNN (mock)...")
    df = pd.read_parquet("data/transactions.parquet")

    # Create fake node index
    all_vpas = pd.unique(df[["user_vpa", "payee_vpa"]].values.ravel())
    node_to_idx = {v: i for i, v in enumerate(all_vpas)}

    with open(f"{MODEL_DIR}/gnn_node_index.pkl", "wb") as f:
        pickle.dump(node_to_idx, f)

    # Mock embeddings
    embeddings = {v: np.random.randn(128).astype(np.float32) for v in all_vpas}
    with open(f"{MODEL_DIR}/gnn_embeddings.pkl", "wb") as f:
        pickle.dump(embeddings, f)

    print(f"GNN mock saved → {MODEL_DIR}/ ({len(all_vpas)} nodes)")


if __name__ == "__main__":
    train()
