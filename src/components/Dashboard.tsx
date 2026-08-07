import { MarketSnapshot, Timeframe } from '@/engine/types';
import { PriceChart } from './PriceChart';
import { useState, useEffect } from 'react';
import {
  Activity, AlertTriangle, Brain, Crosshair, Database, Gauge, Globe,
  Layers, LineChart, Newspaper, Radio, Shield, Target, TrendingUp,
  TrendingDown, Zap, Eye, Clock, CheckCircle2, XCircle, CircleDot
} from 'lucide-react';

const TF_COLORS: Record<Timeframe, string> = {
  M1: 'text-zinc-400',
  M5: 'text-zinc-300',
  M15: 'text-blue-400',
  H1: 'text-cyan-400',
  H4: 'text-amber-400',
  D: 'text-orange-400',
  W: 'text-rose-400',
};

function statusColor(status: string): string {
  switch (status) {
    case 'EXECUTE': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
    case 'READY': return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
    case 'WAIT': return 'text-blue-400 bg-blue-500/10 border-blue-500/30';
    case 'NO_TRADE': return 'text-rose-400 bg-rose-500/10 border-rose-500/30';
    case 'MONITOR': return 'text-purple-400 bg-purple-500/10 border-purple-500/30';
    default: return 'text-zinc-400 bg-zinc-500/10 border-zinc-500/30';
  }
}

function statusIcon(status: string) {
  switch (status) {
    case 'EXECUTE': return <Crosshair className="w-5 h-5" />;
    case 'READY': return <Target className="w-5 h-5" />;
    case 'WAIT': return <Clock className="w-5 h-5" />;
    case 'NO_TRADE': return <XCircle className="w-5 h-5" />;
    case 'MONITOR': return <Eye className="w-5 h-5" />;
    default: return <CircleDot className="w-5 h-5" />;
  }
}

function dirLabel(dir: number): string {
  return dir > 0 ? 'BUY' : dir < 0 ? 'SELL' : 'NEUTRAL';
}

function dirColor(dir: number): string {
  return dir > 0 ? 'text-emerald-400' : dir < 0 ? 'text-rose-400' : 'text-zinc-400';
}

function dirIcon(dir: number) {
  return dir > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : dir < 0 ? <TrendingDown className="w-3.5 h-3.5" /> : null;
}

