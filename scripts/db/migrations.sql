-- ════════════════════════════════════════════════════════════════════════════
-- FATHOM — SUPABASE MIGRATIONS
-- Run in Supabase SQL editor (Dashboard → SQL Editor → New Query)
-- Run in order: 001 → 002 → 003 → 004 → 005
-- ════════════════════════════════════════════════════════════════════════════

-- ── 001: ENABLE EXTENSIONS ───────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";       -- for fast ILIKE searches

-- ── 002: USERS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "clerkId"          TEXT NOT NULL UNIQUE,
  "stripeCustomerId" TEXT UNIQUE,
  "discordId"        TEXT UNIQUE,
  email              TEXT NOT NULL,
  "platformTier"     TEXT NOT NULL DEFAULT 'free'
                       CHECK ("platformTier" IN ('free','starter','pro','whale')),
  "apiTier"          TEXT
                       CHECK ("apiTier" IN ('api_500','api_2500','api_10000','api_enterprise')),
  "botTier"          TEXT
                       CHECK ("botTier" IN ('bot_free','bot_basic','bot_pro','bot_server')),
  "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_clerk    ON users("clerkId");
CREATE INDEX IF NOT EXISTS idx_users_stripe   ON users("stripeCustomerId");
CREATE INDEX IF NOT EXISTS idx_users_discord  ON users("discordId");

