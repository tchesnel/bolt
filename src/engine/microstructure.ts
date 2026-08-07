// Microstructure engine: order flow imbalance, delta/CVD, absorption,
// exhaustion, icebergs, sweeps.

import { Candle, MicrostructureState, AbsorptionEvent, ExhaustionEvent, IcebergEvent, SweepEvent } from './types';
import { atr } from './indicators';

export function computeOFI(candles: Candle[], period: number = 10): number {
  if (candles.length < period) return 0;
  const recent = candles.slice(-period);
  let buyPressure = 0, sellPressure = 0;
  for (const c of recent) {
    const range = c.high - c.low;
    if (range > 0) {
      const buyPortion = (c.close - c.low) / range;
      buyPressure += c.volume * buyPortion;
      sellPressure += c.volume * (1 - buyPortion);
    }
  }
  const total = buyPressure + sellPressure;
  return total === 0 ? 0 : Math.round(((buyPressure - sellPressure) / total) * 100) / 100;
}

export function computeDelta(candle: Candle): number {
  return candle.buyVolume - candle.sellVolume;
}

export function computeCVD(candles: Candle[]): { cvd: number; trend: 'up' | 'down' | 'flat' } {
  let cvd = 0;
  for (const c of candles) cvd += computeDelta(c);
  const recent = candles.slice(-10);
  const cvdRecent = recent.reduce((s, c) => s + computeDelta(c), 0);
  const trend = cvdRecent > 5 ? 'up' : cvdRecent < -5 ? 'down' : 'flat';
  return { cvd: Math.round(cvd * 10) / 10, trend };
}

export function detectAbsorption(candles: Candle[]): AbsorptionEvent | null {
  if (candles.length < 5) return null;
  const recent = candles.slice(-5);
  const atrVal = atr(candles, 14) || 1;

  // Seller absorption: heavy sell volume but price doesn't drop
  const sellHeavy = recent.filter((c) => c.sellVolume > c.buyVolume * 1.3);
  if (sellHeavy.length >= 3) {
    const priceDrop = recent[0].close - recent[recent.length - 1].close;
    if (priceDrop < atrVal * 0.3) {
      const totalSell = sellHeavy.reduce((s, c) => s + c.sellVolume, 0);
      const zone: [number, number] = [
        Math.round(Math.min(...recent.map((c) => c.low)) * 100) / 100,
        Math.round(Math.max(...recent.map((c) => c.high)) * 100) / 100,
      ];
      return {
        side: 'buyer',
        zone,
        volume: Math.round(totalSell),
        duration: 46,
        confidence: Math.min(0.95, 0.5 + (totalSell / 1000)),
        structuralValidation: false,
        time: recent[recent.length - 1].time,
      };
    }
  }

  // Buyer absorption: heavy buy volume but price doesn't rise
  const buyHeavy = recent.filter((c) => c.buyVolume > c.sellVolume * 1.3);
  if (buyHeavy.length >= 3) {
    const priceRise = recent[recent.length - 1].close - recent[0].close;
    if (priceRise < atrVal * 0.3) {
      const totalBuy = buyHeavy.reduce((s, c) => s + c.buyVolume, 0);
      const zone: [number, number] = [
        Math.round(Math.min(...recent.map((c) => c.low)) * 100) / 100,
        Math.round(Math.max(...recent.map((c) => c.high)) * 100) / 100,
      ];
      return {
        side: 'seller',
        zone,
        volume: Math.round(totalBuy),
        duration: 38,
        confidence: Math.min(0.95, 0.5 + (totalBuy / 1000)),
        structuralValidation: false,
        time: recent[recent.length - 1].time,
      };
    }
  }

  return null;
}

