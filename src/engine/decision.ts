// Scenario engine, agent fusion, risk engine, and master decision pipeline.

import { Candle, MarketSnapshot, AgentSignal, Scenario, TradePlan, Regime, AlertItem, StructureState, MicrostructureState, CorrelationState, OptionsState, MacroEvent, NewsItem, GeoEvent, LiquidityPool, Timeframe, Direction, JournalEntry } from './types';
import { atr } from './indicators';
import { StructureState as StructState } from './types';

interface AgentInput {
  regime: Regime;
  structure: Record<Timeframe, StructureState>;
  micro: MicrostructureState;
  correlations: CorrelationState;
  options: OptionsState;
  macro: MacroEvent[];
  news: NewsItem[];
  geo: GeoEvent[];
  price: number;
  candles: Record<Timeframe, Candle[]>;
}

function regimeWeights(regime: Regime): Record<string, number> {
  switch (regime) {
    case 'TREND_UP':
    case 'TREND_DOWN':
      return { structure: 0.3, micro: 0.25, correlations: 0.15, liquidity: 0.1, options: 0.1, macro: 0.05, geo: 0.05 };
    case 'RANGE_BALANCED':
    case 'RANGE_EXPANDING':
      return { structure: 0.2, liquidity: 0.25, volume: 0.2, micro: 0.15, correlations: 0.1, macro: 0.05, geo: 0.05 };
    case 'BREAKOUT':
      return { micro: 0.3, structure: 0.2, volume: 0.2, options: 0.15, correlations: 0.1, macro: 0.05 };
    case 'EVENT_DRIVEN':
    case 'HIGH_VOLATILITY':
      return { macro: 0.3, micro: 0.25, correlations: 0.15, structure: 0.15, options: 0.1, geo: 0.05 };
    case 'MEAN_REVERSION':
      return { volume: 0.25, liquidity: 0.25, structure: 0.2, micro: 0.15, correlations: 0.1, macro: 0.05 };
    case 'RISK_OFF':
      return { geo: 0.3, macro: 0.25, correlations: 0.2, structure: 0.15, micro: 0.1 };
    default:
      return { structure: 0.2, micro: 0.2, correlations: 0.15, liquidity: 0.15, options: 0.1, macro: 0.1, geo: 0.1 };
  }
}

function structureAgent(s: StructureState, price: number): AgentSignal {
  const bias = s.bias;
  const dir: Direction = bias === 'bullish' ? 1 : bias === 'bearish' ? -1 : 0;
  const lastEvent = s.lastEvent;
  const conf = lastEvent?.confirmed ? 0.8 : 0.5;
  const note = lastEvent ? `${lastEvent.type} ${lastEvent.direction} @ ${lastEvent.level}` : `${bias} structure`;
  return {
    agent: 'Structure',
    direction: dir,
    confidence: conf,
    dataQuality: 0.9,
    freshness: 0.95,
    regimeCompat: 0.8,
    weight: 0,
    note,
    raw: 0,
  };
}

function microAgent(m: MicrostructureState): AgentSignal {
  let dir: Direction = 0;
  let conf = 0.4;
  let note = 'Neutral order flow';

  if (m.absorption) {
    dir = m.absorption.side === 'buyer' ? 1 : -1;
    conf = m.absorption.confidence;
    note = `Absorption ${m.absorption.side} @ ${m.absorption.zone[0]}-${m.absorption.zone[1]}`;
  } else if (m.sweep) {
    dir = m.sweep.side === 'buyer' ? 1 : -1;
    conf = 0.72;
    note = `Sweep ${m.sweep.side} @ ${m.sweep.level}`;
  } else if (m.exhaustion) {
    dir = m.exhaustion.side === 'buyer' ? -1 : 1;
    conf = m.exhaustion.confidence;
    note = `Exhaustion ${m.exhaustion.side} @ ${m.exhaustion.level}`;
  } else if (m.divergence !== 'none') {
    dir = m.divergence === 'bullish' ? 1 : -1;
    conf = 0.55;
    note = `CVD divergence ${m.divergence}`;
  } else {
    dir = m.ofi > 0.15 ? 1 : m.ofi < -0.15 ? -1 : 0;
    conf = 0.45;
    note = `OFI ${m.ofi}, CVD ${m.cvdTrend}`;
  }

  return {
    agent: 'Microstructure',
    direction: dir,
    confidence: conf,
    dataQuality: 0.85,
    freshness: 1.0,
    regimeCompat: 0.75,
    weight: 0,
    note,
    raw: 0,
  };
}