-- Auto-update updatedAt
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW."updatedAt" = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── 003: OPTIONS FLOW CACHE ───────────────────────────────────────────────────
-- Rolling window — keep last 48 hours only (cleanup job in ingest pipeline)
CREATE TABLE IF NOT EXISTS flow_cache (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticker          TEXT NOT NULL,
  "optionType"    TEXT NOT NULL CHECK ("optionType" IN ('call','put')),
  strike          NUMERIC(10,2) NOT NULL,
  expiry          DATE NOT NULL,
  dte             INTEGER NOT NULL,
  premium         NUMERIC(10,2) NOT NULL,
  size            INTEGER NOT NULL,
  "totalPremium"  NUMERIC(14,2) NOT NULL,
  "orderType"     TEXT NOT NULL CHECK ("orderType" IN ('sweep','block','split')),
  sentiment       TEXT NOT NULL CHECK (sentiment IN ('bullish','bearish','neutral')),
  exchange        TEXT NOT NULL,
  iv              NUMERIC(6,4),
  "openInterest"  INTEGER,
  "spotPrice"     NUMERIC(10,2),
  "isWhale"       BOOLEAN NOT NULL DEFAULT FALSE,
  timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flow_ticker     ON flow_cache(ticker);
CREATE INDEX IF NOT EXISTS idx_flow_timestamp  ON flow_cache(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_flow_whale      ON flow_cache("isWhale") WHERE "isWhale" = TRUE;
CREATE INDEX IF NOT EXISTS idx_flow_type       ON flow_cache("optionType");

-- Enable real-time for live dashboard feed
ALTER TABLE flow_cache REPLICA IDENTITY FULL;

-- ── 004: DARK POOL ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dark_pool (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticker      TEXT NOT NULL,
  size        BIGINT NOT NULL,
  price       NUMERIC(10,2) NOT NULL,
  notional    NUMERIC(16,2) NOT NULL,
  exchange    TEXT NOT NULL,
  signal      TEXT NOT NULL CHECK (signal IN ('accumulation','distribution','neutral')),
  timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dp_ticker     ON dark_pool(ticker);
CREATE INDEX IF NOT EXISTS idx_dp_timestamp  ON dark_pool(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_dp_notional   ON dark_pool(notional DESC);

ALTER TABLE dark_pool REPLICA IDENTITY FULL;

-- ── 005: CONGRESSIONAL TRADES ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS congress (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  politician        TEXT NOT NULL,
  chamber           TEXT NOT NULL CHECK (chamber IN ('house','senate')),
  party             TEXT NOT NULL CHECK (party IN ('R','D','I')),
  state             TEXT NOT NULL,
  ticker            TEXT NOT NULL,
  "tradeType"       TEXT NOT NULL CHECK ("tradeType" IN ('purchase','sale','sale_partial','exchange')),
  "amountMin"       BIGINT NOT NULL,
  "amountMax"       BIGINT NOT NULL,
  "tradeDate"       DATE NOT NULL,
  "disclosureDate"  DATE NOT NULL,
  committees        TEXT[] DEFAULT '{}',
  "filingUrl"       TEXT,
  timestamp         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(politician, ticker, "tradeDate", "tradeType", "amountMin")
);

CREATE INDEX IF NOT EXISTS idx_congress_ticker     ON congress(ticker);
CREATE INDEX IF NOT EXISTS idx_congress_politician ON congress USING gin(politician gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_congress_disclosure ON congress("disclosureDate" DESC);

-- ── 006: ALERT RULES ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alert_rules (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "userId"      TEXT NOT NULL REFERENCES users("clerkId") ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN ('flow','darkpool','congress','price')),
  ticker        TEXT,                         -- NULL = all tickers
  "optionType"  TEXT CHECK ("optionType" IN ('call','put')),
  "premiumMin"  NUMERIC(14,2),               -- minimum total premium filter
  "sweepOnly"   BOOLEAN NOT NULL DEFAULT FALSE,
  "isActive"    BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerts_user   ON alert_rules("userId");
CREATE INDEX IF NOT EXISTS idx_alerts_active ON alert_rules("isActive") WHERE "isActive" = TRUE;

-- ── 007: ALERT LOG ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alert_log (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "userId"  TEXT NOT NULL,
  "ruleId"  UUID NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
  payload   JSONB NOT NULL DEFAULT '{}',
  "sentAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  channel   TEXT NOT NULL CHECK (channel IN ('discord','email','webhook'))
);

CREATE INDEX IF NOT EXISTS idx_alert_log_user   ON alert_log("userId");
CREATE INDEX IF NOT EXISTS idx_alert_log_sent   ON alert_log("sentAt" DESC);

-- ── 008: API USAGE ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_usage (
  "userId"        TEXT NOT NULL REFERENCES users("clerkId") ON DELETE CASCADE,
  "weekStart"     DATE NOT NULL,              -- always a Monday
  "creditsUsed"   INTEGER NOT NULL DEFAULT 0,
  "creditsTotal"  INTEGER NOT NULL DEFAULT 0,
  "lastUsedAt"    TIMESTAMPTZ,
  PRIMARY KEY ("userId", "weekStart")
);

CREATE INDEX IF NOT EXISTS idx_api_usage_user ON api_usage("userId");

-- ── 009: ROW-LEVEL SECURITY ───────────────────────────────────────────────────
-- Users can only see their own data
ALTER TABLE users        ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_rules  ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_log    ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_usage    ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS (used by server-side admin client)
-- Anon/authenticated users can only access their own rows

CREATE POLICY "users_own_row" ON users
  FOR ALL USING (auth.uid()::text = "clerkId");

CREATE POLICY "alerts_own_rows" ON alert_rules
  FOR ALL USING (auth.uid()::text = "userId");

CREATE POLICY "alert_log_own_rows" ON alert_log
  FOR ALL USING (auth.uid()::text = "userId");

CREATE POLICY "api_usage_own_rows" ON api_usage
  FOR ALL USING (auth.uid()::text = "userId");

-- flow_cache, dark_pool, congress are public reads (gated by app-level auth)
ALTER TABLE flow_cache   ENABLE ROW LEVEL SECURITY;
ALTER TABLE dark_pool    ENABLE ROW LEVEL SECURITY;
ALTER TABLE congress     ENABLE ROW LEVEL SECURITY;

CREATE POLICY "flow_public_read"    ON flow_cache  FOR SELECT USING (TRUE);
CREATE POLICY "darkpool_public_read" ON dark_pool  FOR SELECT USING (TRUE);
CREATE POLICY "congress_public_read" ON congress   FOR SELECT USING (TRUE);

-- ── 010: CLEANUP FUNCTION (scheduled via pg_cron or Supabase cron) ────────────
-- Deletes flow_cache rows older than 48 hours (keeps table lean)
CREATE OR REPLACE FUNCTION cleanup_old_flow()
RETURNS void AS $$
BEGIN
  DELETE FROM flow_cache WHERE timestamp < NOW() - INTERVAL '48 hours';
  DELETE FROM dark_pool  WHERE timestamp < NOW() - INTERVAL '48 hours';
END;
$$ LANGUAGE plpgsql;

-- Schedule: In Supabase Dashboard → Database → Extensions → pg_cron
-- SELECT cron.schedule('cleanup-flow', '0 */6 * * *', 'SELECT cleanup_old_flow()');

-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION COMPLETE
-- Verify with: SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
-- ════════════════════════════════════════════════════════════════════════════
