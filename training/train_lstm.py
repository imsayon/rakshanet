"""
LSTM behavioral sequence model.
"""
import os
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
from sklearn.metrics import average_precision_score

MODEL_DIR = os.environ.get("MODEL_DIR", "./models")
os.makedirs(MODEL_DIR, exist_ok=True)

SEQ_LEN = 20
FEATURES_PER_STEP = 4
HIDDEN = 128
LAYERS = 2
BATCH = 512
EPOCHS = 20


class TxnSequenceDataset(Dataset):
    def __init__(self, sequences, labels):
        self.X = torch.FloatTensor(sequences)
        self.y = torch.FloatTensor(labels)

    def __len__(self):
        return len(self.y)

    def __getitem__(self, idx):
        return self.X[idx], self.y[idx]


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


def build_sequences(df: pd.DataFrame):
    df = df.copy()
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    df.sort_values(["user_vpa", "timestamp"], inplace=True)

    df["amount_norm"] = np.log1p(df["amount"]) / 12.0
    df["hour_norm"]   = df["timestamp"].dt.hour / 23.0
    df["dow_norm"]    = df["timestamp"].dt.dayofweek / 6.0
    df["npf"]         = df.get("new_payee_flag", pd.Series(0.0, index=df.index)).fillna(0).astype(float)

    seqs, labels = [], []
    for user, grp in df.groupby("user_vpa"):
        if len(grp) < 3:
            continue
        vals = grp[["amount_norm","hour_norm","dow_norm","npf"]].values
        ys   = grp["label"].values
        for i in range(1, len(grp)):
            start = max(0, i - SEQ_LEN)
            seq = vals[start:i]
            if len(seq) < SEQ_LEN:
                pad = np.zeros((SEQ_LEN - len(seq), FEATURES_PER_STEP))
                seq = np.vstack([pad, seq])
            seqs.append(seq)
            labels.append(float(ys[i]))

    return np.array(seqs, dtype=np.float32), np.array(labels, dtype=np.float32)


def train():
    print("Loading data...")
    df = pd.read_parquet("data/transactions.parquet")

    print("Building sequences...")
    X, y = build_sequences(df)
    print(f"Sequences: {X.shape} | Fraud rate: {y.mean():.4f}")

    split = int(0.8 * len(X))
    ds_train = TxnSequenceDataset(X[:split], y[:split])
    ds_test  = TxnSequenceDataset(X[split:], y[split:])

    fraud_rate = y[:split].mean()
    weights = np.where(y[:split] == 1, 1.0 / fraud_rate, 1.0 / (1 - fraud_rate))
    sampler = torch.utils.data.WeightedRandomSampler(weights, len(weights))

    dl_train = DataLoader(ds_train, batch_size=BATCH, sampler=sampler)
    dl_test  = DataLoader(ds_test,  batch_size=BATCH, shuffle=False)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = FraudLSTM().to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    criterion = nn.BCELoss()

    best_prauc = 0.0
    for epoch in range(EPOCHS):
        model.train()
        for xb, yb in dl_train:
            xb, yb = xb.to(device), yb.to(device)
            optimizer.zero_grad()
            loss = criterion(model(xb), yb)
            loss.backward()
            optimizer.step()

        model.eval()
        all_probs, all_labels = [], []
        with torch.no_grad():
            for xb, yb in dl_test:
                probs = model(xb.to(device)).cpu().numpy()
                all_probs.extend(probs)
                all_labels.extend(yb.numpy())

        prauc = average_precision_score(all_labels, all_probs)
        print(f"Epoch {epoch+1:02d}/{EPOCHS} | PR-AUC: {prauc:.4f}")
        if prauc > best_prauc:
            best_prauc = prauc
            torch.save(model.state_dict(), f"{MODEL_DIR}/lstm_best.pt")

    print(f"Best PR-AUC: {best_prauc:.4f} | Saved → {MODEL_DIR}/lstm_best.pt")
    # Save state_dict (not full model) for Docker portability
    torch.save(model.state_dict(), f"{MODEL_DIR}/lstm_model.pt")
    print(f"Final model state_dict saved → {MODEL_DIR}/lstm_model.pt")


if __name__ == "__main__":
    train()