function correlationAgent(c: CorrelationState): AgentSignal {
  let dir: Direction = 0;
  let conf = 0.4;
  let note = `DXY ${c.dxy}, RealYields ${c.realYields10y}`;

  // DXY down -> gold up, real yields down -> gold up
  if (c.dxy < -0.6 && c.realYields10y < -0.5) {
    dir = 1;
    conf = 0.65;
    note = 'DXY & real yields both supportive of gold';
  } else if (c.dxy > -0.4 && c.realYields10y > -0.3) {
    dir = -1;
    conf = 0.6;
    note = 'DXY & real yields both headwind for gold';
  }

  if (c.broken) {
    conf *= 0.6;
    note += ' (correlation regime break — reduced weight)';
  }

  return {
    agent: 'Correlations',
    direction: dir,
    confidence: conf,
    dataQuality: 0.8,
    freshness: 0.9,
    regimeCompat: 0.7,
    weight: 0,
    note,
    raw: 0,
  };
}

function optionsAgent(o: OptionsState): AgentSignal {
  let dir: Direction = 0;
  let conf = 0.35;
  let note = o.note;

  if (o.skew === 'bullish') {
    dir = 1;
    conf = 0.45;
  } else if (o.skew === 'bearish') {
    dir = -1;
    conf = 0.45;
  }

  return {
    agent: 'Options',
    direction: dir,
    confidence: conf,
    dataQuality: 0.75,
    freshness: 0.8,
    regimeCompat: 0.65,
    weight: 0,
    note,
    raw: 0,
  };
}

function macroAgent(macro: MacroEvent[], news: NewsItem[]): AgentSignal {
  let dir: Direction = 0;
  let conf = 0.4;
  let note = 'No imminent macro event';

  const nextEvent = macro[0];
  if (nextEvent && nextEvent.minutesUntil < 60) {
    conf = 0.2;
    note = `${nextEvent.name} in ${nextEvent.minutesUntil}min — reduce confidence`;
  } else {
    // Aggregate news direction
    const newsDir = news.slice(0, 3).reduce((s, n) => s + n.direction * (n.marketImpact / 100), 0);
    dir = newsDir > 0.3 ? 1 : newsDir < -0.3 ? -1 : 0;
    conf = 0.5;
    note = `News sentiment ${newsDir > 0 ? 'bullish' : newsDir < 0 ? 'bearish' : 'neutral'} (${Math.round(newsDir * 100) / 100})`;
  }

  return {
    agent: 'Macro',
    direction: dir,
    confidence: conf,
    dataQuality: 0.8,
    freshness: 0.85,
    regimeCompat: 0.7,
    weight: 0,
    note,
    raw: 0,
  };
}

function geoAgent(geo: GeoEvent[]): AgentSignal {
  if (geo.length === 0) {
    return { agent: 'Geopolitical', direction: 0, confidence: 0.3, dataQuality: 0.7, freshness: 0.8, regimeCompat: 0.6, weight: 0, note: 'No significant geopolitical events', raw: 0 };
  }
  const top = geo[0];
  const dir: Direction = top.netImpact === 'bullish' ? 1 : top.netImpact === 'bearish' ? -1 : 0;
  const conf = top.score / 100;
  return {
    agent: 'Geopolitical',
    direction: dir,
    confidence: conf,
    dataQuality: top.credibility / 100,
    freshness: 0.7,
    regimeCompat: 0.6,
    weight: 0,
    note: `${top.eventType} — score ${top.score}, net ${top.netImpact}`,
    raw: 0,
  };
}

