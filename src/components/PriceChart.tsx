import { Candle, FVG, SwingPoint, LiquidityPool } from '@/engine/types';

interface PriceChartProps {
  candles: Candle[];
  fvgs: FVG[];
  swings: SwingPoint[];
  liquidities: LiquidityPool[];
  vwap?: number;
  height?: number;
}

export function PriceChart({ candles, fvgs, swings, liquidities, vwap, height = 280 }: PriceChartProps) {
  const visible = candles.slice(-60);
  if (visible.length === 0) return <div className="text-zinc-500 text-sm">No data</div>;

  const highs = visible.map((c) => c.high);
  const lows = visible.map((c) => c.low);
  const maxPrice = Math.max(...highs);
  const minPrice = Math.min(...lows);
  const range = maxPrice - minPrice || 1;
  const padding = range * 0.08;
  const chartMax = maxPrice + padding;
  const chartMin = minPrice - padding;
  const chartRange = chartMax - chartMin;

  const width = 720;
  const candleWidth = width / visible.length;
  const bodyWidth = Math.max(2, candleWidth * 0.6);

  const y = (price: number) => ((chartMax - price) / chartRange) * height;
  const x = (i: number) => i * candleWidth + candleWidth / 2;

  const visibleFvgs = fvgs.filter((f) => f.bottom <= chartMax && f.top >= chartMin).slice(-5);
  const visibleSwings = swings.filter((s) => s.price <= chartMax && s.price >= chartMin).slice(-8);
  const visibleLiquidity = liquidities.filter((l) => l.price <= chartMax && l.price >= chartMin).slice(0, 5);

  const lastClose = visible[visible.length - 1].close;
  const prevClose = visible[Math.max(0, visible.length - 2)].close;
  const isUp = lastClose >= prevClose;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }} preserveAspectRatio="none">
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((p) => {
        const yp = p * height;
        const price = chartMax - p * chartRange;
        return (
          <g key={p}>
            <line x1={0} y1={yp} x2={width} y2={yp} stroke="#27272a" strokeWidth={0.5} strokeDasharray="4 4" />
            <text x={4} y={yp + 10} fill="#52525b" fontSize={9} fontFamily="monospace">
              {price.toFixed(2)}
            </text>
          </g>
        );
      })}

      {/* FVG zones */}
      {visibleFvgs.map((fvg) => {
        const yTop = y(fvg.top);
        const yBot = y(fvg.bottom);
        const xStart = x(Math.max(0, visible.length - 30));
        const color = fvg.direction === 'bullish' ? '#10b981' : '#ef4444';
        return (
          <g key={fvg.id}>
            <rect x={xStart} y={yTop} width={width - xStart} height={Math.max(1, yBot - yTop)} fill={color} opacity={0.08} />
            <line x1={xStart} y1={yTop} x2={width} y2={yTop} stroke={color} strokeWidth={0.5} opacity={0.4} strokeDasharray="3 3" />
            <line x1={xStart} y1={yBot} x2={width} y2={yBot} stroke={color} strokeWidth={0.5} opacity={0.4} strokeDasharray="3 3" />
          </g>
        );
      })}

      {/* Liquidity levels */}
      {visibleLiquidity.map((liq) => {
        const yp = y(liq.price);
        const color = liq.side === 'above' ? '#f59e0b' : '#3b82f6';
        return (
          <g key={liq.id}>
            <line x1={0} y1={yp} x2={width} y2={yp} stroke={color} strokeWidth={0.8} opacity={0.5} strokeDasharray="6 3" />
            <text x={width - 70} y={yp - 3} fill={color} fontSize={8} fontFamily="monospace" opacity={0.8}>
              LIQ {liq.price.toFixed(1)}
            </text>
          </g>
        );
      })}

      {/* VWAP line */}
      {vwap && vwap > 0 && (
        <g>
          <line x1={0} y1={y(vwap)} x2={width} y2={y(vwap)} stroke="#a78bfa" strokeWidth={1} opacity={0.7} />
          <text x={width - 55} y={y(vwap) - 3} fill="#a78bfa" fontSize={8} fontFamily="monospace">
            VWAP {vwap.toFixed(2)}
          </text>
        </g>
      )}

      {/* Candles */}
      {visible.map((c, i) => {
        const cx = x(i);
        const yOpen = y(c.open);
        const yClose = y(c.close);
        const yHigh = y(c.high);
        const yLow = y(c.low);
        const bullish = c.close >= c.open;
        const color = bullish ? '#22c55e' : '#ef4444';
        const bodyTop = Math.min(yOpen, yClose);
        const bodyHeight = Math.max(1, Math.abs(yClose - yOpen));
        return (
          <g key={i}>
            <line x1={cx} y1={yHigh} x2={cx} y2={yLow} stroke={color} strokeWidth={0.8} opacity={0.8} />
            <rect
              x={cx - bodyWidth / 2}
              y={bodyTop}
              width={bodyWidth}
              height={bodyHeight}
              fill={color}
              opacity={0.85}
            />
          </g>
        );
      })}

      {/* Swing markers */}
      {visibleSwings.map((s, i) => {
        const idx = visible.findIndex((c) => c.time === s.time);
        if (idx < 0) return null;
        const sx = x(idx);
        const sy = y(s.price);
        const isHigh = s.type === 'high';
        return (
          <g key={`swing-${i}`}>
            <circle cx={sx} cy={sy} r={2.5} fill={isHigh ? '#fbbf24' : '#60a5fa'} opacity={0.9} />
            <text x={sx + 5} y={isHigh ? sy - 4 : sy + 10} fill={isHigh ? '#fbbf24' : '#60a5fa'} fontSize={7} fontFamily="monospace" opacity={0.7}>
              {s.class[0].toUpperCase()}
            </text>
          </g>
        );
      })}

      {/* Current price line */}
      <line x1={0} y1={y(lastClose)} x2={width} y2={y(lastClose)} stroke={isUp ? '#22c55e' : '#ef4444'} strokeWidth={1.2} opacity={0.9} />
      <rect x={width - 62} y={y(lastClose) - 7} width={58} height={14} fill={isUp ? '#22c55e' : '#ef4444'} opacity={0.9} rx={2} />
      <text x={width - 33} y={y(lastClose) + 3} fill="#0a0a0a" fontSize={9} fontFamily="monospace" fontWeight="bold" textAnchor="middle">
        {lastClose.toFixed(2)}
      </text>
    </svg>
  );
}
