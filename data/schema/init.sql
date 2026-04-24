CREATE TABLE IF NOT EXISTS transactions (
    txn_id        VARCHAR(50) PRIMARY KEY,
    user_vpa      VARCHAR(100) NOT NULL,
    payee_vpa     VARCHAR(100) NOT NULL,
    amount        DECIMAL(12,2) NOT NULL,
    timestamp     TIMESTAMPTZ NOT NULL,
    device_id     VARCHAR(50),
    remarks       TEXT,
    app_version   VARCHAR(20),
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_txn_user_time  ON transactions (user_vpa, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_txn_payee_time ON transactions (payee_vpa, timestamp DESC);

CREATE TABLE IF NOT EXISTS decisions (
    id          SERIAL PRIMARY KEY,
    txn_id      VARCHAR(50) REFERENCES transactions(txn_id),
    score       DECIMAL(5,3) NOT NULL,
    decision    VARCHAR(10) NOT NULL CHECK (decision IN ('ALLOW','FRICTION','BLOCK')),
    reasons     TEXT[],
    pattern     VARCHAR(50),
    latency_ms  INT,
    timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dec_txn       ON decisions (txn_id);
CREATE INDEX IF NOT EXISTS idx_dec_time      ON decisions (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_dec_score     ON decisions (score DESC);

CREATE TABLE IF NOT EXISTS feedback (
    id              SERIAL PRIMARY KEY,
    txn_id          VARCHAR(50) REFERENCES transactions(txn_id),
    user_reported   BOOLEAN DEFAULT FALSE,
    bank_confirmed  BOOLEAN DEFAULT FALSE,
    label           VARCHAR(10) CHECK (label IN ('FRAUD','LEGIT')),
    timestamp       TIMESTAMPTZ DEFAULT NOW()
);

-- View for training label extraction
CREATE OR REPLACE VIEW labeled_transactions AS
SELECT t.*, d.score, d.decision, d.pattern, f.label
FROM transactions t
JOIN decisions d ON t.txn_id = d.txn_id
LEFT JOIN feedback f ON t.txn_id = f.txn_id;
