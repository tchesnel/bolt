// Market structure engine: swing detection, BOS/CHOCH/MSS, FVG, Order Blocks,
// premium/discount dealing ranges, liquidity mapping.

import { Candle, SwingPoint, StructureEvent, FVG, OrderBlock, LiquidityPool, DealingRange, Timeframe, StructureState, StructureBias } from './types';
import { atr } from './indicators';

export function detectSwings(candles: Candle[], leftBars = 3, rightBars = 3, minATR = 0.5): SwingPoint[] {
  const swings: SwingPoint[] = [];
  const atrVal = atr(candles, 14) || 1;
  const minAmp = atrVal * minATR;

  for (let i = leftBars; i < candles.length - rightBars; i++) {
    const c = candles[i];
    let isHigh = true, isLow = true;
    for (let j = i - leftBars; j <= i + rightBars; j++) {
      if (j === i) continue;
      if (candles[j].high >= c.high) isHigh = false;
      if (candles[j].low <= c.low) isLow = false;
    }
    if (isHigh && c.high - Math.min(...candles.slice(i - leftBars, i + rightBars + 1).map((x) => x.low)) >= minAmp) {
      const cls = classifySwing(candles, i, atrVal);
      swings.push({ time: c.time, price: c.high, type: 'high', class: cls, strength: 0 });
    }
    if (isLow && Math.max(...candles.slice(i - leftBars, i + rightBars + 1).map((x) => x.high)) - c.low >= minAmp) {
      const cls = classifySwing(candles, i, atrVal);
      swings.push({ time: c.time, price: c.low, type: 'low', class: cls, strength: 0 });
    }
  }

  for (let i = 0; i < swings.length; i++) {
    swings[i].strength = computeSwingStrength(swings, i);
  }

  return swings;
}

function classifySwing(candles: Candle[], idx: number, atrVal: number): SwingPoint['class'] {
  const lookback = Math.min(idx, 50);
  const range = candles.slice(Math.max(0, idx - lookback), idx + 1);
  const hi = Math.max(...range.map((c) => c.high));
  const lo = Math.min(...range.map((c) => c.low));
  const span = (hi - lo) / atrVal;
  if (span > 20) return 'major';
  if (span > 10) return 'external';
  if (span > 5) return 'intermediate';
  if (span > 2) return 'internal';
  return 'micro';
}

function computeSwingStrength(swings: SwingPoint[], idx: number): number {
  let strength = 0;
  for (let i = Math.max(0, idx - 5); i <= Math.min(swings.length - 1, idx + 5); i++) {
    const dist = Math.abs(i - idx);
    const clsWeight = { micro: 1, internal: 2, intermediate: 3, external: 4, major: 5 }[swings[i].class];
    strength += clsWeight / (1 + dist);
  }
  return Math.round(strength * 10) / 10;
}

export function detectStructureEvents(swings: SwingPoint[]): { bias: StructureBias; lastEvent: StructureEvent | null } {
  const highs = swings.filter((s) => s.type === 'high');
  const lows = swings.filter((s) => s.type === 'low');
  if (highs.length < 2 || lows.length < 2) return { bias: 'neutral', lastEvent: null };

  const recentHighs = highs.slice(-4);
  const recentLows = lows.slice(-4);
  const hh = recentHighs[recentHighs.length - 1].price > recentHighs[recentHighs.length - 2].price;
  const hl = recentLows[recentLows.length - 1].price > recentLows[recentLows.length - 2].price;
  const lh = recentHighs[recentHighs.length - 1].price < recentHighs[recentHighs.length - 2].price;
  const ll = recentLows[recentLows.length - 1].price < recentLows[recentLows.length - 2].price;

  let bias: StructureBias = 'neutral';
  let lastEvent: StructureEvent | null = null;

  const lastHigh = recentHighs[recentHighs.length - 1];
  const prevHigh = recentHighs[recentHighs.length - 2];
  const lastLow = recentLows[recentLows.length - 1];
  const prevLow = recentLows[recentLows.length - 2];

  if (hh && hl) {
    bias = 'bullish';
    if (lastHigh.time > prevHigh.time) {
      lastEvent = { type: 'BOS', direction: 'bullish', level: prevHigh.price, time: lastHigh.time, confirmed: true };
    }
  } else if (lh && ll) {
    bias = 'bearish';
    // A bearish BOS is confirmed when the most recent low breaks below the
    // previous low. lastLow is the most recent swing, so its time should be
    // AFTER prevLow's time — the condition was inverted.
    if (lastLow.time > prevLow.time) {
      lastEvent = { type: 'BOS', direction: 'bearish', level: prevLow.price, time: lastLow.time, confirmed: true };
    }
  } else if (lh && hl) {
    bias = 'ranging';
    lastEvent = { type: 'CHOCH', direction: 'bearish', level: prevHigh.price, time: lastHigh.time, confirmed: false };
  } else if (hh && ll) {
    bias = 'ranging';
    lastEvent = { type: 'CHOCH', direction: 'bullish', level: prevLow.price, time: lastLow.time, confirmed: false };
  }

  return { bias, lastEvent };
}

