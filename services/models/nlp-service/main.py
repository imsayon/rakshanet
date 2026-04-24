import os
import re
import numpy as np
from fastapi import FastAPI

app = FastAPI(title="NLP Service")

# --- Regex patterns (fast path) ---
FRAUD_RE = re.compile(
    r"\b(refund.*(fee|charge)|kyc.*(update|verif)|otp.*(fee|charge)|"
    r"cashback.*(fee|charge)|prize|lottery|claim|urgent.*(pay|transfer)|"
    r"processing.*fee|account.*verif)\b",
    re.I,
)
LEGIT_RE = re.compile(
    r"\b(lunch|dinner|rent|grocery|groceries|coffee|tea|food|bill|"
    r"petrol|fuel|recharge|salary|book|ticket|school|fees)\b",
    re.I,
)

# --- ONNX path (optional, loaded if files exist) ---
ort_session = None
tokenizer = None
ONNX_MODEL_PATH = "/models/nlp_model.onnx"
TOKENIZER_PATH = "/models/nlp_model"


@app.on_event("startup")
def startup():
    global ort_session, tokenizer

    if os.path.exists(ONNX_MODEL_PATH) and os.path.exists(TOKENIZER_PATH):
        try:
            import onnxruntime
            from transformers import AutoTokenizer

            ort_session = onnxruntime.InferenceSession(
                ONNX_MODEL_PATH,
                providers=["CPUExecutionProvider"],
            )
            tokenizer = AutoTokenizer.from_pretrained(TOKENIZER_PATH)
            print("[nlp-service] ONNX model loaded")
        except Exception as e:
            print(f"[nlp-service] ONNX load failed (will use regex only): {e}")
            ort_session = None
            tokenizer = None
    else:
        print("[nlp-service] ONNX model not found — regex-only mode")


def regex_score(text: str) -> float:
    """Fast regex-based classification."""
    if FRAUD_RE.search(text):
        return 0.85
    if LEGIT_RE.search(text):
        return 0.05
    return 0.15


def onnx_score(text: str) -> float:
    """Run ONNX inference on truncated text."""
    try:
        enc = tokenizer(
            text,
            max_length=32,
            truncation=True,
            padding="max_length",
            return_tensors="np",
        )
        inputs = {k: v.astype(np.int64) for k, v in enc.items()}
        outputs = ort_session.run(None, inputs)
        # outputs[0] shape: [1, num_labels]; take softmax of fraud class (index 1)
        logits = outputs[0][0]
        exp_logits = np.exp(logits - np.max(logits))
        probs = exp_logits / exp_logits.sum()
        fraud_prob = float(probs[1]) if len(probs) > 1 else float(probs[0])
        return round(fraud_prob, 4)
    except Exception as e:
        print(f"[nlp-service] ONNX inference error: {e}")
        return 0.15


def score(text: str) -> float:
    if not text:
        return 0.0

    r_score = regex_score(text)

    if ort_session is not None and tokenizer is not None:
        o_score = onnx_score(text[:200])  # cap input length
        return round(0.4 * r_score + 0.6 * o_score, 4)

    return r_score


@app.post("/score")
async def score_transaction(request: dict):
    remark = request.get("remark", "") or request.get("remarks", "")
    return {"score": score(str(remark))}


@app.get("/health")
async def health():
    mode = "onnx+regex" if ort_session else "regex_only"
    return {"status": "ok", "mode": mode}
