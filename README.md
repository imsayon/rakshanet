# रक्षा-net — India's own UPI Sentinel

A production-grade real-time fraud detection system for UPI transactions using ensemble machine learning, behavioral biometrics, and graph neural networks.

## Architecture Overview

```
Transaction Flow: txn-ingestion → Kafka → feature-engine → Redis → decision-engine
                                                                        ↓
                              ┌────────────────────────────────────────┘
                              ↓
                    [5 Model Services in Parallel]
                    • Rule Engine (deterministic)
                    • XGBoost (tabular features)
                    • GNN (account graph patterns)
                    • LSTM (behavioral sequences)
                    • NLP (remark classification)
                              ↓
                         Ensemble Service
                              ↓
                      Action Executor (log + enforce)
```

## 🚀 Quick Demo (5 minutes)

```bash
# One command: generates 1M rows, trains models, starts all services
make demo

# In a separate terminal — launch the dashboard
cd client && npm install && npm run dev
```

Open **http://localhost:5173** → Go to **Simulator** tab → Click **▶ Run Demo Sequence**

Watch fraud scores spike in real-time as the scripted story unfolds across all 5 ML models.

> **Note:** The demo skips NLP/BERT training (20+ min download). The NLP service runs in regex-only mode which detects "refund", "KYC", "lottery" etc. perfectly for the demo. To train the full NLP model: `python training/train_nlp.py`

---

## Quick Start (Manual)

### Prerequisites

- Docker & Docker Compose
- Python 3.11+ (for local training)
- 4GB RAM, 10GB disk

### 1. Clone & Setup

```bash
cd rakshanet
cp .env.example .env
```

### 2. Generate Synthetic Data

```bash
pip install pandas faker numpy scikit-learn xgboost
python data/generate_synthetic.py --n 1000000 --output data/transactions.parquet
```

### 3. Train Models

```bash
make train
```

This runs all 5 training scripts:

- `train_xgboost.py` - Tabular fraud classifier
- `train_lstm.py` - Behavioral sequence model
- `train_nlp.py` - Remark classification
- `train_gnn.py` - Graph patterns (mule networks)
- `train_ensemble.py` - Meta-learner

### 4. Start Infrastructure

```bash
make up
```

Starts:

- Kafka + Zookeeper (message bus)
- PostgreSQL (audit logs)
- Redis (feature caching)
- Neo4j (transaction graph)
- 10+ microservices on ports 8000-9005

### 5. Test with Simulator

```bash
pip install httpx
python demo/simulator.py --mode all --count 50
```

Monitor decisions:

```bash
make logs
```

### 6. Launch Dashboard Client

```bash
cd client
npm install
npm run dev
```

Opens at `http://localhost:5173` — auto-proxies to backend services (ports 8000, 8001, 8010).
Works in **mock mode** without Docker, or connects to the **live ML pipeline** when services are running.

## Project Structure

```
rakshanet/
├── client/              # React + Vite dashboard (रक्षा-net UI)
├── services/            # Backend microservices
│   ├── txn-ingestion/   # Transaction validation & Kafka producer
│   ├── feature-engine/  # Real-time feature computation
│   ├── decision-engine/ # ML model orchestrator
│   ├── ensemble/        # Meta-learner service
│   ├── action-executor/ # Decision enforcement & audit
│   ├── dashboard/       # REST API for stats & history
│   └── models/          # Individual ML model services
│       ├── rule-engine/
│       ├── xgboost-service/
│       ├── gnn-service/
│       ├── lstm-service/
│       └── nlp-service/
├── models/              # Trained model artifacts
├── training/            # Model training scripts
├── data/                # Synthetic data generator & schema
├── demo/                # CLI simulator
├── tests/               # Unit, integration & load tests
├── docker-compose.yml   # Full infrastructure stack
└── Makefile             # Dev shortcuts
```

## Services

### Ingestion Layer (Port 8000)

`services/txn-ingestion/` - Validates & produces transactions to Kafka

**Endpoint**: `POST /v1/transaction`

```json
{
	"txn_id": "TXN202604190001",
	"user_vpa": "user@okaxis",
	"payee_vpa": "merchant@paytm",
	"amount": 5000.0,
	"timestamp": "2026-04-19T14:32:01Z",
	"device_id": "d8f7a2b1c3e4",
	"remarks": "lunch payment",
	"biometrics": {
		"pin_entry_duration_ms": 2340,
		"tap_pressure_avg": 0.62,
		"copy_paste_amount": false
	}
}
```