export function detectMSS(candles: Candle[], swings: SwingPoint[], bias: StructureBias): StructureEvent | null {
  if (candles.length < 5 || swings.length < 3) return null;
  const last = candles[candles.length - 1];
  const recentSwings = swings.slice(-6);

  const liquidityHigh = recentSwings.filter((s) => s.type === 'high').slice(-1)[0];
  const liquidityLow = recentSwings.filter((s) => s.type === 'low').slice(-1)[0];

  if (bias === 'bullish' && liquidityLow) {
    const swept = candles.slice(-3).some((c) => c.low < liquidityLow.price);
    const reversed = last.close > liquidityLow.price + 0.5;
    if (swept && reversed) {
      return { type: 'MSS', direction: 'bullish', level: liquidityLow.price, time: last.time, confirmed: true };
    }
  }
  if (bias === 'bearish' && liquidityHigh) {
    const swept = candles.slice(-3).some((c) => c.high > liquidityHigh.price);
    const reversed = last.close < liquidityHigh.price - 0.5;
    if (swept && reversed) {
      return { type: 'MSS', direction: 'bearish', level: liquidityHigh.price, time: last.time, confirmed: true };
    }
  }
  return null;
}

export function detectFVGs(candles: Candle[], timeframe: Timeframe): FVG[] {
  const fvgs: FVG[] = [];
  const atrVal = atr(candles, 14) || 1;

  for (let i = 1; i < candles.length - 1; i++) {
    const c1 = candles[i - 1];
    const c3 = candles[i + 1];

    // Bullish FVG: c1.high < c3.low
    if (c1.high < c3.low) {
      const top = c3.low;
      const bottom = c1.high;
      const size = top - bottom;
      const atrRatio = size / atrVal;
      if (atrRatio > 0.3) {
        // Start counting fills from i+2, not i+1 — candle i+1 is part of
        // the 3-candle formation that CREATES the gap, so it must not count
        // as a fill of its own gap.
        const fills = countFills(candles, i + 2, top, bottom);
        const status = fills === 0 ? 'fresh' : fills >= 1 && fills < 2 ? 'touched' : fills >= 2 ? 'mitigated' : 'invalidated';
        fvgs.push({
          id: `fvg-${timeframe}-${i}`,
          time: candles[i].time,
          top: Math.round(top * 100) / 100,
          bottom: Math.round(bottom * 100) / 100,
          ce: Math.round(((top + bottom) / 2) * 100) / 100,
          direction: 'bullish',
          size: Math.round(size * 100) / 100,
          atrRatio: Math.round(atrRatio * 100) / 100,
          ageBars: candles.length - i - 1,
          fills,
          status,
          timeframe,
          quality: Math.round(Math.min(100, atrRatio * 30 + (fills === 0 ? 40 : 0)) * 10) / 10,
        });
      }
    }

    // Bearish FVG: c1.low > c3.high
    if (c1.low > c3.high) {
      const top = c1.low;
      const bottom = c3.high;
      const size = top - bottom;
      const atrRatio = size / atrVal;
      if (atrRatio > 0.3) {
        const fills = countFills(candles, i + 2, top, bottom);
        const status = fills === 0 ? 'fresh' : fills >= 1 && fills < 2 ? 'touched' : fills >= 2 ? 'mitigated' : 'invalidated';
        fvgs.push({
          id: `fvg-${timeframe}-${i}`,
          time: candles[i].time,
          top: Math.round(top * 100) / 100,
          bottom: Math.round(bottom * 100) / 100,
          ce: Math.round(((top + bottom) / 2) * 100) / 100,
          direction: 'bearish',
          size: Math.round(size * 100) / 100,
          atrRatio: Math.round(atrRatio * 100) / 100,
          ageBars: candles.length - i - 1,
          fills,
          status,
          timeframe,
          quality: Math.round(Math.min(100, atrRatio * 30 + (fills === 0 ? 40 : 0)) * 10) / 10,
        });
      }
    }
  }

  return fvgs.filter((f) => f.status !== 'invalidated').slice(-15);
}