function liquidityAgent(structure: StructureState, price: number): AgentSignal {
  const pools = structure.liquidity;
  if (pools.length === 0) {
    return { agent: 'Liquidity', direction: 0, confidence: 0.3, dataQuality: 0.7, freshness: 0.9, regimeCompat: 0.7, weight: 0, note: 'No mapped liquidity', raw: 0 };
  }

  const above = pools.filter((p) => p.side === 'above');
  const below = pools.filter((p) => p.side === 'below');
  const nearestAbove = above[0];
  const nearestBelow = below[0];

  let dir: Direction = 0;
  let conf = 0.4;
  let note = 'Balanced liquidity';

  if (nearestBelow && nearestBelow.distance < (nearestAbove?.distance ?? Infinity)) {
    dir = 1;
    conf = nearestBelow.targetProb;
    note = `Likely targeting ${nearestBelow.type} @ ${nearestBelow.level}`;
  } else if (nearestAbove) {
    dir = -1;
    conf = nearestAbove.targetProb;
    note = `Likely targeting ${nearestAbove.type} @ ${nearestAbove.level}`;
  }

  return {
    agent: 'Liquidity',
    direction: dir,
    confidence: conf,
    dataQuality: 0.8,
    freshness: 0.95,
    regimeCompat: 0.75,
    weight: 0,
    note,
    raw: 0,
  };
}

export function fuseAgents(input: AgentInput): AgentSignal[] {
  const weights = regimeWeights(input.regime);
  const agents = [
    structureAgent(input.structure.H1, input.price),
    microAgent(input.micro),
    correlationAgent(input.correlations),
    optionsAgent(input.options),
    macroAgent(input.macro, input.news),
    geoAgent(input.geo),
    liquidityAgent(input.structure.H1, input.price),
  ];

  for (const a of agents) {
    const w = weights[a.agent.toLowerCase()] ?? 0.1;
    a.weight = w;
    a.raw = Math.round(a.direction * a.confidence * a.dataQuality * a.freshness * a.regimeCompat * 1000) / 1000;
  }

  return agents;
}

export function buildScenarios(input: AgentInput, agents: AgentSignal[]): Scenario[] {
  const price = input.price;
  const atrVal = atr(input.candles.H1, 14) || 5;
  const structure = input.structure.H1;

  const totalSignal = agents.reduce((s, a) => s + a.raw * a.weight, 0);
  const totalWeight = agents.reduce((s, a) => s + a.weight, 0);
  const normalizedSignal = totalWeight > 0 ? totalSignal / totalWeight : 0;

  const bullProb = Math.max(0.05, Math.min(0.9, 0.5 + normalizedSignal * 1.2));
  const bearProb = Math.max(0.05, Math.min(0.9, 0.5 - normalizedSignal * 1.2));
  const neutralProb = Math.max(0.05, 1 - bullProb - bearProb);

  // Normalize to sum 1
  const sum = bullProb + bearProb + neutralProb;
  const p1 = Math.round((bullProb / sum) * 100) / 100;
  const p2 = Math.round((bearProb / sum) * 100) / 100;
  const p3 = Math.max(0, Math.round((1 - p1 - p2) * 100) / 100);

  const triggerLevel = Math.round((price + atrVal * 0.3) * 100) / 100;
  const invLevel = Math.round((price - atrVal * 1.2) * 100) / 100;
  const entryLow = Math.round((price - atrVal * 0.1) * 100) / 100;
  const entryHigh = Math.round((price + atrVal * 0.2) * 100) / 100;

  const tp1 = Math.round((price + atrVal * 1.2) * 100) / 100;
  const tp2 = Math.round((price + atrVal * 2.5) * 100) / 100;
  const tp3 = Math.round((price + atrVal * 4) * 100) / 100;

  const tp1b = Math.round((price - atrVal * 1.2) * 100) / 100;
  const tp2b = Math.round((price - atrVal * 2.5) * 100) / 100;
  const tp3b = Math.round((price - atrVal * 4) * 100) / 100;

  const risk = Math.abs(price - invLevel);

  const main: Scenario = {
    name: 'Scenario principal',
    probability: p1,
    direction: 1,
    trigger: `Clôture M5 au-dessus de ${triggerLevel}`,
    entry: [entryLow, entryHigh],
    invalidation: invLevel,
    targets: [tp1, tp2, tp3],
    rR: [
      Math.round((Math.abs(tp1 - price) / risk) * 10) / 10,
      Math.round((Math.abs(tp2 - price) / risk) * 10) / 10,
      Math.round((Math.abs(tp3 - price) / risk) * 10) / 10,
    ],
    note: 'Continuation haussière après sweep et MSS',
  };

  const alt: Scenario = {
    name: 'Scenario alternatif',
    probability: p2,
    direction: -1,
    trigger: `Rejet sous ${triggerLevel} puis cassure ${invLevel}`,
    entry: [Math.round((price + atrVal * 0.1) * 100) / 100, Math.round((price - atrVal * 0.2) * 100) / 100],
    invalidation: Math.round((price + atrVal * 1.2) * 100) / 100,
    targets: [tp1b, tp2b, tp3b],
    rR: [
      Math.round((Math.abs(price - tp1b) / risk) * 10) / 10,
      Math.round((Math.abs(price - tp2b) / risk) * 10) / 10,
      Math.round((Math.abs(price - tp3b) / risk) * 10) / 10,
    ],
    note: 'Rejet et retournement baissier',
  };

  const neutral: Scenario = {
    name: 'Scenario de neutralité',
    probability: p3,
    direction: 0,
    trigger: `Prix coincé entre ${invLevel} et ${triggerLevel}`,
    entry: [0, 0],
    invalidation: 0,
    targets: [],
    rR: [],
    note: 'Aucun trade — attendre résolution',
  };

  return [main, alt, neutral];
}

