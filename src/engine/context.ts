// Regime detection, dynamic correlations, options/volatility, macro context,
// news, and geopolitical engines.

import { Candle, Regime, CorrelationState, OptionsState, MacroEvent, NewsItem, GeoEvent, Timeframe } from './types';
import { adx, atr, realizedVol, autocorr, directionalEfficiency } from './indicators';

export function detectRegime(candles: Record<Timeframe, Candle[]>): { regime: Regime; label: string } {
  const m5 = candles.M5;
  const h1 = candles.H1;
  if (m5.length < 20 || h1.length < 10) return { regime: 'TRANSITION', label: 'Initialization' };

  const adxVal = adx(h1, 14);
  const rv = realizedVol(h1, 20);
  const ac = autocorr(h1, 1, 30);
  const eff = directionalEfficiency(h1, 20);
  const atrVal = atr(h1, 14);
  const recentRange = Math.max(...h1.slice(-10).map((c) => c.high)) - Math.min(...h1.slice(-10).map((c) => c.low));
  const rangeExpansion = atrVal > 0 ? recentRange / (atrVal * 10) : 1;
  const lastClose = h1[h1.length - 1].close;
  const prevClose = h1[Math.max(0, h1.length - 10)].close;
  const trendStrength = (lastClose - prevClose) / (atrVal * 10);

  let regime: Regime;
  let label: string;

  if (rv > 0.015) {
    regime = 'HIGH_VOLATILITY';
    label = 'High volatility';
  } else if (adxVal > 25 && Math.abs(trendStrength) > 0.5) {
    regime = trendStrength > 0 ? 'TREND_UP' : 'TREND_DOWN';
    label = trendStrength > 0 ? 'Bullish trend' : 'Bearish trend';
  } else if (adxVal < 18 && rangeExpansion < 0.8) {
    regime = 'LOW_VOLATILITY';
    label = 'Low volatility';
  } else if (adxVal < 20 && Math.abs(trendStrength) < 0.3) {
    regime = rangeExpansion > 1.2 ? 'RANGE_EXPANDING' : 'RANGE_BALANCED';
    label = rangeExpansion > 1.2 ? 'Expanding range' : 'Balanced range';
  } else if (ac > 0.2 && eff > 0.4) {
    regime = 'MEAN_REVERSION';
    label = 'Mean reversion';
  } else if (Math.abs(trendStrength) > 0.8 && ac < 0) {
    regime = 'BREAKOUT';
    label = 'Breakout';
  } else if (rv > 0.01 && ac < -0.1) {
    regime = 'FALSE_BREAKOUT';
    label = 'False breakout risk';
  } else {
    regime = 'TRANSITION';
    label = 'Transition / mixed';
  }

  return { regime, label };
}

export function computeCorrelations(candles: Candle[]): CorrelationState {
  // Simulated dynamic correlations based on recent price action
  const returns: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    if (candles[i - 1].close !== 0) {
      returns.push((candles[i].close - candles[i - 1].close) / candles[i - 1].close);
    }
  }
  const recent = returns.slice(-20);
  const meanRet = recent.reduce((s, v) => s + v, 0) / Math.max(1, recent.length);
  const trendUp = meanRet > 0.0001;

  // DXY typically inversely correlated with gold
  const dxy = trendUp ? -0.72 : -0.65;
  const realYields10y = trendUp ? -0.68 : -0.55;
  const nominal10y = trendUp ? -0.45 : -0.38;
  const sp500 = Math.abs(meanRet) > 0.0002 ? 0.15 : 0.25;
  const silver = 0.78;
  const vix = trendUp ? -0.25 : 0.15;

  const recentCorr = Math.abs(dxy + 0.72) < 0.1 ? -0.72 : dxy + (Math.random() - 0.5) * 0.2;
  const broken = Math.abs(recentCorr - dxy) > 0.15;

  return {
    dxy: Math.round(dxy * 100) / 100,
    realYields10y: Math.round(realYields10y * 100) / 100,
    nominal10y: Math.round(nominal10y * 100) / 100,
    sp500: Math.round(sp500 * 100) / 100,
    silver: Math.round(silver * 100) / 100,
    vix: Math.round(vix * 100) / 100,
    regimeNote: broken ? 'Correlation regime break detected' : 'Correlations stable',
    broken,
  };
}

export function computeOptionsState(candles: Candle[], currentPrice: number): OptionsState {
  const rv = realizedVol(candles, 20);
  const ivATM = Math.round((rv * 15 + 0.12) * 10000) / 100;

  // Simulated skew
  const recent = candles.slice(-10);
  const bullish = recent[recent.length - 1].close > recent[0].open;
  const skew = bullish ? 'bullish' : 'bearish';
  const skewChange24h = Math.round((bullish ? 2.1 : -1.8) * 10) / 10;
  const skewPercentile = Math.round((bullish ? 68 : 34));

  // Strike-based pinning/walls near round numbers
  const round = Math.round(currentPrice / 5) * 5;
  const pinning = [round - 5, round, round + 5, round + 10];
  const walls = bullish ? [round + 10, round + 15] : [round - 5, round - 10];

  return {
    ivATM,
    skew,
    skewChange24h,
    skewPercentile,
    pinning,
    walls,
    gamma: Math.round((bullish ? 1.2 : -0.8) * 100) / 100,
    note: skew === 'bullish'
      ? 'Call skew elevated — demand for upside protection/capture'
      : 'Put skew elevated — demand for downside protection',
  };
}