export function detectExhaustion(candles: Candle[]): ExhaustionEvent | null {
  if (candles.length < 8) return null;
  const atrVal = atr(candles, 14) || 1;
  const recent = candles.slice(-5);
  const prev = candles.slice(-10, -5);

  const recentVol = recent.reduce((s, c) => s + c.volume, 0) / 5;
  const prevVol = prev.reduce((s, c) => s + c.volume, 0) / 5;
  const recentRange = (Math.max(...recent.map((c) => c.high)) - Math.min(...recent.map((c) => c.low))) / 5;
  const prevRange = (Math.max(...prev.map((c) => c.high)) - Math.min(...prev.map((c) => c.low))) / 5;

  // High volume but low progression = exhaustion
  if (recentVol > prevVol * 1.5 && recentRange < prevRange * 0.6) {
    const direction = recent[recent.length - 1].close > recent[0].open ? 'buyer' : 'seller';
    return {
      side: direction,
      level: Math.round(recent[recent.length - 1].close * 100) / 100,
      volume: Math.round(recentVol),
      progression: Math.round((recentRange / prevRange) * 100) / 100,
      confidence: Math.min(0.9, 0.55 + (recentVol / (prevVol * 3)) * 0.2),
      time: recent[recent.length - 1].time,
    };
  }
  return null;
}

export function detectIceberg(candles: Candle[]): IcebergEvent | null {
  if (candles.length < 10) return null;
  const recent = candles.slice(-10);

  // Look for repeated execution at same level with small displayed quantity
  const levelCounts = new Map<number, { vol: number; count: number }>();
  for (const c of recent) {
    const key = Math.round(c.close);
    const entry = levelCounts.get(key) || { vol: 0, count: 0 };
    entry.vol += c.volume;
    entry.count += 1;
    levelCounts.set(key, entry);
  }

  for (const [level, { vol, count }] of levelCounts) {
    if (count >= 3 && vol > 150) {
      const side = recent[recent.length - 1].close > recent[0].open ? 'buyer' : 'seller';
      return {
        side,
        level,
        confidence: Math.min(0.85, 0.5 + count * 0.08),
        contracts: Math.round(vol),
        held: true,
        time: recent[recent.length - 1].time,
      };
    }
  }
  return null;
}

export function detectSweep(candles: Candle[], swings: { type: 'high' | 'low'; price: number }[]): SweepEvent | null {
  if (candles.length < 3 || swings.length < 2) return null;
  const recent = candles.slice(-3);
  const last = recent[recent.length - 1];
  const atrVal = atr(candles, 14) || 1;

  const recentHighs = swings.filter((s) => s.type === 'high').slice(-3);
  const recentLows = swings.filter((s) => s.type === 'low').slice(-3);

  for (const h of recentHighs) {
    const swept = recent.some((c) => c.high > h.price);
    const reversed = last.close < h.price;
    if (swept && reversed) {
      return {
        side: 'seller',
        level: Math.round(h.price * 100) / 100,
        speed: Math.round((recent[0].high - last.close) / atrVal * 100) / 100,
        institutional: true,
        liquidityGap: false,
        time: last.time,
      };
    }
  }

  for (const l of recentLows) {
    const swept = recent.some((c) => c.low < l.price);
    const reversed = last.close > l.price;
    if (swept && reversed) {
      return {
        side: 'buyer',
        level: Math.round(l.price * 100) / 100,
        speed: Math.round((last.close - recent[0].low) / atrVal * 100) / 100,
        institutional: true,
        liquidityGap: false,
        time: last.time,
      };
    }
  }
  return null;
}

export function computeMicrostructure(candles: Candle[], swings: { type: 'high' | 'low'; price: number }[]): MicrostructureState {
  const ofi = computeOFI(candles);
  const { cvd, trend: cvdTrend } = computeCVD(candles);
  const delta = computeDelta(candles[candles.length - 1]);
  const last = candles[candles.length - 1];
  const priceTrend = last.close > candles[Math.max(0, candles.length - 5)].open ? 'up' : last.close < candles[Math.max(0, candles.length - 5)].open ? 'down' : 'flat';

  let divergence: 'none' | 'bullish' | 'bearish' = 'none';
  if (priceTrend === 'up' && cvdTrend === 'down') divergence = 'bearish';
  if (priceTrend === 'down' && cvdTrend === 'up') divergence = 'bullish';

  return {
    ofi,
    delta: Math.round(delta * 10) / 10,
    cvd,
    cvdTrend,
    priceTrend,
    divergence,
    absorption: detectAbsorption(candles),
    exhaustion: detectExhaustion(candles),
    iceberg: detectIceberg(candles),
    sweep: detectSweep(candles, swings),
  };
}