export function computeEV(scenarios: Scenario[], stop: number, entry: number): number {
  const main = scenarios[0];
  const alt = scenarios[1];
  if (!main || !alt) return 0;

  const risk = Math.abs(entry - stop);
  if (risk === 0) return 0;

  const pWin = main.probability;
  const pLoss = alt.probability;
  const avgWin = main.rR[0] || 1.5;
  const avgLoss = 1;

  const costs = 0.05; // spread + commission in R
  const ev = pWin * avgWin - pLoss * avgLoss - costs;
  return Math.round(ev * 1000) / 1000;
}

export function detectConflicts(agents: AgentSignal[]): string[] {
  const conflicts: string[] = [];
  const buyAgents = agents.filter((a) => a.direction > 0 && a.confidence > 0.5);
  const sellAgents = agents.filter((a) => a.direction < 0 && a.confidence > 0.5);

  if (buyAgents.length >= 2 && sellAgents.length >= 2) {
    const buyNames = buyAgents.map((a) => a.agent).join(', ');
    const sellNames = sellAgents.map((a) => a.agent).join(', ');
    conflicts.push(`Conflit élevé: ${buyNames} vs ${sellNames}`);
  }

  const structure = agents.find((a) => a.agent === 'Structure');
  const micro = agents.find((a) => a.agent === 'Microstructure');
  if (structure && micro && structure.direction !== 0 && micro.direction !== 0 && structure.direction !== micro.direction) {
    conflicts.push(`Structure ${structure.direction > 0 ? 'bullish' : 'bearish'} contradicte microstructure ${micro.direction > 0 ? 'bullish' : 'bearish'}`);
  }

  const corr = agents.find((a) => a.agent === 'Correlations');
  if (corr && structure && corr.direction !== 0 && structure.direction !== 0 && corr.direction !== structure.direction) {
    conflicts.push(`Corrélations ${corr.direction > 0 ? 'bullish' : 'bearish'} contradicte structure ${structure.direction > 0 ? 'bullish' : 'bearish'}`);
  }

  return conflicts;
}

