// Technical indicators: ATR, ADX, realized volatility, VWAP, volume profile.

import { Candle, VolumeProfile, VolumeNode, VWAPSet, Timeframe } from './types';

export function atr(candles: Candle[], period: number = 14): number {
  if (candles.length < 2) return 0;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - prev.close),
      Math.abs(c.low - prev.close)
    );
    trs.push(tr);
  }
  const slice = trs.slice(-period);
  return slice.reduce((s, v) => s + v, 0) / slice.length;
}

export function adx(candles: Candle[], period: number = 14): number {
  if (candles.length < period + 2) return 0;
  const plusDM: number[] = [];
  const minusDM: number[] = [];
  const trs: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const up = candles[i].high - candles[i - 1].high;
    const down = candles[i - 1].low - candles[i].low;
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    trs.push(tr);
  }

  const smooth = (arr: number[], p: number) => {
    const out: number[] = [];
    let sum = arr.slice(0, p).reduce((s, v) => s + v, 0);
    out.push(sum);
    for (let i = p; i < arr.length; i++) {
      sum = sum - sum / p + arr[i];
      out.push(sum);
    }
    return out;
  };

  const sPlus = smooth(plusDM, period);
  const sMinus = smooth(minusDM, period);
  const sTR = smooth(trs, period);

  const dx: number[] = [];
  for (let i = 0; i < sPlus.length; i++) {
    const pdi = sTR[i] === 0 ? 0 : (100 * sPlus[i]) / sTR[i];
    const mdi = sTR[i] === 0 ? 0 : (100 * sMinus[i]) / sTR[i];
    const sum = pdi + mdi;
    dx.push(sum === 0 ? 0 : (100 * Math.abs(pdi - mdi)) / sum);
  }

  const dxSlice = dx.slice(-period);
  return dxSlice.reduce((s, v) => s + v, 0) / dxSlice.length;
}