function countFills(candles: Candle[], fromIdx: number, top: number, bottom: number): number {
  let fills = 0;
  for (let i = fromIdx; i < candles.length; i++) {
    if (candles[i].low <= top && candles[i].high >= bottom) fills++;
  }
  return fills;
}

export function detectOrderBlocks(candles: Candle[], timeframe: Timeframe): OrderBlock[] {
  const obs: OrderBlock[] = [];
  const atrVal = atr(candles, 14) || 1;

  for (let i = 2; i < candles.length - 3; i++) {
    const c = candles[i];
    const after = candles.slice(i + 1, i + 6);
    if (after.length < 3) continue;

    // Bullish OB: last bearish candle before upward displacement
    if (c.close < c.open) {
      const displacement = (Math.max(...after.map((x) => x.high)) - c.low) / atrVal;
      if (displacement > 1.5) {
        const mitigated = candles.slice(i + 4).some((x) => x.low <= c.high && x.low >= c.low);
        const score = scoreOB(displacement, true, true, c.volume, mitigated, timeframe);
        obs.push({
          id: `ob-${timeframe}-${i}`,
          time: c.time,
          top: Math.round(c.high * 100) / 100,
          bottom: Math.round(c.low * 100) / 100,
          direction: 'bullish',
          displacement: Math.min(20, Math.round(displacement * 5)),
          structureBreak: 15,
          fvgAssoc: 10,
          volume: Math.min(15, Math.round((c.volume / (atrVal * 100)) * 10)),
          freshness: mitigated ? 3 : 10,
          premiumDiscount: 7,
          confluence: 8,
          score,
          mitigated,
          timeframe,
        });
      }
    }

    // Bearish OB: last bullish candle before downward displacement
    if (c.close > c.open) {
      const displacement = (c.high - Math.min(...after.map((x) => x.low))) / atrVal;
      if (displacement > 1.5) {
        const mitigated = candles.slice(i + 4).some((x) => x.high >= c.low && x.high <= c.high);
        const score = scoreOB(displacement, true, true, c.volume, mitigated, timeframe);
        obs.push({
          id: `ob-${timeframe}-${i}`,
          time: c.time,
          top: Math.round(c.high * 100) / 100,
          bottom: Math.round(c.low * 100) / 100,
          direction: 'bearish',
          displacement: Math.min(20, Math.round(displacement * 5)),
          structureBreak: 15,
          fvgAssoc: 10,
          volume: Math.min(15, Math.round((c.volume / (atrVal * 100)) * 10)),
          freshness: mitigated ? 3 : 10,
          premiumDiscount: 7,
          confluence: 8,
          score,
          mitigated,
          timeframe,
        });
      }
    }
  }

  return obs.filter((o) => !o.mitigated && o.score > 50).slice(-8);
}

function scoreOB(displacement: number, structBreak: boolean, fvg: boolean, volume: number, mitigated: boolean, _tf: Timeframe): number {
  const d = Math.min(20, Math.round(displacement * 5));
  const s = structBreak ? 15 : 5;
  const f = fvg ? 12 : 5;
  const v = Math.min(15, Math.round(volume));
  const fr = mitigated ? 3 : 10;
  return Math.min(100, d + s + f + v + fr + 7 + 8);
}

export function computeDealingRange(candles: Candle[], label: string): DealingRange | null {
  if (candles.length < 5) return null;
  const recent = candles.slice(-30);
  const high = Math.max(...recent.map((c) => c.high));
  const low = Math.min(...recent.map((c) => c.low));
  const equilibrium = (high + low) / 2;
  return {
    high: Math.round(high * 100) / 100,
    low: Math.round(low * 100) / 100,
    equilibrium: Math.round(equilibrium * 100) / 100,
    premium: [Math.round(equilibrium * 100) / 100, Math.round(high * 100) / 100],
    discount: [Math.round(low * 100) / 100, Math.round(equilibrium * 100) / 100],
    label,
  };
}