export function buildDecisionTree(input: AgentInput, agents: AgentSignal[], scenarios: Scenario[]): string[] {
  const tree: string[] = [];
  const s = input.structure;

  if (s.D.bias !== 'neutral') tree.push(`Régime Daily ${s.D.bias}.`);
  if (s.H4.bias !== 'neutral') tree.push(`Structure H4 ${s.H4.bias}.`);
  if (s.H1.bias !== 'neutral') tree.push(`Structure H1 ${s.H1.bias}.`);

  if (s.H1.dealingRange) {
    if (s.H1.discount) tree.push(`Prix en discount du dealing range H1.`);
    if (s.H1.premium) tree.push(`Prix en premium du dealing range H1.`);
  }

  if (s.H1.lastEvent) tree.push(`${s.H1.lastEvent.type} ${s.H1.lastEvent.direction} confirmé sur H1.`);
  if (s.M15.lastEvent) tree.push(`${s.M15.lastEvent.type} ${s.M15.lastEvent.direction} sur M15.`);

  if (input.micro.absorption) tree.push(`Absorption ${input.micro.absorption.side} détectée.`);
  if (input.micro.sweep) tree.push(`Sweep ${input.micro.sweep.side} @ ${input.micro.sweep.level}.`);
  if (input.micro.exhaustion) tree.push(`Exhaustion ${input.micro.exhaustion.side} @ ${input.micro.exhaustion.level}.`);

  if (input.correlations.dxy < -0.6) tree.push(`DXY favorable (${input.correlations.dxy}).`);
  if (input.correlations.realYields10y < -0.5) tree.push(`Taux réels 10ans favorables (${input.correlations.realYields10y}).`);

  const nextNews = input.macro[0];
  if (nextNews) {
    if (nextNews.minutesUntil < 30) tree.push(`News critique imminente: ${nextNews.name} dans ${nextNews.minutesUntil}min.`);
    else tree.push(`Prochaine news: ${nextNews.name} dans ${nextNews.minutesUntil}min.`);
  }

  const ev = scenarios[0]?.probability ? computeEV(scenarios, scenarios[0].invalidation, (scenarios[0].entry[0] + scenarios[0].entry[1]) / 2) : 0;
  if (ev > 0) tree.push(`Espérance mathématique positive: +${ev}R.`);
  else if (ev <= 0) tree.push(`Espérance mathématique insuffisante: ${ev}R.`);

  return tree;
}

export function buildTradePlan(input: AgentInput, agents: AgentSignal[], scenarios: Scenario[], conflicts: string[], ev: number): TradePlan {
  const main = scenarios[0];
  const price = input.price;
  const nextNews = input.macro[0];
  const nextNewsStr = nextNews ? `dans ${nextNews.minutesUntil}min (${nextNews.name})` : 'aucune';

  // Determine status
  let status: TradePlan['status'] = 'WAIT';
  let action = 'Ne pas entrer maintenant — attendre le déclencheur.';

  if (conflicts.length >= 2) {
    status = 'NO_TRADE';
    action = 'Conflit élevé — aucun trade. Attendre résolution.';
  } else if (nextNews && nextNews.minutesUntil < 15) {
    status = 'NO_TRADE';
    action = 'News critique imminente — trading désactivé.';
  } else if (ev <= 0) {
    status = 'NO_TRADE';
    action = 'Espérance non positive — aucun trade.';
  } else if (main.probability > 0.6 && main.direction !== 0) {
    // Check if trigger is met
    const triggerMet = input.micro.sweep || input.micro.absorption;
    if (triggerMet) {
      status = 'EXECUTE';
      action = 'Déclencheur observé — setup validé.';
    } else {
      status = 'READY';
      action = 'Setup à maturité élevée — attendre confirmation du déclencheur.';
    }
  } else if (main.probability > 0.45) {
    status = 'WAIT';
    action = 'Attendre le déclencheur obligatoire avant entrée.';
  } else {
    status = 'NO_TRADE';
    action = 'Probabilité insuffisante — aucun trade justifié.';
  }

  const confidence = Math.round(main.probability * 100) / 100;
  const direction: Direction = main.direction;
  const stop = main.invalidation;
  const entry = main.entry;
  const targets = main.targets;
  const risk = Math.abs((entry[0] + entry[1]) / 2 - stop);
  const rR = targets.map((t) => Math.round(Math.abs(t - (entry[0] + entry[1]) / 2) / risk * 10) / 10);

  const macroStr = input.macro[0]?.minutesUntil < 60
    ? `Légèrement risqué — ${input.macro[0].name} dans ${input.macro[0].minutesUntil}min`
    : 'Légèrement favorable';
  const geoStr = input.geo[0] ? (input.geo[0].netImpact === 'bullish' ? 'Légèrement haussier' : input.geo[0].netImpact === 'bearish' ? 'Légèrement baissier' : 'Neutre') : 'Neutre';
  const orderFlowStr = input.micro.absorption
    ? `Absorption ${input.micro.absorption.side} détectée`
    : input.micro.sweep
    ? `Sweep ${input.micro.sweep.side}`
    : input.micro.exhaustion
    ? `Exhaustion ${input.micro.exhaustion.side}`
    : `OFI ${input.micro.ofi}, CVD ${input.micro.cvdTrend}`;

  const liquidityStr = input.structure.H1.liquidity[0]
    ? `Objectif ${input.structure.H1.liquidity[0].side === 'above' ? 'supérieur' : 'inférieur'} à ${input.structure.H1.liquidity[0].level}`
    : 'Aucune liquidité majeure proximale';

  const invalidation = `Clôture M5 sous ${stop}. Ou hausse brutale des taux réels. Ou news majeure non confirmée.`;

  const decisionTree = buildDecisionTree(input, agents, scenarios);

  return {
    status,
    direction,
    confidence,
    regime: input.regime,
    regimeLabel: '',
    horizon: '45 à 180 minutes',
    zone: entry,
    trigger: main.trigger,
    entry,
    stop,
    targets,
    rR,
    macro: macroStr,
    geopolitical: geoStr,
    orderFlow: orderFlowStr,
    liquidity: liquidityStr,
    invalidation,
    nextNews: nextNewsStr,
    action,
    decisionTree,
    conflicts,
    ev,
    scenarios,
    agents,
    timestamp: Date.now(),
  };
}