### Feature Engine

`services/feature-engine/` - Real-time feature computation from Kafka streams

- Velocity features (txn count/amount in 1h window)
- Payee novelty (first seen < 24h)
- Device sharing patterns
- Amount deviations from user baseline
- Caches in Redis for <10ms lookup

### Decision Engine (Port 8001)

`services/decision-engine/` - Orchestrates model inference with 80ms timeout

- Calls 5 model services in parallel
- Aggregates scores via ensemble
- Produces decisions to Kafka topic `decision.made`
- Returns: `ALLOW | FRICTION | BLOCK`

### Model Services (Ports 9001-9005)

#### Rule Engine (9001)

Deterministic rules:

- Hard limits (amount > ₹50K → +1 violation)
- Velocity thresholds (> 10 txns/hour → +1)
- New payee + high amount → +1

#### XGBoost Service (9002)

Trains on 50+ engineered features. Fast inference via JSON-compatible models.

#### GNN Service (9003)

Detects mule networks via graph embeddings:

- Transaction graph built from last 30 days
- Node embeddings: degree, avg amount, account age
- Score = 1 - cosine_similarity(user_emb, payee_emb)
- Detects: **SIM_SWAP_BURST, MULE_NETWORK, COLLECT_REQUEST_FRAUD**

#### LSTM Service (9004)

Behavioral anomaly detection:

- Input: last 20 transactions per user
- Sequence features: [amount_norm, hour, day_of_week, new_payee_flag]
- Detects: unusual patterns (dormant account suddenly active at 2AM)

#### NLP Service (9005)

Remark classification (BERT-tiny fine-tuned):

- Labels fraud keywords: "refund", "urgent", "KYC", "lottery", "cashback processing"
- Detects: **REFUND_SCAM, COLLECT_REQUEST_FRAUD**

### Ensemble Service (Port 8002)

Logistic regression meta-learner over:

- 5 model scores
- Amount bucket
- New payee flag
- Transaction velocity bucket

Output: calibrated fraud probability (0-1)

### Action Executor

Consumes `decision.made` topic:

- Logs decisions to PostgreSQL `decisions` table
- Triggers side-effects:
    - `ALLOW`: proceed
    - `FRICTION`: trigger 2FA, MPIN re-entry
    - `BLOCK`: hold transaction, notify user

## Training Pipeline

### Feature Engineering

**Temporal Split** (critical for realistic evaluation):

- Train: Jan-Oct 2025
- Test: Nov-Dec 2025
- Prevents data leakage on sequence features

**Fraud Patterns Injected** (1% rate):

1. **REFUND_SCAM** (25%)
    - Small amounts: ₹199, ₹499, ₹999
    - Remarks: "refund processing fee", "KYC update urgent"
    - Signal: copy_paste_amount=true

2. **QR_SWAP** (25%)
    - QR code metadata mismatch
    - Large amounts: ₹500-₹50K
    - Signal: qr_mismatch=true

3. **SIM_SWAP_BURST** (25%)
    - 5-8 txns in 10 min from new device
    - Large amounts: ₹5K-₹50K
    - Signal: device_user_count spike

4. **COLLECT_REQUEST_FRAUD** (15%)
    - UPI pull (payee-initiated)
    - Fast PIN entry (confusion signal)
    - Remarks: "collect request", "prize claim"

5. **MULE_NETWORK** (10%)
    - High in-degree accounts
    - Low account age
    - Detected via GNN centrality

### Key Metrics

| Metric                 | Target |
| ---------------------- | ------ |
| PR-AUC                 | >0.90  |
| Recall @ 70% threshold | >75%   |
| False Positive Rate    | <2%    |
| p95 latency            | <80ms  |

## Explainability

Each decision includes:

```json
{
	"txn_id": "TXN202604190001",
	"score": 0.847,
	"decision": "BLOCK",
	"reasons": ["high_velocity", "copy_paste_amount", "refund_keyword"],
	"pattern": "REFUND_SCAM",
	"latency_ms": 45
}
```

- **Copy-paste detection**: Keyboard event analysis
- **Velocity spike**: Recent 1h txn count/amount
- **Remark classification**: NLP model confidence
- **Graph anomaly**: High betweenness centrality (mule account)
- **Behavioral deviation**: LSTM reconstruction loss

## Database Schema

### PostgreSQL (`fraud_detection`)

**transactions** table:

