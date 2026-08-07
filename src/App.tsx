import { useState, useEffect, useRef } from 'react';
import { MarketSnapshot, Timeframe, Candle } from '@/engine/types';
import { simulateMarket, quotesFromTicks, computePriceState } from '@/engine/market';
import { runPipeline } from '@/engine/pipeline';
import { Dashboard } from '@/components/Dashboard';
import { recordSignal } from '@/lib/journal';

const TIMEFRAMES: Timeframe[] = ['M1', 'M5', 'M15', 'H1', 'H4', 'D', 'W'];
const TF_MIN: Record<Timeframe, number> = { M1: 1, M5: 5, M15: 15, H1: 60, H4: 240, D: 1440, W: 10080 };

interface Tick { time: number; price: number; volume: number; buyVolume: number; sellVolume: number; }

function aggregateCandles(ticks: Tick[], tf: Timeframe): Candle[] {
  const bucketMs = TF_MIN[tf] * 60 * 1000;
  const map = new Map<number, Candle>();
  for (const t of ticks) {
    const bucket = Math.floor(t.time / bucketMs) * bucketMs;
    let c = map.get(bucket);
    if (!c) {
      c = { time: bucket, open: t.price, high: t.price, low: t.price, close: t.price, volume: 0, buyVolume: 0, sellVolume: 0 };
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

export function useLiveEngine() {
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null);
  const ticksRef = useRef<Tick[]>([]);
  const momentumRef = useRef(0);
  const stepRef = useRef(0);
  const lastRecordRef = useRef<string>('');
  const lastRecordTimeRef = useRef(0);

  useEffect(() => {
    // Seed with 3 days of historical ticks so all timeframes have data.
    const now = Date.now();
    const sim = simulateMarket({
      startTime: now - 3 * 24 * 60 * 60 * 1000,
      ticksPerMinute: 20,
      durationMinutes: 3 * 24 * 60,
      basePrice: 4025,
      seed: 42,
    });
    ticksRef.current = [...sim.ticks];
    momentumRef.current = 0;
    stepRef.current = 0;

    // Continue the price walk forward from the last simulated tick.
    const lastSimTick = sim.ticks[sim.ticks.length - 1];
    let price = lastSimTick.price;
    const tickIntervalMs = 3000; // 1 tick every 3s in real-time playback

    const compute = () => {
      const ticks = ticksRef.current;
      if (ticks.length === 0) return;
      const lastTick = ticks[ticks.length - 1];
      const quotes = quotesFromTicks(lastTick.price, lastTick.time, Math.random);
      const priceState = computePriceState(quotes, lastTick.time);
      const candles = {} as Record<Timeframe, Candle[]>;
      for (const tf of TIMEFRAMES) candles[tf] = aggregateCandles(ticks, tf);
      const snap = runPipeline(candles, priceState, lastTick.time);
      setSnapshot(snap);

      // Record signal to Supabase journal when status changes or every 60s.
      const statusKey = `${snap.plan.status}-${snap.plan.direction > 0 ? 'BUY' : snap.plan.direction < 0 ? 'SELL' : 'NEUTRAL'}-${Math.round(snap.plan.confidence * 100)}`;
      const nowMs = Date.now();
      const statusChanged = statusKey !== lastRecordRef.current;
      const timeElapsed = nowMs - lastRecordTimeRef.current > 60000;
      if (statusChanged || timeElapsed) {
        lastRecordRef.current = statusKey;
        lastRecordTimeRef.current = nowMs;
        recordSignal(snap);
      }
    };

    // Initial render
    compute();

    const interval = setInterval(() => {
      // Generate a new tick continuing the random walk.
      const last = ticksRef.current[ticksRef.current.length - 1];
      const regimes = [
        { vol: 0.35, drift: 0.0008 },
        { vol: 0.55, drift: -0.0012 },
        { vol: 0.7, drift: 0.0022 },
        { vol: 0.4, drift: 0.0005 },
      ];
      const regime = regimes[stepRef.current % regimes.length];
      const shock = (Math.random() - 0.5) * 2 * regime.vol;
      momentumRef.current = Math.max(-1.2, Math.min(1.2, momentumRef.current * 0.82 + shock * 0.35 + regime.drift));
      price += momentumRef.current;

      if (Math.random() < 0.004) price += (Math.random() - 0.5) * 4 * regime.vol;

      const buyBias = momentumRef.current > 0
        ? 0.55 + Math.abs(momentumRef.current) * 0.1
        : 0.45 - Math.abs(momentumRef.current) * 0.05;
      const vol = Math.max(0.5, 1 + Math.abs(momentumRef.current) * 3 + Math.random() * 2);
      const buy = vol * Math.min(0.85, Math.max(0.15, buyBias + (Math.random() - 0.5) * 0.2));

      ticksRef.current.push({
        time: last.time + tickIntervalMs,
        price: Math.round(price * 100) / 100,
        volume: vol,
        buyVolume: buy,
        sellVolume: vol - buy,
      });

      // Keep memory bounded — drop ticks older than 4 days.
      const cutoff = last.time - 4 * 24 * 60 * 60 * 1000;
      if (ticksRef.current.length > 200000) {
        ticksRef.current = ticksRef.current.filter((t) => t.time > cutoff);
      }

      stepRef.current++;
      compute();
    }, tickIntervalMs);

    return () => clearInterval(interval);
  }, []);

  return snapshot;
}

export default function App() {
  const snapshot = useLiveEngine();
  return <Dashboard snapshot={snapshot} />;
}