export function generateAlerts(plan: TradePlan, input: AgentInput): AlertItem[] {
  const alerts: AlertItem[] = [];
  const now = Date.now();

  if (plan.status === 'EXECUTE') {
    alerts.push({ id: `a-${now}`, time: now, type: 'validated', message: `Trade ${plan.direction > 0 ? 'BUY' : 'SELL'} validé. Entrée ${plan.entry[0]}-${plan.entry[1]}, stop ${plan.stop}.`, severity: 'info' });
  }
  if (plan.status === 'READY') {
    alerts.push({ id: `a-${now}`, time: now, type: 'trigger', message: `Setup ${plan.direction > 0 ? 'BUY' : 'SELL'} à ${Math.round(plan.confidence * 100)}% de maturité. Il manque encore: ${plan.trigger}.`, severity: 'warning' });
  }
  if (plan.conflicts.length > 0) {
    alerts.push({ id: `a-${now + 1}`, time: now, type: 'risk', message: plan.conflicts[0], severity: 'warning' });
  }
  const nextNews = input.macro[0];
  if (nextNews && nextNews.minutesUntil < 30) {
    alerts.push({ id: `a-${now + 2}`, time: now, type: 'news', message: `News critique: ${nextNews.name} dans ${nextNews.minutesUntil}min. Trading désactivé.`, severity: 'critical' });
  }
  if (input.micro.absorption) {
    alerts.push({ id: `a-${now + 3}`, time: now, type: 'context', message: `Absorption ${input.micro.absorption.side} détectée @ ${input.micro.absorption.zone[0]}-${input.micro.absorption.zone[1]} (confiance ${Math.round(input.micro.absorption.confidence * 100)}%).`, severity: 'info' });
  }

  return alerts;
}

export function planToJournal(plan: TradePlan): JournalEntry {
  return {
    id: `j-${plan.timestamp}`,
    time: plan.timestamp,
    direction: plan.direction,
    status: plan.status,
    confidence: plan.confidence,
    regime: plan.regime,
    entry: (plan.entry[0] + plan.entry[1]) / 2,
    stop: plan.stop,
    targets: plan.targets,
    outcome: 'pending',
    reasoning: plan.decisionTree.join(' '),
    conflicts: plan.conflicts,
    ev: plan.ev,
  };
}
