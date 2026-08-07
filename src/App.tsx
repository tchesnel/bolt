import { useState, useEffect, useRef } from 'react';
import { MarketSnapshot, Timeframe, Candle } from '@/engine/types';
import { simulateMarket, quotesFromTicks, computePriceState } from '@/engine/market';
import { runPipeline } from '@/engine/pipeline';
import { Dashboard } from '@/components/Dashboard';

const TIMEFRAMES: Timeframe[] = ['M1', 'M5', 'M15', 'H1', 'H4', 'D', 'W'];

export function useLiveEngine() {
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null);
  const simRef = useRef<ReturnType<typeof simulateMarket> | null>(null);
  const tickIdxRef = useRef(0);
  const rngRef = useRef<() => number>(() => Math.random());

  useEffect(() => {
    // Initialize simulation: 3 days of M1 data, 20 ticks/min
    const now = Date.now();
    const sim = simulateMarket({
      startTime: now - 3 * 24 * 60 * 60 * 1000,
      ticksPerMinute: 20,
      durationMinutes: 3 * 24 * 60,
      basePrice: 4025,
      seed: 42,
    });
    simRef.current = sim;
    tickIdxRef.current = sim.ticks.length - 1;

    // Initial snapshot
    const lastTick = sim.ticks[sim.ticks.length - 1];
    const quotes = quotesFromTicks(lastTick.price, lastTick.time, rngRef.current);
    const price = computePriceState(quotes, lastTick.time);
    const snap = runPipeline(sim.candles, price, lastTick.time);
    setSnapshot(snap);

    // Live updates: advance ticks and recompute
    const interval = setInterval(() => {
      const s = simRef.current;
      if (!s) return;

      tickIdxRef.current = Math.min(s.ticks.length - 1, tickIdxRef.current + 1);
      const tick = s.ticks[tickIdxRef.current];

      // Generate fresh quotes from current tick
      const quotes = quotesFromTicks(tick.price, tick.time, rngRef.current);
      const price = computePriceState(quotes, tick.time);

      // Rebuild candles from ticks up to current index
      const candles = {} as Record<Timeframe, Candle[]>;
      const ticksSlice = s.ticks.slice(0, tickIdxRef.current + 1);
      for (const tf of TIMEFRAMES) {
        candles[tf] = aggregateCandles(ticksSlice, tf);
      }

      const snap = runPipeline(candles, price, tick.time);
      setSnapshot(snap);
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  return snapshot;
}

function aggregateCandles(ticks: { time: number; price: number; volume: number; buyVolume: number; sellVolume: number }[], tf: Timeframe): Candle[] {
  const minutes: Record<Timeframe, number> = { M1: 1, M5: 5, M15: 15, H1: 60, H4: 240, D: 1440, W: 10080 };
  const bucketMs = minutes[tf] * 60 * 1000;
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

export default function App() {
  const snapshot = useLiveEngine();
  return <Dashboard snapshot={snapshot} />;
}