export function realizedVol(candles: Candle[], period: number = 20): number {
  if (candles.length < period + 1) return 0;
  const returns: number[] = [];
  const slice = candles.slice(-(period + 1));
  for (let i = 1; i < slice.length; i++) {
    if (slice[i - 1].close !== 0) {
      returns.push(Math.log(slice[i].close / slice[i - 1].close));
    }
  }
  const mean = returns.reduce((s, v) => s + v, 0) / returns.length;
  const variance = returns.reduce((s, v) => s + (v - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance);
}

export function autocorr(candles: Candle[], lag: number = 1, period: number = 50): number {
  if (candles.length < period + lag) return 0;
  const slice = candles.slice(-period).map((c) => c.close);
  const mean = slice.reduce((s, v) => s + v, 0) / slice.length;
  let cov = 0, var0 = 0;
  for (let i = lag; i < slice.length; i++) {
    cov += (slice[i] - mean) * (slice[i - lag] - mean);
  }
  for (let i = 0; i < slice.length; i++) {
    var0 += (slice[i] - mean) ** 2;
  }
  if (var0 === 0) return 0;
  return cov / var0;
}

export function directionalEfficiency(candles: Candle[], period: number = 20): number {
  if (candles.length < period) return 0;
  const slice = candles.slice(-period);
  let netMove = Math.abs(slice[slice.length - 1].close - slice[0].open);
  let totalMove = 0;
  for (const c of slice) totalMove += Math.abs(c.close - c.open);
  return totalMove === 0 ? 0 : netMove / totalMove;
}

export function computeVolumeProfile(candles: Candle[], bins: number = 40): VolumeProfile {
  if (candles.length === 0) {
    return { poc: 0, vah: 0, val: 0, nodes: [], hvn: [], lvn: [], initialBalance: [0, 0], valueArea: [0, 0] };
  }

  let high = -Infinity, low = Infinity;
  for (const c of candles) {
    high = Math.max(high, c.high);
    low = Math.min(low, c.low);
  }
  const range = high - low;
  if (range === 0) {
    return { poc: high, vah: high, val: high, nodes: [], hvn: [], lvn: [], initialBalance: [low, high], valueArea: [low, high] };
  }
  const binSize = range / bins;
  const nodes: VolumeNode[] = [];
  for (let i = 0; i < bins; i++) {
    nodes.push({ price: low + i * binSize + binSize / 2, volume: 0, buyVolume: 0, sellVolume: 0 });
  }

  for (const c of candles) {
    const startIdx = Math.floor((c.low - low) / binSize);
    const endIdx = Math.floor((c.high - low) / binSize);
    const span = Math.max(1, endIdx - startIdx + 1);
    const volPerBin = c.volume / span;
    const buyPerBin = c.buyVolume / span;
    const sellPerBin = c.sellVolume / span;
    for (let i = startIdx; i <= endIdx && i < bins; i++) {
      if (i >= 0) {
        nodes[i].volume += volPerBin;
        nodes[i].buyVolume += buyPerBin;
        nodes[i].sellVolume += sellPerBin;
      }
    }
  }

  let pocIdx = 0;
  for (let i = 1; i < nodes.length; i++) {
    if (nodes[i].volume > nodes[pocIdx].volume) pocIdx = i;
  }

  const totalVol = nodes.reduce((s, n) => s + n.volume, 0);
  const target = totalVol * 0.7;
  let acc = nodes[pocIdx].volume;
  let lo = pocIdx - 1, hi = pocIdx + 1;
  while (acc < target && (lo >= 0 || hi < nodes.length)) {
    const loVol = lo >= 0 ? nodes[lo].volume : -1;
    const hiVol = hi < nodes.length ? nodes[hi].volume : -1;
    if (loVol >= hiVol) {
      acc += loVol;
      lo--;
    } else {
      acc += hiVol;
      hi++;
    }
  }
  const val = nodes[Math.max(0, lo + 1)].price;
  const vah = nodes[Math.min(nodes.length - 1, hi - 1)].price;

  const sorted = [...nodes].sort((a, b) => b.volume - a.volume);
  const hvn = sorted.slice(0, Math.max(1, Math.floor(bins * 0.2))).map((n) => Math.round(n.price * 100) / 100);
  const lvn = sorted.slice(-Math.max(1, Math.floor(bins * 0.2))).map((n) => Math.round(n.price * 100) / 100);

  const firstCandles = candles.slice(0, Math.min(2, candles.length));
  const ibLow = Math.min(...firstCandles.map((c) => c.low));
  const ibHigh = Math.max(...firstCandles.map((c) => c.high));

  return {
    poc: Math.round(nodes[pocIdx].price * 100) / 100,
    vah: Math.round(vah * 100) / 100,
    val: Math.round(val * 100) / 100,
    nodes,
    hvn,
    lvn,
    initialBalance: [Math.round(ibLow * 100) / 100, Math.round(ibHigh * 100) / 100],
    valueArea: [Math.round(val * 100) / 100, Math.round(vah * 100) / 100],
  };
}

export function computeVWAP(candles: Candle[]): number {
  if (candles.length === 0) return 0;
  let pv = 0, vol = 0;
  for (const c of candles) {
    const typical = (c.high + c.low + c.close) / 3;
    pv += typical * c.volume;
    vol += c.volume;
  }
  return vol === 0 ? 0 : Math.round((pv / vol) * 100) / 100;
}

export function computeVWAPBands(candles: Candle[]): { upper: number; lower: number; stdDev: number } {
  if (candles.length < 2) return { upper: 0, lower: 0, stdDev: 0 };
  let pv = 0, vol = 0;
  for (const c of candles) {
    const typical = (c.high + c.low + c.close) / 3;
    pv += typical * c.volume;
    vol += c.volume;
  }
  const vwap = vol === 0 ? 0 : pv / vol;
  let sumSq = 0;
  for (const c of candles) {
    const typical = (c.high + c.low + c.close) / 3;
    sumSq += c.volume * (typical - vwap) ** 2;
  }
  const stdDev = vol > 1 ? Math.sqrt(sumSq / (vol - 1)) : 0;
  return {
    upper: Math.round((vwap + 2 * stdDev) * 100) / 100,
    lower: Math.round((vwap - 2 * stdDev) * 100) / 100,
    stdDev: Math.round(stdDev * 100) / 100,
  };
}

export function computeVWAPSet(daily: Candle[], weekly: Candle[], session: Candle[], anchored: Candle[]): VWAPSet {
  const bands = computeVWAPBands(session.length > 0 ? session : daily);
  return {
    daily: computeVWAP(daily),
    weekly: computeVWAP(weekly),
    session: computeVWAP(session),
    anchored: computeVWAP(anchored),
    bands,
  };
}
