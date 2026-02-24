-- ============================================================================
-- Portfolio Tracker — Supabase PostgreSQL Schema
-- Generated: 2026-02-21
-- ============================================================================

-- ==========================  EXTENSIONS  ====================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==========================  ENUM TYPES  ====================================
CREATE TYPE asset_type AS ENUM (
  'stock', 'etf', 'crypto', 'mutual_fund', 'option', 'other'
);

CREATE TYPE transaction_type AS ENUM (
  'buy', 'sell', 'dividend', 'split', 'transfer_in', 'transfer_out',
  'deposit', 'withdrawal', 'margin_interest',
  'option_exercise', 'option_assignment', 'option_expiration'
);

-- Migration for existing databases:
-- ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'deposit';
-- ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'withdrawal';
-- ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'margin_interest';
-- ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'option_exercise';
-- ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'option_assignment';
-- ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'option_expiration';
-- ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_quantity_check;
-- ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_price_per_unit_check;

CREATE TYPE option_type AS ENUM ('call', 'put');

CREATE TYPE broker_source AS ENUM (
  'manual', 'robinhood', 'fidelity', 'schwab', 'other'
);

CREATE TYPE import_status AS ENUM (
  'pending', 'processing', 'completed', 'failed'
);

CREATE TYPE insight_type AS ENUM (
  'company_summary', 'earnings_analysis', 'portfolio_health',
  'recommendation', 'news_digest'
);

-- ==========================  HELPER FUNCTIONS  ==============================

-- Auto-update updated_at on row modification
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Auto-create a profile row when a new user signs up via Supabase Auth
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name',
             NEW.raw_user_meta_data ->> 'name',
             split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data ->> 'avatar_url', NULL)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- 1. PROFILES  (extends auth.users)
