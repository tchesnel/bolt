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
  // HONEST DISCLOSURE: real DXY, real yields, S&P 500, VIX and silver data
  // are NOT available in this environment. These values cannot be fetched
  // live without external API keys and licensed market data feeds.
  //
  // The previous implementation derived DXY FROM gold's own price action
  // (trendUp ? -0.72 : -0.65), which is circular: the correlation agent
  // then used that fabricated DXY to "confirm" the gold move. That
  // artificially inflated confidence.
  //
  // Until real external data feeds are connected, this engine reports
  // correlations as UNKNOWN and the correlation agent will produce a
  // neutral, low-confidence signal — it will NOT pretend to have market
  // data it does not have.
  const _ = candles; // unused until real feeds are wired

  return {
    dxy: 0,
    realYields10y: 0,
    nominal10y: 0,
    sp500: 0,
    silver: 0,
    vix: 0,
    regimeNote: 'External data feeds not connected — correlations unavailable',
    broken: false,
  };
}

export function computeOptionsState(candles: Candle[], currentPrice: number): OptionsState {
  // HONEST DISCLOSURE: real options data (IV, skew, gamma, open interest by
  // strike, option walls) requires a licensed options data feed (e.g. CME MDP,
  // OPRA). This environment has no such feed.
  //
  // The previous implementation fabricated skew, gamma, pinning zones and
  // option walls from candle OHLC and round numbers. That is not real
  // options market data — it was a decorative approximation.
  //
  // Until a real options feed is connected, this engine reports options
  // state as unavailable and the options agent will produce a neutral,
  // low-confidence signal.
  const _ = candles;
  const _p = currentPrice;

  return {
    ivATM: 0,
    skew: 'neutral',
    skewChange24h: 0,
    skewPercentile: 0,
    pinning: [],
    walls: [],
    gamma: 0,
    note: 'Options data feed not connected — IV, skew, gamma and OI unavailable',
  };
}

// HONEST DISCLOSURE: these are ILLUSTRATIVE macro events, NOT a live
// economic calendar. A real implementation would fetch from a licensed
// calendar API (e.g. Investing.com, Trading Economics, Bloomberg).
// Until that feed is connected, these entries serve only to demonstrate
// the engine's event-handling logic. They must not be treated as real
// upcoming events.
const MACRO_EVENTS: Omit<MacroEvent, 'minutesUntil'>[] = [
  { time: 0, name: 'CPI (Core) [ILLUSTRATIVE]', impact: 'high', consensus: '+0.3% m/m', actual: null, currency: 'USD' },
  { time: 0, name: 'Jobless Claims [ILLUSTRATIVE]', impact: 'medium', consensus: '221K', actual: null, currency: 'USD' },
  { time: 0, name: 'Fed Chair Speech [ILLUSTRATIVE]', impact: 'high', consensus: '—', actual: null, currency: 'USD' },
  { time: 0, name: 'NFP [ILLUSTRATIVE]', impact: 'high', consensus: '+180K', actual: null, currency: 'USD' },
  { time: 0, name: 'FOMC Minutes [ILLUSTRATIVE]', impact: 'high', consensus: '—', actual: null, currency: 'USD' },
  { time: 0, name: 'PCE Price Index [ILLUSTRATIVE]', impact: 'high', consensus: '+0.2% m/m', actual: null, currency: 'USD' },
  { time: 0, name: 'ISM Manufacturing PMI [ILLUSTRATIVE]', impact: 'medium', consensus: '48.5', actual: null, currency: 'USD' },
  { time: 0, name: 'Retail Sales [ILLUSTRATIVE]', impact: 'medium', consensus: '+0.4% m/m', actual: null, currency: 'USD' },
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

// HONEST DISCLOSURE: these are ILLUSTRATIVE news headlines, NOT live
// news from a licensed wire service. A real implementation would ingest
// from Reuters/Bloomberg/AP feeds or a news API. Until that feed is
// connected, these serve only to demonstrate the engine's news-processing
// logic. They must not be treated as real current events.
const NEWS_TEMPLATES = [
  { headline: '[ILLUSTRATIVE] Fed official says rate cuts could begin "in coming months" if data cooperates', source: 'Reuters (demo)', sourceLevel: 2 as const, dir: 1 as const },
  { headline: '[ILLUSTRATIVE] Middle East tensions escalate after maritime incident reported', source: 'AP (demo)', sourceLevel: 2 as const, dir: 1 as const },
  { headline: '[ILLUSTRATIVE] Treasury yields rise as strong services PMI beats expectations', source: 'Bloomberg (demo)', sourceLevel: 2 as const, dir: -1 as const },
  { headline: '[ILLUSTRATIVE] Central bank gold buying continues for 18th consecutive month', source: 'World Gold Council (demo)', sourceLevel: 1 as const, dir: 1 as const },
  { headline: '[ILLUSTRATIVE] Dollar index firms as risk appetite wanes in European session', source: 'FXStreet (demo)', sourceLevel: 3 as const, dir: -1 as const },
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

// HONEST DISCLOSURE: these are ILLUSTRATIVE geopolitical events, NOT live
// monitoring. A real implementation would ingest from GDELT, UKMTO alerts,
// official government feeds, and verified news wires with source-tier
// classification. Until those feeds are connected, these serve only to
// demonstrate the engine's event-scoring logic. They must not be treated
// as real current geopolitical events.
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
