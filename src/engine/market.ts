// Deterministic synthetic XAU/USD market simulation.
// Generates realistic tick data from multiple providers, aggregates into
// candle series across timeframes, and produces regime-aware price action.

import { Candle, PriceState, ProviderQuote, Timeframe, TF_MINUTES } from './types';

const PROVIDERS = ['BrokerA', 'BrokerB', 'BrokerC', 'RefDataX'];

// Seeded PRNG for reproducibility.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SimConfig {
  startTime: number;
  ticksPerMinute: number;
  durationMinutes: number;
  basePrice: number;
  seed: number;
}

interface Tick {
  time: number;
  price: number;
  volume: number;
  buyVolume: number;
  sellVolume: number;
}

export interface SimResult {
  ticks: Tick[];
  candles: Record<Timeframe, Candle[]>;
}

function buildCandles(ticks: Tick[], tf: Timeframe): Candle[] {
  const minutes = TF_MINUTES[tf];
  const bucketMs = minutes * 60 * 1000;
  const map = new Map<number, Candle>();

  for (const t of ticks) {
    const bucket = Math.floor(t.time / bucketMs) * bucketMs;
    let c = map.get(bucket);
    if (!c) {
      c = {
        time: bucket,
        open: t.price,
        high: t.price,
        low: t.price,
        close: t.price,
        volume: 0,
        buyVolume: 0,
        sellVolume: 0,
      };
      map.set(bucket, c);
    }
    c.close = t.price;
    c.high = Math.max(c.high, t.price);
    c.low = Math.min(c.low, t.price);
    c.volume += t.volume;
    c.buyVolume += t.buyVolume;
    c.sellVolume += t.sellVolume;
  }

  return Array.from(map.values()).sort((a, b) => a.time - b.time);
}

export function simulateMarket(config: SimConfig): SimResult {
  const rng = mulberry32(config.seed);
  const ticks: Tick[] = [];
  const tickIntervalMs = 60000 / config.ticksPerMinute;
  const totalTicks = config.ticksPerMinute * config.durationMinutes;

  // Regime schedule: different market phases.
  const regimes = [
    { start: 0, vol: 0.18, drift: 0.0008, label: 'asian_range' },
    { start: 0.28, vol: 0.35, drift: 0.0015, label: 'london_open' },
    { start: 0.42, vol: 0.55, drift: -0.0012, label: 'london_reversal' },
    { start: 0.55, vol: 0.7, drift: 0.0022, label: 'ny_open_trend' },
    { start: 0.72, vol: 0.4, drift: 0.0005, label: 'ny_consolidation' },
    { start: 0.88, vol: 0.25, drift: -0.0003, label: 'late_session' },
  ];

  let price = config.basePrice;
  let momentum = 0;
  const startTimeMs = config.startTime;

  for (let i = 0; i < totalTicks; i++) {
    const progress = i / totalTicks;
    let regime = regimes[0];
    for (const r of regimes) {
      if (progress >= r.start) regime = r;
    }

    // Mean-reverting momentum with regime drift.
    const shock = (rng() - 0.5) * 2 * regime.vol;
    momentum = momentum * 0.82 + shock * 0.35 + regime.drift;
    momentum = Math.max(-1.2, Math.min(1.2, momentum));
    price += momentum;

    // Occasional spikes (sweeps / news reactions).
    if (rng() < 0.004) {
      const spike = (rng() - 0.5) * 4 * regime.vol;
      price += spike;
    }

    const buyBias = momentum > 0 ? 0.55 + Math.abs(momentum) * 0.1 : 0.45 - Math.abs(momentum) * 0.05;
    const vol = Math.max(0.5, 1 + Math.abs(momentum) * 3 + rng() * 2);
    const buy = vol * Math.min(0.85, Math.max(0.15, buyBias + (rng() - 0.5) * 0.2));

    ticks.push({
      time: startTimeMs + i * tickIntervalMs,
      price: Math.round(price * 100) / 100,
      volume: vol,
      buyVolume: buy,
      sellVolume: vol - buy,
    });
  }

  const timeframes: Timeframe[] = ['M1', 'M5', 'M15', 'H1', 'H4', 'D', 'W'];
  const candles = {} as Record<Timeframe, Candle[]>;
  for (const tf of timeframes) {
    candles[tf] = buildCandles(ticks, tf);
  }

  return { ticks, candles };
}

export function quotesFromTicks(tickPrice: number, tickTime: number, rng: () => number): ProviderQuote[] {
  return PROVIDERS.map((p, i) => {
    const offset = (rng() - 0.5) * 0.12 * (1 + i * 0.3);
    const spread = 0.18 + rng() * 0.15 + i * 0.04;
    const last = tickPrice + offset;
    return {
      provider: p,
      bid: Math.round((last - spread / 2) * 100) / 100,
      ask: Math.round((last + spread / 2) * 100) / 100,
      last: Math.round(last * 100) / 100,
      timestamp: tickTime,
      receiveTime: tickTime + Math.floor(rng() * 80),
      tickRate: 8 + rng() * 20 - i * 1.5,
      quality: Math.round(100 - i * 4 - rng() * 6),
    };
  });
}

export function computePriceState(quotes: ProviderQuote[], time: number): PriceState {
  const prices = quotes.map((q) => q.last);
  const sorted = [...prices].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const maxDivergence = Math.max(...prices) - Math.min(...prices);
  const bestBid = Math.max(...quotes.map((q) => q.bid));
  const bestAsk = Math.min(...quotes.map((q) => q.ask));
  const spread = bestAsk - bestBid;
  const avgQuality = quotes.reduce((s, q) => s + q.quality, 0) / quotes.length;
  const stale = quotes.some((q) => time - q.receiveTime > 2000);

  return {
    median: Math.round(median * 100) / 100,
    bestBid: Math.round(bestBid * 100) / 100,
    bestAsk: Math.round(bestAsk * 100) / 100,
    spread: Math.round(spread * 100) / 100,
    maxDivergence: Math.round(maxDivergence * 100) / 100,
    quality: Math.round(avgQuality),
    stale,
    quotes,
    time,
  };
}