function Panel({ title, icon, children, className = '' }: { title: string; icon: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-zinc-900/60 border border-zinc-800 rounded-xl backdrop-blur-sm ${className}`}>
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-800">
        <span className="text-zinc-500">{icon}</span>
        <h3 className="text-xs font-semibold tracking-wider text-zinc-400 uppercase">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function fmt(n: number, d = 2): string {
  return n.toFixed(d);
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
      <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Dashboard({ snapshot }: { snapshot: MarketSnapshot | null }) {
  const [activeTF, setActiveTF] = useState<Timeframe>('M5');
  const [clock, setClock] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!snapshot) return <div className="text-zinc-500">Initializing engine...</div>;

  const plan = snapshot.plan;
  const structure = snapshot.structure[activeTF];
  const candles = snapshot.candles[activeTF];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur sticky top-0 z-50">
        <div className="px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500 to-yellow-600 flex items-center justify-center">
              <Activity className="w-5 h-5 text-zinc-950" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">XAU/USD Quant Engine</h1>
              <p className="text-[10px] text-zinc-500 tracking-wider uppercase">Multi-Agent Decision System</p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <div className="text-xl font-mono font-bold tabular-nums">{fmt(snapshot.price.median)}</div>
              <div className="text-[10px] text-zinc-500">XAU/USD Median</div>
            </div>
            <div className="text-right">
              <div className="text-sm font-mono text-zinc-400 tabular-nums">{snapshot.price.spread.toFixed(2)}</div>
              <div className="text-[10px] text-zinc-500">Spread</div>
            </div>
            <div className="text-right">
              <div className={`text-sm font-mono ${snapshot.quality.score > 80 ? 'text-emerald-400' : snapshot.quality.score > 60 ? 'text-amber-400' : 'text-rose-400'}`}>{snapshot.quality.score}</div>
              <div className="text-[10px] text-zinc-500">Data Quality</div>
            </div>
            <div className="text-right">
              <div className="text-sm font-mono text-zinc-300 tabular-nums">{clock.toUTCString().slice(17, 25)}</div>
              <div className="text-[10px] text-zinc-500">UTC</div>
            </div>
            <div className={`px-3 py-1.5 rounded-lg border ${statusColor(plan.status)} flex items-center gap-2`}>
              {statusIcon(plan.status)}
              <span className="text-sm font-bold tracking-wide">{plan.status}</span>
            </div>
          </div>
        </div>
      </header>

      <div className="p-6 grid grid-cols-12 gap-4 max-w-[1600px] mx-auto">
        {/* Price Chart */}
        <div className="col-span-12 xl:col-span-8">
          <Panel title="Price Action" icon={<LineChart className="w-4 h-4" />}>
            <div className="flex gap-1 mb-3">
              {(['M1', 'M5', 'M15', 'H1', 'H4', 'D'] as Timeframe[]).map((tf) => (
                <button
                  key={tf}
                  onClick={() => setActiveTF(tf)}
                  className={`px-3 py-1 text-xs font-mono rounded-md transition-colors ${activeTF === tf ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'}`}
                >
                  {tf}
                </button>
              ))}
            </div>
            <PriceChart
              candles={candles}
              fvgs={structure.fvgs}
              swings={structure.swings}
              liquidities={structure.liquidity}
              vwap={snapshot.vwap.session}
            />
            <div className="flex flex-wrap gap-3 mt-3 text-[10px] text-zinc-500">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Bullish FVG</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" /> Bearish FVG</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Swing High</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> Swing Low</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-400" /> VWAP</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500" /> Liquidity</span>
            </div>
          </Panel>
        </div>

        {/* Decision Output */}
        <div className="col-span-12 xl:col-span-4">
          <Panel title="Decision Output" icon={<Crosshair className="w-4 h-4" />}>
            <div className={`p-4 rounded-lg border ${statusColor(plan.status)} mb-4`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-zinc-400 uppercase tracking-wider">Statut</span>
                <span className="text-lg font-bold">{plan.status}</span>
              </div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-zinc-400">Direction</span>
                <span className={`flex items-center gap-1 font-mono font-bold ${dirColor(plan.direction)}`}>{dirIcon(plan.direction)} {dirLabel(plan.direction)}</span>
              </div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-zinc-400">Confiance heuristique</span>
                <span className="font-mono font-bold">{Math.round(plan.confidence * 100)}%</span>
              </div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-zinc-400">Régime</span>
                <span className="text-xs text-zinc-300">{plan.regimeLabel}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-400">Espérance</span>
                <span className={`font-mono font-bold ${plan.ev > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{plan.ev > 0 ? '+' : ''}{plan.ev}R</span>
              </div>
            </div>

            <div className="space-y-2.5">
              <div>
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Zone d'intérêt</div>
                <div className="font-mono text-sm text-amber-400">{fmt(plan.zone[0])} — {fmt(plan.zone[1])}</div>
              </div>
              <div>
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Déclencheur obligatoire</div>
                <div className="text-xs text-zinc-300">{plan.trigger}</div>
              </div>
              <div>
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Entrée envisagée</div>
                <div className="font-mono text-sm text-emerald-400">{fmt(plan.entry[0])} — {fmt(plan.entry[1])}</div>
              </div>
              <div>
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Stop</div>
                <div className="font-mono text-sm text-rose-400">{fmt(plan.stop)}</div>
              </div>
              <div>
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Objectifs</div>
                <div className="flex gap-3 font-mono text-sm">
                  <span className="text-emerald-400">TP1: {fmt(plan.targets[0])} <span className="text-[10px] text-zinc-500">({plan.rR[0]}R)</span></span>
                  <span className="text-emerald-400">TP2: {fmt(plan.targets[1])} <span className="text-[10px] text-zinc-500">({plan.rR[1]}R)</span></span>
                  <span className="text-emerald-400">TP3: {fmt(plan.targets[2])} <span className="text-[10px] text-zinc-500">({plan.rR[2]}R)</span></span>
                </div>
              </div>
              <div>
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Invalidation</div>
                <div className="text-xs text-rose-400">{plan.invalidation}</div>
              </div>
              <div>
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Prochaine news</div>
                <div className="text-xs text-zinc-300">{plan.nextNews}</div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-zinc-800">
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Action immédiate</div>
              <div className="text-sm font-medium text-amber-400">{plan.action}</div>
            </div>
          </Panel>
        </div>

        {/* Agent Fusion */}
        <div className="col-span-12 lg:col-span-6 xl:col-span-4">
          <Panel title="Agent Fusion" icon={<Brain className="w-4 h-4" />}>
            <div className="space-y-3">
              {plan.agents.map((a) => {
                const raw = Math.abs(a.raw * a.weight);
                return (
                  <div key={a.agent}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-zinc-300">{a.agent}</span>
                      <span className={`flex items-center gap-1 text-xs font-mono ${dirColor(a.direction)}`}>
                        {dirIcon(a.direction)} {a.raw > 0 ? '+' : ''}{a.raw.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Bar value={raw} max={0.3} color={a.direction > 0 ? 'bg-emerald-500' : a.direction < 0 ? 'bg-rose-500' : 'bg-zinc-600'} />
                      <span className="text-[10px] text-zinc-500 font-mono w-8 text-right">{(a.weight * 100).toFixed(0)}%</span>
                    </div>
                    <div className="text-[10px] text-zinc-500 mt-0.5">{a.note}</div>
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>

        {/* Scenarios */}
        <div className="col-span-12 lg:col-span-6 xl:col-span-4">
          <Panel title="Scenarios" icon={<Layers className="w-4 h-4" />}>
            <div className="space-y-3">
              {plan.scenarios.map((s, i) => (
                <div key={i} className={`p-3 rounded-lg border ${i === 0 ? 'border-emerald-500/30 bg-emerald-500/5' : i === 1 ? 'border-rose-500/30 bg-rose-500/5' : 'border-zinc-700 bg-zinc-800/30'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-zinc-200">{s.name}</span>
                    <span className={`font-mono text-sm font-bold ${dirColor(s.direction)}`}>{Math.round(s.probability * 100)}%</span>
                  </div>
                  <div className="text-[10px] text-zinc-400 mb-1">{s.trigger}</div>
                  {s.targets.length > 0 && (
                    <div className="flex gap-2 text-[10px] font-mono text-zinc-500">
                      {s.targets.map((t, j) => <span key={j}>TP{j + 1}: {fmt(t)}</span>)}
                    </div>
                  )}
                  <div className="text-[10px] text-zinc-500 mt-1">{s.note}</div>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        {/* Conflicts & Decision Tree */}
        <div className="col-span-12 lg:col-span-6 xl:col-span-4">
          <Panel title="Decision Tree & Conflicts" icon={<Shield className="w-4 h-4" />}>
            {plan.conflicts.length > 0 && (
              <div className="mb-3 space-y-1.5">
                {plan.conflicts.map((c, i) => (
                  <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-rose-500/10 border border-rose-500/20">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-400 mt-0.5 shrink-0" />
                    <span className="text-xs text-rose-300">{c}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-1.5">
              {plan.decisionTree.map((d, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-zinc-300">
                  <span className="text-zinc-600 font-mono shrink-0">{i + 1}.</span>
                  <span>{d}</span>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        {/* Microstructure */}
        <div className="col-span-12 lg:col-span-6 xl:col-span-4">
          <Panel title="Microstructure" icon={<Zap className="w-4 h-4" />}>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <div className="text-[10px] text-zinc-500 uppercase">OFI</div>
                <div className={`font-mono text-sm ${snapshot.microstructure.ofi > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{snapshot.microstructure.ofi.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-[10px] text-zinc-500 uppercase">Delta</div>
                <div className={`font-mono text-sm ${snapshot.microstructure.delta > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{snapshot.microstructure.delta.toFixed(1)}</div>
              </div>
              <div>
                <div className="text-[10px] text-zinc-500 uppercase">CVD</div>
                <div className={`font-mono text-sm ${snapshot.microstructure.cvd > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{snapshot.microstructure.cvd.toFixed(0)}</div>
              </div>
              <div>
                <div className="text-[10px] text-zinc-500 uppercase">Divergence</div>
                <div className={`font-mono text-sm ${snapshot.microstructure.divergence === 'none' ? 'text-zinc-500' : snapshot.microstructure.divergence === 'bullish' ? 'text-emerald-400' : 'text-rose-400'}`}>{snapshot.microstructure.divergence}</div>
              </div>
            </div>
            {snapshot.microstructure.absorption && (
              <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 mb-2">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  <span className="text-xs text-emerald-300">Absorption {snapshot.microstructure.absorption.side}</span>
                  <span className="text-[10px] text-zinc-500 ml-auto">{Math.round(snapshot.microstructure.absorption.confidence * 100)}%</span>
                </div>
                <div className="text-[10px] text-zinc-400">Zone: {fmt(snapshot.microstructure.absorption.zone[0])} — {fmt(snapshot.microstructure.absorption.zone[1])}</div>
              </div>
            )}
            {snapshot.microstructure.sweep && (
              <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 mb-2">
                <div className="flex items-center gap-2">
                  <Zap className="w-3 h-3 text-amber-400" />
                  <span className="text-xs text-amber-300">Sweep {snapshot.microstructure.sweep.side} @ {fmt(snapshot.microstructure.sweep.level)}</span>
                </div>
              </div>
            )}
            {snapshot.microstructure.exhaustion && (
              <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 mb-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-3 h-3 text-rose-400" />
                  <span className="text-xs text-rose-300">Exhaustion {snapshot.microstructure.exhaustion.side} @ {fmt(snapshot.microstructure.exhaustion.level)}</span>
                </div>
              </div>
            )}
            {!snapshot.microstructure.absorption && !snapshot.microstructure.sweep && !snapshot.microstructure.exhaustion && (
              <div className="text-xs text-zinc-500 italic">No significant microstructure events</div>
            )}
          </Panel>
        </div>

        {/* Volume Profile */}
        <div className="col-span-12 lg:col-span-6 xl:col-span-4">
          <Panel title="Volume Profile" icon={<Gauge className="w-4 h-4" />}>
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <div className="p-2 rounded-lg bg-zinc-800/50">
                  <div className="text-[10px] text-zinc-500 uppercase">POC</div>
                  <div className="font-mono text-sm text-amber-400">{fmt(snapshot.volumeProfile.poc)}</div>
                </div>
                <div className="p-2 rounded-lg bg-zinc-800/50">
                  <div className="text-[10px] text-zinc-500 uppercase">VAH</div>
                  <div className="font-mono text-sm text-emerald-400">{fmt(snapshot.volumeProfile.vah)}</div>
                </div>
                <div className="p-2 rounded-lg bg-zinc-800/50">
                  <div className="text-[10px] text-zinc-500 uppercase">VAL</div>
                  <div className="font-mono text-sm text-blue-400">{fmt(snapshot.volumeProfile.val)}</div>
                </div>
              </div>
              <div className="p-2 rounded-lg bg-zinc-800/50">
                <div className="text-[10px] text-zinc-500 uppercase mb-1">Value Area</div>
                <div className="font-mono text-xs text-zinc-300">{fmt(snapshot.volumeProfile.valueArea[0])} — {fmt(snapshot.volumeProfile.valueArea[1])}</div>
              </div>
              <div className="p-2 rounded-lg bg-zinc-800/50">
                <div className="text-[10px] text-zinc-500 uppercase mb-1">Initial Balance</div>
                <div className="font-mono text-xs text-zinc-300">{fmt(snapshot.volumeProfile.initialBalance[0])} — {fmt(snapshot.volumeProfile.initialBalance[1])}</div>
              </div>
              <div>
                <div className="text-[10px] text-zinc-500 uppercase mb-1">HVN Zones</div>
                <div className="flex flex-wrap gap-1">
                  {snapshot.volumeProfile.hvn.slice(0, 5).map((v, i) => (
                    <span key={i} className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-emerald-500/10 text-emerald-400">{fmt(v)}</span>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-zinc-500 uppercase mb-1">LVN Zones</div>
                <div className="flex flex-wrap gap-1">
                  {snapshot.volumeProfile.lvn.slice(0, 5).map((v, i) => (
                    <span key={i} className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-rose-500/10 text-rose-400">{fmt(v)}</span>
                  ))}
                </div>
              </div>
            </div>
          </Panel>
        </div>

        {/* Multi-Timeframe Structure */}
        <div className="col-span-12 lg:col-span-6 xl:col-span-4">
          <Panel title="Multi-Timeframe Structure" icon={<Layers className="w-4 h-4" />}>
            <div className="space-y-2">
              {(['W', 'D', 'H4', 'H1', 'M15', 'M5', 'M1'] as Timeframe[]).map((tf) => {
                const s = snapshot.structure[tf];
                const biasColor = s.bias === 'bullish' ? 'text-emerald-400' : s.bias === 'bearish' ? 'text-rose-400' : s.bias === 'ranging' ? 'text-amber-400' : 'text-zinc-500';
                return (
                  <div key={tf} className="flex items-center justify-between py-1.5 px-2 rounded-lg bg-zinc-800/30">
                    <span className={`text-xs font-mono font-bold ${TF_COLORS[tf]}`}>{tf}</span>
                    <span className={`text-xs ${biasColor}`}>{s.bias}</span>
                    {s.lastEvent && (
                      <span className="text-[10px] text-zinc-500 font-mono">{s.lastEvent.type}</span>
                    )}
                    {s.dealingRange && (
                      <span className={`text-[10px] font-mono ${s.premium ? 'text-rose-400' : s.discount ? 'text-emerald-400' : 'text-zinc-500'}`}>
                        {s.premium ? 'PREMIUM' : s.discount ? 'DISCOUNT' : 'EQUILIB'}
                      </span>
                    )}
                    <span className="text-[10px] text-zinc-600">noise: {s.noise.toFixed(2)}</span>
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>

        {/* VWAP & Correlations */}
        <div className="col-span-12 lg:col-span-6 xl:col-span-4">
          <Panel title="VWAP & Correlations" icon={<Radio className="w-4 h-4" />}>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 rounded-lg bg-zinc-800/50">
                  <div className="text-[10px] text-zinc-500 uppercase">VWAP Daily</div>
                  <div className="font-mono text-sm text-purple-400">{fmt(snapshot.vwap.daily)}</div>
                </div>
                <div className="p-2 rounded-lg bg-zinc-800/50">
                  <div className="text-[10px] text-zinc-500 uppercase">VWAP Weekly</div>
                  <div className="font-mono text-sm text-purple-400">{fmt(snapshot.vwap.weekly)}</div>
                </div>
                <div className="p-2 rounded-lg bg-zinc-800/50">
                  <div className="text-[10px] text-zinc-500 uppercase">VWAP Session</div>
                  <div className="font-mono text-sm text-purple-400">{fmt(snapshot.vwap.session)}</div>
                </div>
                <div className="p-2 rounded-lg bg-zinc-800/50">
                  <div className="text-[10px] text-zinc-500 uppercase">VWAP Anchored</div>
                  <div className="font-mono text-sm text-purple-400">{fmt(snapshot.vwap.anchored)}</div>
                </div>
              </div>
              <div className="pt-2 border-t border-zinc-800 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400">DXY</span>
                  <span className={`font-mono ${snapshot.correlations.dxy === 0 ? 'text-zinc-600' : snapshot.correlations.dxy < -0.5 ? 'text-emerald-400' : 'text-rose-400'}`}>{snapshot.correlations.dxy === 0 ? 'N/A' : snapshot.correlations.dxy.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400">Real Yields 10Y</span>
                  <span className={`font-mono ${snapshot.correlations.realYields10y === 0 ? 'text-zinc-600' : snapshot.correlations.realYields10y < -0.5 ? 'text-emerald-400' : 'text-rose-400'}`}>{snapshot.correlations.realYields10y === 0 ? 'N/A' : snapshot.correlations.realYields10y.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400">Silver</span>
                  <span className="font-mono text-zinc-300">{snapshot.correlations.silver === 0 ? 'N/A' : snapshot.correlations.silver.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400">VIX</span>
                  <span className="font-mono text-zinc-300">{snapshot.correlations.vix === 0 ? 'N/A' : snapshot.correlations.vix.toFixed(2)}</span>
                </div>
                {snapshot.correlations.broken && (
                  <div className="flex items-center gap-1.5 text-[10px] text-amber-400 mt-1">
                    <AlertTriangle className="w-3 h-3" /> {snapshot.correlations.regimeNote}
                  </div>
                )}
                {snapshot.correlations.dxy === 0 && (
                  <div className="flex items-center gap-1.5 text-[10px] text-zinc-600 mt-1">
                    <AlertTriangle className="w-3 h-3" /> {snapshot.correlations.regimeNote}
                  </div>
                )}
              </div>
            </div>
          </Panel>
        </div>

        {/* Options & Volatility */}
        <div className="col-span-12 lg:col-span-6 xl:col-span-4">
          <Panel title="Options & Volatility" icon={<Gauge className="w-4 h-4" />}>
            {snapshot.options.ivATM === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2">
                <AlertTriangle className="w-5 h-5 text-zinc-600" />
                <div className="text-xs text-zinc-500 text-center max-w-[200px]">{snapshot.options.note}</div>
              </div>
            ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 rounded-lg bg-zinc-800/50">
                  <div className="text-[10px] text-zinc-500 uppercase">IV ATM</div>
                  <div className="font-mono text-sm text-zinc-300">{snapshot.options.ivATM.toFixed(2)}%</div>
                </div>
                <div className="p-2 rounded-lg bg-zinc-800/50">
                  <div className="text-[10px] text-zinc-500 uppercase">Skew</div>
                  <div className={`font-mono text-sm ${snapshot.options.skew === 'bullish' ? 'text-emerald-400' : snapshot.options.skew === 'bearish' ? 'text-rose-400' : 'text-zinc-400'}`}>{snapshot.options.skew}</div>
                </div>
                <div className="p-2 rounded-lg bg-zinc-800/50">
                  <div className="text-[10px] text-zinc-500 uppercase">Skew Change 24h</div>
                  <div className={`font-mono text-sm ${snapshot.options.skewChange24h > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{snapshot.options.skewChange24h > 0 ? '+' : ''}{snapshot.options.skewChange24h.toFixed(1)}</div>
                </div>
                <div className="p-2 rounded-lg bg-zinc-800/50">
                  <div className="text-[10px] text-zinc-500 uppercase">Skew Percentile</div>
                  <div className="font-mono text-sm text-zinc-300">{snapshot.options.skewPercentile}%</div>
                </div>
              </div>
              <div className="text-xs text-zinc-400 pt-1">{snapshot.options.note}</div>
              <div className="pt-1">
                <div className="text-[10px] text-zinc-500 uppercase mb-1">Pinning Zones</div>
                <div className="flex flex-wrap gap-1">
                  {snapshot.options.pinning.map((p, i) => <span key={i} className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-amber-500/10 text-amber-400">{fmt(p)}</span>)}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-zinc-500 uppercase mb-1">Option Walls</div>
                <div className="flex flex-wrap gap-1">
                  {snapshot.options.walls.map((w, i) => <span key={i} className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-rose-500/10 text-rose-400">{fmt(w)}</span>)}
                </div>
              </div>
            </div>
            )}
          </Panel>
        </div>

        {/* Macro Calendar */}
        <div className="col-span-12 lg:col-span-6 xl:col-span-4">
          <Panel title="Macro Calendar" icon={<Clock className="w-4 h-4" />}>
            <div className="space-y-2">
              {snapshot.macro.map((e, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 px-2 rounded-lg bg-zinc-800/30">
                  <div className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full ${e.impact === 'high' ? 'bg-rose-500' : e.impact === 'medium' ? 'bg-amber-500' : 'bg-zinc-500'}`} />
                    <span className="text-xs text-zinc-300">{e.name}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-zinc-500">in {e.minutesUntil}min</div>
                    <div className="text-[10px] font-mono text-zinc-400">exp: {e.consensus}</div>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        {/* News Feed */}
        <div className="col-span-12 lg:col-span-6 xl:col-span-4">
          <Panel title="News Feed" icon={<Newspaper className="w-4 h-4" />}>
            <div className="space-y-2">
              {snapshot.news.map((n, i) => (
                <div key={i} className="p-2 rounded-lg bg-zinc-800/30">
                  <div className="flex items-start gap-2">
                    <span className={`px-1.5 py-0.5 text-[9px] font-mono rounded shrink-0 ${n.sourceLevel === 1 ? 'bg-emerald-500/15 text-emerald-400' : n.sourceLevel === 2 ? 'bg-blue-500/15 text-blue-400' : 'bg-zinc-700 text-zinc-400'}`}>L{n.sourceLevel}</span>
                    <span className="text-xs text-zinc-300 flex-1">{n.headline}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 ml-7">
                    <span className="text-[10px] text-zinc-500">{n.source}</span>
                    <span className="text-[10px] text-zinc-500">Novelty: {n.novelty}</span>
                    <span className="text-[10px] text-zinc-500">Impact: {n.marketImpact}</span>
                    <span className={`text-[10px] ${dirColor(n.direction)}`}>{dirLabel(n.direction)}</span>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        {/* Geopolitical */}
        <div className="col-span-12 lg:col-span-6 xl:col-span-4">
          <Panel title="Geopolitical Monitor" icon={<Globe className="w-4 h-4" />}>
            <div className="space-y-2">
              {snapshot.geo.map((g, i) => (
                <div key={i} className="p-2.5 rounded-lg bg-zinc-800/30">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-zinc-200">{g.eventType.replace(/_/g, ' ')}</span>
                    <span className={`px-1.5 py-0.5 text-[10px] font-mono rounded ${g.score > 60 ? 'bg-rose-500/15 text-rose-400' : g.score > 40 ? 'bg-amber-500/15 text-amber-400' : 'bg-zinc-700 text-zinc-400'}`}>{g.score}/100</span>
                  </div>
                  <div className="text-[10px] text-zinc-500 mb-1">{g.location} — {g.source}</div>
                  <div className="grid grid-cols-2 gap-1 text-[10px]">
                    <span className="text-zinc-400">Severity: <span className="text-zinc-300">{(g.severity * 100).toFixed(0)}%</span></span>
                    <span className="text-zinc-400">Escalation: <span className="text-zinc-300">{(g.escalationProbability * 100).toFixed(0)}%</span></span>
                    <span className="text-zinc-400">Gross: <span className={g.grossImpact === 'bullish' ? 'text-emerald-400' : g.grossImpact === 'bearish' ? 'text-rose-400' : 'text-zinc-400'}>{g.grossImpact}</span></span>
                    <span className="text-zinc-400">Net: <span className={g.netImpact === 'bullish' ? 'text-emerald-400' : g.netImpact === 'bearish' ? 'text-rose-400' : 'text-zinc-400'}>{g.netImpact}</span></span>
                  </div>
                </div>
              ))}
              {snapshot.geo.length === 0 && <div className="text-xs text-zinc-500 italic">No significant geopolitical events</div>}
            </div>
          </Panel>
        </div>

        {/* Alerts */}
        <div className="col-span-12 lg:col-span-6 xl:col-span-4">
          <Panel title="Smart Alerts" icon={<AlertTriangle className="w-4 h-4" />}>
            <div className="space-y-2">
              {snapshot.alerts.length === 0 && <div className="text-xs text-zinc-500 italic">No active alerts</div>}
              {snapshot.alerts.map((a) => (
                <div key={a.id} className={`p-2 rounded-lg border ${
                  a.severity === 'critical' ? 'bg-rose-500/10 border-rose-500/20' :
                  a.severity === 'warning' ? 'bg-amber-500/10 border-amber-500/20' :
                  'bg-blue-500/10 border-blue-500/20'
                }`}>
                  <div className="flex items-start gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                      a.severity === 'critical' ? 'bg-rose-500' :
                      a.severity === 'warning' ? 'bg-amber-500' : 'bg-blue-500'
                    }`} />
                    <span className="text-xs text-zinc-300">{a.message}</span>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        {/* Data Quality & Providers */}
        <div className="col-span-12 lg:col-span-6 xl:col-span-4">
          <Panel title="Data Quality & Providers" icon={<Database className="w-4 h-4" />}>
            <div className="space-y-3">
              <div className={`p-3 rounded-lg border ${snapshot.quality.status === 'VALID' ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-rose-500/30 bg-rose-500/5'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-400">Status</span>
                  <span className={`font-mono font-bold ${snapshot.quality.status === 'VALID' ? 'text-emerald-400' : 'text-rose-400'}`}>{snapshot.quality.status}</span>
                </div>
                <div className="text-[10px] text-zinc-500 mt-1">{snapshot.quality.reason}</div>
                <div className="mt-2">
                  <Bar value={snapshot.quality.score} max={100} color={snapshot.quality.score > 80 ? 'bg-emerald-500' : snapshot.quality.score > 60 ? 'bg-amber-500' : 'bg-rose-500'} />
                </div>
              </div>
              <div className="space-y-1.5">
                {snapshot.price.quotes.map((q) => (
                  <div key={q.provider} className="flex items-center justify-between py-1 px-2 rounded bg-zinc-800/30 text-xs">
                    <span className="text-zinc-300">{q.provider}</span>
                    <span className="font-mono text-zinc-400">{q.bid.toFixed(2)} / {q.ask.toFixed(2)}</span>
                    <span className={`font-mono ${q.quality > 85 ? 'text-emerald-400' : q.quality > 70 ? 'text-amber-400' : 'text-rose-400'}`}>{q.quality}</span>
                  </div>
                ))}
              </div>
              <div className="text-[10px] text-zinc-500">
                Max divergence: {snapshot.price.maxDivergence.toFixed(2)} | Tick rate: {snapshot.price.quotes[0]?.tickRate.toFixed(1) || 'N/A'}/s
              </div>
            </div>
          </Panel>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-zinc-800 px-6 py-3 mt-4">
        <div className="text-[10px] text-zinc-600 text-center max-w-[800px] mx-auto">
          XAU/USD Quant Engine — Multi-agent heuristic decision system. Probabilities shown are heuristic estimates from deterministic rules, NOT statistically calibrated forecasts. External data feeds (DXY, real yields, options, news, geopolitical) are not yet connected. Price data is simulated for demonstration. Not financial advice.
        </div>
      </footer>
    </div>
  );
}
