/*
# Create signal journal table for XAU/USD quant engine

## Purpose
This table is the foundation of the learning layer. Every signal the engine
produces is recorded BEFORE the future is known, with the full decision
context. Later, a separate process evaluates whether the TP or SL was hit
and updates the outcome. This enables statistical calibration: comparing
predicted probabilities with actual hit rates.

## New Tables
- `signal_journal`
  - `id` (uuid, primary key)
  - `created_at` (timestamptz, when the signal was generated)
  - `direction` (text: BUY, SELL, or NEUTRAL)
  - `status` (text: WAIT, READY, EXECUTE, NO_TRADE, MONITOR)
  - `confidence` (numeric 0-1, heuristic probability estimate)
  - `regime` (text, market regime label)
  - `entry_price` (numeric, planned entry midpoint)
  - `stop_price` (numeric, stop-loss level)
  - `tp1` (numeric, first take-profit target)
  - `tp2` (numeric, second take-profit target)
  - `tp3` (numeric, third take-profit target)
  - `rr1` (numeric, risk-reward ratio for TP1)
  - `rr2` (numeric, risk-reward ratio for TP2)
  - `rr3` (numeric, risk-reward ratio for TP3)
  - `ev` (numeric, expected value in R multiples)
  - `regime_label` (text, human-readable regime)
  - `scenario_main_prob` (numeric 0-1)
  - `scenario_alt_prob` (numeric 0-1)
  - `scenario_neutral_prob` (numeric 0-1)
  - `conflicts` (text[], array of conflict descriptions)
  - `decision_tree` (text[], array of decision steps)
  - `agent_raws` (jsonb, map of agent name -> raw signal value)
  - `agent_weights` (jsonb, map of agent name -> weight)
  - `microstructure_ofi` (numeric, order flow imbalance)
  - `microstructure_cvd` (numeric, cumulative volume delta)
  - `microstructure_divergence` (text, none/bullish/bearish)
  - `has_absorption` (boolean)
  - `has_sweep` (boolean)
  - `has_exhaustion` (boolean)
  - `structure_h1_bias` (text)
  - `structure_d_bias` (text)
  - `premium_discount` (text: PREMIUM, DISCOUNT, EQUILIBRIUM, or null)
  - `next_news_minutes` (integer, minutes until next macro event)
  - `outcome` (text: pending, win, loss, void — filled later)
  - `outcome_time` (timestamptz, when outcome was determined)
  - `outcome_price` (numeric, price at outcome)
  - `mfe` (numeric, maximum favorable excursion in dollars)
  - `mae` (numeric, maximum adverse excursion in dollars)

## Security
- Enable RLS on `signal_journal`.
- Single-tenant app (no sign-in screen): allow anon + authenticated full CRUD.
  The data is intentionally shared — this is a local analysis tool, not a
  multi-user SaaS.

## Important Notes
1. The `outcome` column defaults to 'pending' and is only updated when the
   market data confirms TP or SL was hit (or the time barrier expired).
2. The `agent_raws` and `agent_weights` jsonb columns capture the full agent
   fusion state for later analysis and weight recalibration.
3. `mfe` and `mae` are filled post-hoc to measure how far price went in favor
   and against the trade before resolution.
*/

CREATE TABLE IF NOT EXISTS signal_journal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  direction text NOT NULL,
  status text NOT NULL,
  confidence numeric(5,4) NOT NULL,
  regime text NOT NULL,
  entry_price numeric(12,4),
  stop_price numeric(12,4),
  tp1 numeric(12,4),
  tp2 numeric(12,4),
  tp3 numeric(12,4),
  rr1 numeric(5,2),
  rr2 numeric(5,2),
  rr3 numeric(5,2),
  ev numeric(8,4),
  regime_label text,
  scenario_main_prob numeric(5,4),
  scenario_alt_prob numeric(5,4),
  scenario_neutral_prob numeric(5,4),
  conflicts text[] DEFAULT '{}',
  decision_tree text[] DEFAULT '{}',
  agent_raws jsonb DEFAULT '{}',
  agent_weights jsonb DEFAULT '{}',
  microstructure_ofi numeric(8,4),
  microstructure_cvd numeric(12,2),
  microstructure_divergence text,
  has_absorption boolean DEFAULT false,
  has_sweep boolean DEFAULT false,
  has_exhaustion boolean DEFAULT false,
  structure_h1_bias text,
  structure_d_bias text,
  premium_discount text,
  next_news_minutes integer,
  outcome text NOT NULL DEFAULT 'pending',
  outcome_time timestamptz,
  outcome_price numeric(12,4),
  mfe numeric(12,4),
  mae numeric(12,4)
);

ALTER TABLE signal_journal ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_signals" ON signal_journal;
CREATE POLICY "anon_select_signals" ON signal_journal FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_signals" ON signal_journal;
CREATE POLICY "anon_insert_signals" ON signal_journal FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_signals" ON signal_journal;
CREATE POLICY "anon_update_signals" ON signal_journal FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_signals" ON signal_journal;
CREATE POLICY "anon_delete_signals" ON signal_journal FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_signal_journal_created ON signal_journal (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signal_journal_outcome ON signal_journal (outcome);
CREATE INDEX IF NOT EXISTS idx_signal_journal_direction ON signal_journal (direction);
