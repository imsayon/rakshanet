#!/bin/bash
# ─────────────────────────────────────────────────────────────
# रक्षा-net  ·  One-Command Demo Setup
# Generates 1M synthetic transactions, trains models, starts services.
# Usage:  bash scripts/demo_setup.sh  OR  make demo
# ─────────────────────────────────────────────────────────────
set -e

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

banner() { echo -e "\n${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; echo -e "${GREEN}  $1${NC}"; echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"; }

# ── Step 1: Generate synthetic data ──
banner "Step 1/4 · Generating 1,000,000 synthetic UPI transactions"
python data/generate_synthetic.py --n 1000000 --output data/transactions.parquet

# ── Step 2: Train models (skip NLP — requires BERT download, regex mode works) ──
banner "Step 2/4 · Training XGBoost"
python training/train_xgboost.py

banner "Step 2/4 · Training LSTM"
python training/train_lstm.py

banner "Step 2/4 · Training GNN (mock embeddings)"
python training/train_gnn.py

banner "Step 2/4 · Training Ensemble meta-learner"
python training/train_ensemble.py

echo -e "\n${YELLOW}⚠ Skipped NLP training (requires BERT download ~500MB, takes 20+ min)${NC}"
echo -e "${YELLOW}  NLP service will run in regex-only mode — detects 'refund', 'KYC', etc.${NC}"
echo -e "${YELLOW}  To train NLP:  python training/train_nlp.py${NC}\n"

# ── Step 3: Start Docker services ──
banner "Step 3/4 · Starting Docker services"
docker compose up -d --build

# ── Step 4: Wait for health ──
banner "Step 4/4 · Waiting for services to be healthy"
echo "Kafka, Postgres, Neo4j, and model services are starting up..."
echo "This may take 30-60 seconds on first run."
sleep 10

echo -e "\n${GREEN}✓ रक्षा-net is ready!${NC}"
echo ""
echo "  Dashboard:  cd client && npm install && npm run dev"
echo "  Open:       http://localhost:5173"
echo "  Simulator:  python demo/simulator.py --mode all --count 50"
echo "  Logs:       make logs"
echo ""
