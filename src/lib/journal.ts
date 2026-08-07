import { MarketSnapshot, JournalEntry } from '@/engine/types';
import { supabase } from '@/lib/supabase';

export interface SignalRecord {
  direction: string;
  status: string;
  confidence: number;
  regime: string;
  entry_price: number | null;
  stop_price: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  rr1: number | null;
  rr2: number | null;
  rr3: number | null;
  ev: number | null;
  regime_label: string | null;
  scenario_main_prob: number;
  scenario_alt_prob: number;
  scenario_neutral_prob: number;
  conflicts: string[];
  decision_tree: string[];
  agent_raws: Record<string, number>;
  agent_weights: Record<string, number>;
  microstructure_ofi: number | null;
  microstructure_cvd: number | null;
  microstructure_divergence: string;
  has_absorption: boolean;
  has_sweep: boolean;
  has_exhaustion: boolean;
  structure_h1_bias: string;
  structure_d_bias: string;
  premium_discount: string | null;
  next_news_minutes: number | null;
}

export function snapshotToSignalRecord(snap: MarketSnapshot): SignalRecord {
  const plan = snap.plan;
  const m = snap.microstructure;
  const sH1 = snap.structure.H1;
  const sD = snap.structure.D;
  const nextNews = snap.macro[0];

  const agentRawMap: Record<string, number> = {};
  const agentWeightMap: Record<string, number> = {};
  for (const a of plan.agents) {
    agentRawMap[a.agent] = a.raw;
    agentWeightMap[a.agent] = a.weight;
  }

  let premiumDiscount: string | null = null;
  if (sH1.dealingRange) {
    premiumDiscount = sH1.premium ? 'PREMIUM' : sH1.discount ? 'DISCOUNT' : 'EQUILIBRIUM';
  }

  return {
    direction: plan.direction > 0 ? 'BUY' : plan.direction < 0 ? 'SELL' : 'NEUTRAL',
    status: plan.status,
    confidence: plan.confidence,
    regime: plan.regime,
    entry_price: plan.entry[0] !== 0 ? (plan.entry[0] + plan.entry[1]) / 2 : null,
    stop_price: plan.stop !== 0 ? plan.stop : null,
    tp1: plan.targets[0] || null,
    tp2: plan.targets[1] || null,
    tp3: plan.targets[2] || null,
    rr1: plan.rR[0] || null,
    rr2: plan.rR[1] || null,
    rr3: plan.rR[2] || null,
    ev: plan.ev,
    regime_label: plan.regimeLabel,
    scenario_main_prob: plan.scenarios[0]?.probability ?? 0,
    scenario_alt_prob: plan.scenarios[1]?.probability ?? 0,
    scenario_neutral_prob: plan.scenarios[2]?.probability ?? 0,
    conflicts: plan.conflicts,
    decision_tree: plan.decisionTree,
    agent_raws: agentRawMap,
    agent_weights: agentWeightMap,
    microstructure_ofi: m.ofi,
    microstructure_cvd: m.cvd,
    microstructure_divergence: m.divergence,
    has_absorption: !!m.absorption,
    has_sweep: !!m.sweep,
    has_exhaustion: !!m.exhaustion,
    structure_h1_bias: sH1.bias,
    structure_d_bias: sD.bias,
    premium_discount: premiumDiscount,
    next_news_minutes: nextNews?.minutesUntil ?? null,
  };
}

export async function recordSignal(snap: MarketSnapshot): Promise<string | null> {
  const record = snapshotToSignalRecord(snap);
  try {
    const { data, error } = await supabase
      .from('signal_journal')
      .insert(record)
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('Failed to record signal:', error.message);
      return null;
    }
    return data?.id ?? null;
  } catch (err) {
    console.error('Signal recording error:', err);
    return null;
  }
}

export async function fetchJournal(limit: number = 50): Promise<JournalEntry[]> {
  try {
    const { data, error } = await supabase
      .from('signal_journal')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Failed to fetch journal:', error.message);
      return [];
    }

    return (data || []).map((row) => ({
      id: row.id,
      time: new Date(row.created_at).getTime(),
      direction: row.direction === 'BUY' ? 1 : row.direction === 'SELL' ? -1 : 0,
      status: row.status,
      confidence: parseFloat(row.confidence) || 0,
      regime: row.regime,
      entry: parseFloat(row.entry_price) || 0,
      stop: parseFloat(row.stop_price) || 0,
      targets: [parseFloat(row.tp1), parseFloat(row.tp2), parseFloat(row.tp3)].filter((v) => !isNaN(v)),
      outcome: row.outcome || 'pending',
      reasoning: (row.decision_tree || []).join(' '),
      conflicts: row.conflicts || [],
      ev: parseFloat(row.ev) || 0,
    }));
  } catch (err) {
    console.error('Journal fetch error:', err);
    return [];
  }
}