- txn_id, user_vpa, payee_vpa, amount, timestamp, device_id, remarks
- Index: `(user_vpa, timestamp DESC)` for fast user history

**decisions** table:

- txn_id, score, decision (ALLOW/FRICTION/BLOCK), reasons[], pattern, latency_ms
- Index: `(timestamp DESC)` for audit queries

**feedback** table:

- txn_id, user_reported, bank_confirmed, label (FRAUD/LEGIT)
- For continuous model retraining

### Neo4j (Transaction Graph)

Nodes: `:Account` {vpa, account_age_days, risk_score}
Edges: `:TRANSFERRED_TO` {amount, timestamp, is_fraud}

Queries:

```cypher
// Detect mule accounts (high in-degree, low age)
MATCH (src:Account)-[r:TRANSFERRED_TO]->(mule:Account)
WHERE mule.account_age_days < 30
  AND SIZE((mule)<-[:TRANSFERRED_TO]-()) > 50
RETURN mule, size((mule)<-[:TRANSFERRED_TO]-()) as in_degree
```

### Redis (Feature Cache)

Key patterns:

```
velocity:{user_vpa}:count    → int (txn count)
amount:{user_vpa}:sum        → float (sum)
payee:{payee_vpa}:senders    → set (unique senders)
features:{txn_id}            → hash (all features, 1h TTL)
```

## Kafka Topics

| Topic           | Retention            | Partitioning | Consumers                  |
| --------------- | -------------------- | ------------ | -------------------------- |
| `txn.raw`       | 7 days               | user_vpa     | feature-engine             |
| `txn.enriched`  | 3 days               | user_vpa     | decision-engine            |
| `decision.made` | 30 days (compliance) | txn_id       | action-executor, analytics |

## Deployment (Production)

### Kubernetes

```yaml
# Example: decision-engine deployment
apiVersion: apps/v1
kind: Deployment
metadata:
    name: decision-engine
spec:
    replicas: 3
    template:
        spec:
            containers:
                - name: decision-engine
                  image: rakshanet/decision-engine:latest
                  resources:
                      requests:
                          memory: "512Mi"
                          cpu: "250m"
                      limits:
                          memory: "1Gi"
                          cpu: "500m"
                  livenessProbe:
                      httpGet:
                          path: /health
                          port: 8001
                      initialDelaySeconds: 10
                      periodSeconds: 10
```

### Monitoring

- **Prometheus**: Latency, error rates, fraud rate
- **Grafana**: Real-time dashboards
- **DataDog/ELK**: Log aggregation
- **PagerDuty**: Alert on anomalies

## Cost Optimization (AWS)

- **Kafka**: MSK (Managed Streaming for Kafka) vs self-managed ECS
- **Models**: SageMaker endpoints for inference
- **DB**: RDS PostgreSQL Multi-AZ, Aurora for analytics
- **Cache**: ElastiCache Redis (cluster mode)

Estimated monthly: $800-$1200 for 10K txn/sec

## Development

### Adding a New Model Service

1. Create `services/models/{name}/`:

    ```
    ├── Dockerfile
    ├── requirements.txt
    └── main.py
    ```

2. Implement `@app.post("/score")` endpoint
3. Add to `docker-compose.yml`
4. Update decision-engine to call new service

### Testing

#### Prerequisites for Tests

```bash
# Install test dependencies (unit + integration + load testing)
pip install -r requirements-dev.txt

# Start Docker Compose services (required for integration tests)
make up
```

#### Run Tests

```bash
# Unit tests (fast, no Docker required)
pytest tests/

# Integration tests (requires 'make up')
python -m pytest tests/integration/ -v

# Load testing (requires 'make up')
locust -f tests/load_test.py --host http://localhost:8000
```

**Test Coverage:**
- **Unit tests** (16 tests): Feature parsing robustness, request validation, no Docker needed
- **Integration tests** (2 tests): End-to-end pipeline with Postgres persistence, validates FK constraints
- **Load test**: Simulates realistic UPI transaction patterns (small amounts, high-value, refund scams)

## References

- [UPI Fraud Patterns](https://www.npci.org.in/)
- [SHAP Explainability](https://github.com/slundberg/shap)
- [GraphSAGE](https://arxiv.org/abs/1706.02216)
- [Temporal Machine Learning](https://www.datascienceweekly.org/)

## License

MIT

## Contributing

See [CONTRIBUTING.md](./.info/CONTRIBUTING.md)