export function detectLiquidity(candles: Candle[], swings: SwingPoint[], currentPrice: number): LiquidityPool[] {
  const pools: LiquidityPool[] = [];

  // Equal highs / lows
  const highs = swings.filter((s) => s.type === 'high').slice(-10);
  const lows = swings.filter((s) => s.type === 'low').slice(-10);

  const addEqual = (points: SwingPoint[], side: 'above' | 'below') => {
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        if (Math.abs(points[i].price - points[j].price) < 0.8) {
          const level = (points[i].price + points[j].price) / 2;
          pools.push({
            id: `liq-eq-${i}-${j}`,
            level: Math.round(level * 100) / 100,
            type: 'equal_highs',
            side,
            distance: Math.round(Math.abs(currentPrice - level) * 100) / 100,
            targetProb: 0.65,
            reactionProb: 0.7,
            consumed: 0,
            horizon: 'intraday',
            time: points[j].time,
          });
        }
      }
    }
  };
  addEqual(highs, 'above');
  addEqual(lows, 'below');

  // Session highs/lows
  if (candles.length > 0) {
    const dayCandles = candles.slice(-Math.min(candles.length, 1440));
    const dayHigh = Math.max(...dayCandles.map((c) => c.high));
    const dayLow = Math.min(...dayCandles.map((c) => c.low));
    pools.push({
      id: 'liq-dayhigh',
      level: Math.round(dayHigh * 100) / 100,
      type: 'day_high',
      side: 'above',
      distance: Math.round(Math.abs(currentPrice - dayHigh) * 100) / 100,
      targetProb: 0.55,
      reactionProb: 0.65,
      consumed: 0,
      horizon: 'intraday',
      time: dayCandles[dayCandles.length - 1].time,
    });
    pools.push({
      id: 'liq-daylow',
      level: Math.round(dayLow * 100) / 100,
      type: 'day_low',
      side: 'below',
      distance: Math.round(Math.abs(currentPrice - dayLow) * 100) / 100,
      targetProb: 0.55,
      reactionProb: 0.65,
      consumed: 0,
      horizon: 'intraday',
      time: dayCandles[dayCandles.length - 1].time,
    });
  }

  // Round numbers
  const round = Math.round(currentPrice / 10) * 10;
  pools.push({
    id: 'liq-round-up',
    level: round,
    type: 'round_number',
    side: 'above',
    distance: Math.round(Math.abs(currentPrice - round) * 100) / 100,
    targetProb: 0.4,
    reactionProb: 0.5,
    consumed: 0,
    horizon: 'any',
    time: 0,
  });
  pools.push({
    id: 'liq-round-down',
    level: round - 10,
    type: 'round_number',
    side: 'below',
    distance: Math.round(Math.abs(currentPrice - (round - 10)) * 100) / 100,
    targetProb: 0.4,
    reactionProb: 0.5,
    consumed: 0,
    horizon: 'any',
    time: 0,
  });

  return pools.sort((a, b) => a.distance - b.distance).slice(0, 10);
}

export function computeStructure(candles: Candle[], timeframe: Timeframe, currentPrice: number): StructureState {
  const swings = detectSwings(candles);
  const { bias, lastEvent } = detectStructureEvents(swings);
  const mss = detectMSS(candles, swings, bias);
  const fvgs = detectFVGs(candles, timeframe);
  const orderBlocks = detectOrderBlocks(candles, timeframe);
  const dealingRange = computeDealingRange(candles, timeframe);
  const liquidity = detectLiquidity(candles, swings, currentPrice);

  const premium = dealingRange ? currentPrice > dealingRange.equilibrium : false;
  const discount = dealingRange ? currentPrice < dealingRange.equilibrium : false;
  const noise = computeNoise(candles);

  return {
    bias,
    swings: swings.slice(-12),
    lastEvent: mss || lastEvent,
    fvgs,
    orderBlocks,
    dealingRange,
    premium,
    discount,
    liquidity,
    noise,
  };
}

function computeNoise(candles: Candle[]): number {
  if (candles.length < 10) return 0.5;
  const recent = candles.slice(-10);
  let reversals = 0;
  for (let i = 1; i < recent.length; i++) {
    if ((recent[i].close > recent[i].open) !== (recent[i - 1].close > recent[i - 1].open)) reversals++;
  }
  return Math.round((reversals / (recent.length - 1)) * 100) / 100;
}