const MACRO_EVENTS: Omit<MacroEvent, 'minutesUntil'>[] = [
  { time: 0, name: 'CPI (Core)', impact: 'high', consensus: '+0.3% m/m', actual: null, currency: 'USD' },
  { time: 0, name: 'Jobless Claims', impact: 'medium', consensus: '221K', actual: null, currency: 'USD' },
  { time: 0, name: 'Fed Chair Speech', impact: 'high', consensus: '—', actual: null, currency: 'USD' },
  { time: 0, name: 'NFP', impact: 'high', consensus: '+180K', actual: null, currency: 'USD' },
  { time: 0, name: 'FOMC Minutes', impact: 'high', consensus: '—', actual: null, currency: 'USD' },
  { time: 0, name: 'PCE Price Index', impact: 'high', consensus: '+0.2% m/m', actual: null, currency: 'USD' },
  { time: 0, name: 'ISM Manufacturing PMI', impact: 'medium', consensus: '48.5', actual: null, currency: 'USD' },
  { time: 0, name: 'Retail Sales', impact: 'medium', consensus: '+0.4% m/m', actual: null, currency: 'USD' },
];

export function generateMacroEvents(currentTime: number): MacroEvent[] {
  const events: MacroEvent[] = [];
  const offsets = [72, 195, 432, 1020, 1440]; // minutes from now
  for (let i = 0; i < Math.min(5, MACRO_EVENTS.length); i++) {
    const base = MACRO_EVENTS[i];
    events.push({
      ...base,
      time: currentTime + offsets[i] * 60 * 1000,
      minutesUntil: offsets[i],
    });
  }
  return events.sort((a, b) => a.minutesUntil - b.minutesUntil);
}

const NEWS_TEMPLATES = [
  { headline: 'Fed official says rate cuts could begin "in coming months" if data cooperates', source: 'Reuters', sourceLevel: 2 as const, dir: 1 as const },
  { headline: 'Middle East tensions escalate after maritime incident reported', source: 'AP', sourceLevel: 2 as const, dir: 1 as const },
  { headline: 'Treasury yields rise as strong services PMI beats expectations', source: 'Bloomberg', sourceLevel: 2 as const, dir: -1 as const },
  { headline: 'Central bank gold buying continues for 18th consecutive month', source: 'World Gold Council', sourceLevel: 1 as const, dir: 1 as const },
  { headline: 'Dollar index firms as risk appetite wanes in European session', source: 'FXStreet', sourceLevel: 3 as const, dir: -1 as const },
];

export function generateNews(currentTime: number, count: number = 4): NewsItem[] {
  const items: NewsItem[] = [];
  for (let i = 0; i < count; i++) {
    const t = NEWS_TEMPLATES[i % NEWS_TEMPLATES.length];
    items.push({
      time: currentTime - i * 1800000,
      headline: t.headline,
      source: t.source,
      sourceLevel: t.sourceLevel,
      novelty: Math.round(Math.max(10, 95 - i * 22)),
      marketImpact: Math.round(Math.max(15, 80 - i * 15)),
      direction: t.dir,
      entities: ['XAU/USD', 'Fed'],
    });
  }
  return items;
}

const GEO_TEMPLATES: Omit<GeoEvent, 'score'>[] = [
  {
    eventType: 'maritime_attack',
    actors: ['Unknown group', 'Commercial vessel'],
    location: 'Gulf of Oman',
    timestamp: 0,
    source: 'UKMTO',
    confirmationLevel: 2,
    severity: 0.72,
    escalationProbability: 0.58,
    safeHavenImpact: 0.65,
    credibility: 75,
    grossImpact: 'bullish',
    netImpact: 'bullish',
  },
  {
    eventType: 'trade_negotiation',
    actors: ['US', 'China'],
    location: 'Geneva',
    timestamp: 0,
    source: 'White House statement',
    confirmationLevel: 3,
    severity: 0.3,
    escalationProbability: 0.2,
    safeHavenImpact: 0.25,
    credibility: 90,
    grossImpact: 'bearish',
    netImpact: 'neutral',
  },
];

export function generateGeoEvents(currentTime: number): GeoEvent[] {
  return GEO_TEMPLATES.map((t) => {
    const score = Math.round(
      (t.credibility / 100 * 20) +
      (t.severity * 20) +
      (t.confirmationLevel / 3 * 15) +
      (t.escalationProbability * 15) +
      (t.safeHavenImpact * 15) +
      10
    );
    return { ...t, timestamp: currentTime - 3600000, score };
  });
}
