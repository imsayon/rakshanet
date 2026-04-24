.PHONY: up down train train-all generate demo logs test

# ── Full demo setup (generate 1M rows + train + start services) ──
demo:
	bash scripts/demo_setup.sh

up:
	docker compose up -d --build

down:
	docker compose down -v

# ── Generate 1M synthetic transactions ──
generate:
	python data/generate_synthetic.py --n 1000000 --output data/transactions.parquet

# ── Train models (skip NLP for fast setup) ──
train:
	python training/train_xgboost.py
	python training/train_lstm.py
	python training/train_gnn.py
	python training/train_ensemble.py

# ── Train ALL models including NLP (requires BERT download, ~20 min) ──
train-all:
	python training/train_xgboost.py
	python training/train_lstm.py
	python training/train_nlp.py
	python training/train_gnn.py
	python training/train_ensemble.py

logs:
	docker compose logs -f decision-engine

test:
	python demo/simulator.py --mode all --count 100