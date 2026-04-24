"""
Fine-tune BERT on UPI remarks.
"""
import os
import json
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
from transformers import AutoTokenizer, AutoModelForSequenceClassification

MODEL_DIR = os.environ.get("MODEL_DIR", "./models")
MODEL_NAME = "bert-base-uncased"
os.makedirs(MODEL_DIR, exist_ok=True)

LABELED_REMARKS = [
    ("refund processing fee", 1),
    ("KYC update required urgent", 1),
    ("lottery prize claim", 1),
    ("cashback processing charge", 1),
    ("OTP verification fee", 1),
    ("birthday gift", 0),
    ("lunch payment", 0),
    ("rent March", 0),
    ("petrol refill", 0),
    ("grocery", 0),
    ("school fees", 0),
    ("electricity bill", 0),
    ("mobile recharge", 0),
    ("movie tickets", 0),
    ("dinner split", 0),
    ("", 0),
    ("thanks", 0),
    ("paid", 0),
]

AUGMENTED = LABELED_REMARKS + [
    ("processing fees for refund", 1),
    ("fee for cashback", 1),
    ("kyc verification charge", 1),
    ("prize money transfer", 1),
    ("paying for lunch", 0),
    ("monthly rent", 0),
    ("utility bills", 0),
    ("school fee payment", 0),
]


class RemarkDataset(Dataset):
    def __init__(self, data, tokenizer, max_len=32):
        self.data = data
        self.tokenizer = tokenizer
        self.max_len = max_len

    def __len__(self):
        return len(self.data)

    def __getitem__(self, idx):
        text, label = self.data[idx]
        enc = self.tokenizer(
            text, max_length=self.max_len, padding="max_length",
            truncation=True, return_tensors="pt"
        )
        return {
            "input_ids": enc["input_ids"].squeeze(),
            "attention_mask": enc["attention_mask"].squeeze(),
            "label": torch.tensor(label, dtype=torch.long),
        }


def train():
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    model = AutoModelForSequenceClassification.from_pretrained(MODEL_NAME, num_labels=2)

    dataset = RemarkDataset(AUGMENTED * 200, tokenizer)
    loader = DataLoader(dataset, batch_size=32, shuffle=True)

    optimizer = torch.optim.AdamW(model.parameters(), lr=2e-5)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model.to(device)

    for epoch in range(5):
        model.train()
        total_loss = 0
        for batch in loader:
            input_ids = batch["input_ids"].to(device)
            masks     = batch["attention_mask"].to(device)
            labels    = batch["label"].to(device)
            out  = model(input_ids=input_ids, attention_mask=masks, labels=labels)
            loss = out.loss
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            total_loss += loss.item()
        print(f"Epoch {epoch+1} | Loss: {total_loss/len(loader):.4f}")

    model.eval()
    model.save_pretrained(f"{MODEL_DIR}/nlp_model")
    tokenizer.save_pretrained(f"{MODEL_DIR}/nlp_model")
    print(f"Saved → {MODEL_DIR}/nlp_model/")


if __name__ == "__main__":
    train()