-- ============================================================================
CREATE TABLE profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auth trigger — fires after a new row in auth.users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================================
-- 2. PORTFOLIOS
-- ============================================================================
CREATE TABLE portfolios (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  color       TEXT DEFAULT '#6366f1',   -- hex colour for UI badges
  is_default  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_portfolios_user_id ON portfolios(user_id);

CREATE TRIGGER portfolios_updated_at
  BEFORE UPDATE ON portfolios
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Ensure only ONE default portfolio per user
CREATE UNIQUE INDEX uq_portfolios_default_per_user
  ON portfolios(user_id) WHERE is_default = true;

-- ============================================================================
-- 3. ASSETS  (shared / global reference table)
-- ============================================================================
CREATE TABLE assets (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  symbol      TEXT NOT NULL,
  name        TEXT,
  asset_type  asset_type NOT NULL DEFAULT 'stock',
  sector      TEXT,
  industry    TEXT,
  exchange    TEXT,
  logo_url    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_assets_symbol ON assets(symbol);
CREATE INDEX idx_assets_asset_type ON assets(asset_type);
CREATE INDEX idx_assets_sector     ON assets(sector);

CREATE TRIGGER assets_updated_at
  BEFORE UPDATE ON assets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- 4. IMPORT BATCHES  (must exist before transactions that reference it)
-- ============================================================================
CREATE TABLE import_batches (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  broker_source  broker_source NOT NULL,
  file_name      TEXT,
  status         import_status NOT NULL DEFAULT 'pending',
  total_rows     INTEGER DEFAULT 0,
  processed_rows INTEGER DEFAULT 0,
  error_log      JSONB DEFAULT '[]'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_import_batches_user_id ON import_batches(user_id);
CREATE INDEX idx_import_batches_status  ON import_batches(status);

-- ============================================================================
-- 5. TRANSACTIONS  (source of truth)
-- ============================================================================
CREATE TABLE transactions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  portfolio_id      UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  asset_id          UUID NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  transaction_type  transaction_type NOT NULL,
  quantity          NUMERIC NOT NULL,
  price_per_unit    NUMERIC NOT NULL,
  total_amount      NUMERIC NOT NULL,
  fees              NUMERIC NOT NULL DEFAULT 0 CHECK (fees >= 0),
  currency          TEXT NOT NULL DEFAULT 'USD',
  transaction_date  TIMESTAMPTZ NOT NULL,
  notes             TEXT,
  broker_source     broker_source NOT NULL DEFAULT 'manual',
  import_batch_id   UUID REFERENCES import_batches(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_transactions_portfolio_id     ON transactions(portfolio_id);
CREATE INDEX idx_transactions_asset_id         ON transactions(asset_id);
CREATE INDEX idx_transactions_transaction_date ON transactions(transaction_date DESC);
CREATE INDEX idx_transactions_import_batch_id  ON transactions(import_batch_id)
  WHERE import_batch_id IS NOT NULL;
CREATE INDEX idx_transactions_portfolio_asset  ON transactions(portfolio_id, asset_id);
CREATE INDEX idx_transactions_broker_source    ON transactions(broker_source);

-- ============================================================================
-- 6. ASSET PRICES  (cached market data)
-- ============================================================================
CREATE TABLE asset_prices (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id    UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  price       NUMERIC NOT NULL,
  price_date  DATE NOT NULL,
  open        NUMERIC,
  high        NUMERIC,
  low         NUMERIC,
  close       NUMERIC,
  volume      BIGINT,
  source      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_asset_prices_asset_date ON asset_prices(asset_id, price_date);
CREATE INDEX idx_asset_prices_price_date       ON asset_prices(price_date DESC);

-- ============================================================================
-- 7. EARNINGS CALENDAR
-- ============================================================================
CREATE TABLE earnings_calendar (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id          UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  earnings_date     DATE NOT NULL,
  fiscal_quarter    TEXT,             -- e.g. 'Q1 2026'
  eps_estimate      NUMERIC,
  eps_actual        NUMERIC,
  revenue_estimate  NUMERIC,
  revenue_actual    NUMERIC,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_earnings_calendar_asset_id      ON earnings_calendar(asset_id);
CREATE INDEX idx_earnings_calendar_earnings_date ON earnings_calendar(earnings_date DESC);

CREATE TRIGGER earnings_calendar_updated_at
  BEFORE UPDATE ON earnings_calendar
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- 7b. OPTIONS CONTRACTS  (structured metadata for option assets)
-- ============================================================================
CREATE TABLE options_contracts (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id              UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  underlying_symbol     TEXT NOT NULL,
  option_type           option_type NOT NULL,
  strike_price          NUMERIC NOT NULL CHECK (strike_price > 0),
  expiration_date       DATE NOT NULL,
  contract_multiplier   INTEGER NOT NULL DEFAULT 100,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_options_contracts_asset ON options_contracts(asset_id);
CREATE INDEX idx_options_contracts_underlying ON options_contracts(underlying_symbol);
CREATE INDEX idx_options_contracts_expiration ON options_contracts(expiration_date);

CREATE TRIGGER options_contracts_updated_at
  BEFORE UPDATE ON options_contracts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Migration for existing databases:
-- CREATE TYPE option_type AS ENUM ('call', 'put');
-- CREATE TABLE options_contracts ( ... );  -- full DDL above

-- ============================================================================
-- 8. AI INSIGHTS  (cached AI analysis)
-- ============================================================================
CREATE TABLE ai_insights (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id      UUID REFERENCES assets(id) ON DELETE CASCADE,
  portfolio_id  UUID REFERENCES portfolios(id) ON DELETE CASCADE,
  insight_type  insight_type NOT NULL,
  content       JSONB NOT NULL DEFAULT '{}'::jsonb,
  ai_provider   TEXT,
  model         TEXT,
  expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- At least one of asset_id or portfolio_id must be set
  CONSTRAINT chk_ai_insight_target
    CHECK (asset_id IS NOT NULL OR portfolio_id IS NOT NULL)
);

CREATE INDEX idx_ai_insights_asset_id      ON ai_insights(asset_id)     WHERE asset_id IS NOT NULL;
CREATE INDEX idx_ai_insights_portfolio_id  ON ai_insights(portfolio_id) WHERE portfolio_id IS NOT NULL;
CREATE INDEX idx_ai_insights_expires_at    ON ai_insights(expires_at);
CREATE INDEX idx_ai_insights_insight_type  ON ai_insights(insight_type);

-- ============================================================================
-- 9. WATCHLIST
-- ============================================================================
CREATE TABLE watchlist (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  asset_id  UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  added_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes     TEXT
);

CREATE UNIQUE INDEX uq_watchlist_user_asset ON watchlist(user_id, asset_id);
CREATE INDEX idx_watchlist_user_id          ON watchlist(user_id);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- ----------  profiles  ----------
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Insert is handled by the auth trigger (SECURITY DEFINER), so no INSERT
-- policy is needed for normal users.

-- ----------  portfolios  ----------
ALTER TABLE portfolios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own portfolios"
  ON portfolios FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own portfolios"
  ON portfolios FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own portfolios"
  ON portfolios FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own portfolios"
  ON portfolios FOR DELETE
  USING (auth.uid() = user_id);

-- ----------  transactions  ----------
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view transactions in their portfolios"
  ON transactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM portfolios p
      WHERE p.id = transactions.portfolio_id
        AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert transactions into their portfolios"
  ON transactions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM portfolios p
      WHERE p.id = transactions.portfolio_id
        AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update transactions in their portfolios"
  ON transactions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM portfolios p
      WHERE p.id = transactions.portfolio_id
        AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM portfolios p
      WHERE p.id = transactions.portfolio_id
        AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete transactions in their portfolios"
  ON transactions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM portfolios p
      WHERE p.id = transactions.portfolio_id
        AND p.user_id = auth.uid()
    )
  );

-- ----------  import_batches  ----------
ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own import batches"
  ON import_batches FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own import batches"
  ON import_batches FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own import batches"
  ON import_batches FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own import batches"
  ON import_batches FOR DELETE
  USING (auth.uid() = user_id);

-- ----------  assets (global, read-only for authenticated)  ----------
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read assets"
  ON assets FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert assets"
  ON assets FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update assets"
  ON assets FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ----------  asset_prices (global, read-only for authenticated)  ----------
ALTER TABLE asset_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read asset prices"
  ON asset_prices FOR SELECT
  USING (auth.role() = 'authenticated');

-- ----------  earnings_calendar (global, read-only for authenticated)  ----------
ALTER TABLE earnings_calendar ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read earnings calendar"
  ON earnings_calendar FOR SELECT
  USING (auth.role() = 'authenticated');

-- ----------  options_contracts (global, read/write for authenticated)  ----------
ALTER TABLE options_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read options contracts"
  ON options_contracts FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert options contracts"
  ON options_contracts FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update options contracts"
  ON options_contracts FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ----------  ai_insights  ----------
ALTER TABLE ai_insights ENABLE ROW LEVEL SECURITY;

-- Asset-level insights are readable by all authenticated users
CREATE POLICY "Authenticated users can read asset-level insights"
  ON ai_insights FOR SELECT
  USING (
    (asset_id IS NOT NULL AND portfolio_id IS NULL AND auth.role() = 'authenticated')
    OR
    (portfolio_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM portfolios p
      WHERE p.id = ai_insights.portfolio_id
        AND p.user_id = auth.uid()
    ))
  );

-- ----------  watchlist  ----------
ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own watchlist"
  ON watchlist FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can add to their own watchlist"
  ON watchlist FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own watchlist"
  ON watchlist FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete from their own watchlist"
  ON watchlist FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- GRANTS  (Supabase exposes via anon / authenticated roles)
-- ============================================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated;

GRANT SELECT ON profiles          TO authenticated;
GRANT UPDATE ON profiles          TO authenticated;

GRANT ALL   ON portfolios         TO authenticated;
GRANT ALL   ON transactions       TO authenticated;
GRANT ALL   ON import_batches     TO authenticated;
GRANT ALL   ON watchlist          TO authenticated;

GRANT SELECT ON assets            TO authenticated;
GRANT SELECT ON asset_prices      TO authenticated;
GRANT SELECT ON earnings_calendar TO authenticated;
GRANT ALL    ON options_contracts TO authenticated;
GRANT SELECT ON ai_insights       TO authenticated;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
