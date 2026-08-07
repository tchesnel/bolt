// Core domain types for the XAU/USD quantitative analysis engine.

export type Timeframe = 'M1' | 'M5' | 'M15' | 'H1' | 'H4' | 'D' | 'W';

export const TF_MINUTES: Record<Timeframe, number> = {
  M1: 1,
  M5: 5,
  M15: 15,
  H1: 60,
  H4: 240,
  D: 1440,
  W: 10080,
};

export interface Candle {
  time: number; // UTC seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  buyVolume: number;
  sellVolume: number;
}

export interface ProviderQuote {
  provider: string;
  bid: number;
  ask: number;
  last: number;
  timestamp: number;
  receiveTime: number;
  tickRate: number;
  quality: number; // 0-100
}

export interface PriceState {
  median: number;
  bestBid: number;
  bestAsk: number;
  spread: number;
  maxDivergence: number;
  quality: number;
  stale: boolean;
  quotes: ProviderQuote[];
  time: number;
}

export type DataStatus =
  | 'VALID'
  | 'STALE'
  | 'MISSING'
  | 'OUTLIER'
  | 'CONFLICTING'
  | 'RECONSTRUCTED'
  | 'UNLICENSED';

export interface QualityReport {
  status: DataStatus;
  score: number; // 0-100
  reason: string;
}

export type Direction = -1 | 0 | 1;

export interface AgentSignal {
  agent: string;
  direction: Direction;
  confidence: number; // 0-1
  dataQuality: number; // 0-1
  freshness: number; // 0-1
  regimeCompat: number; // 0-1
  weight: number; // dynamic weight 0-1
  note: string;
  raw: number; // direction * confidence * quality * freshness * regimeCompat
}

export type Regime =
  | 'TREND_UP'
  | 'TREND_DOWN'
  | 'RANGE_BALANCED'
  | 'RANGE_EXPANDING'
  | 'BREAKOUT'
  | 'FALSE_BREAKOUT'
  | 'EVENT_DRIVEN'
  | 'RISK_OFF'
  | 'LIQUIDITY_VACUUM'
  | 'HIGH_VOLATILITY'
  | 'LOW_VOLATILITY'
  | 'MEAN_REVERSION'
  | 'TRANSITION';

export interface SwingPoint {
  time: number;
  price: number;
  type: 'high' | 'low';
  class: 'micro' | 'internal' | 'intermediate' | 'external' | 'major';
  strength: number;
}

export type StructureBias = 'bullish' | 'bearish' | 'neutral' | 'ranging';

export interface StructureEvent {
  type: 'BOS' | 'CHOCH' | 'MSS';
  direction: 'bullish' | 'bearish';
  level: number;
  time: number;
  confirmed: boolean;
}

export interface FVG {
  id: string;
  time: number;
  top: number;
  bottom: number;
  ce: number; // consequent encroachment 50%
  direction: 'bullish' | 'bearish';
  size: number;
  atrRatio: number;
  ageBars: number;
  fills: number;
  status: 'fresh' | 'touched' | 'mitigated' | 'invalidated';
  timeframe: Timeframe;
  quality: number;
}

export interface OrderBlock {
  id: string;
  time: number;
  top: number;
  bottom: number;
  direction: 'bullish' | 'bearish';
  displacement: number; // 0-20
  structureBreak: number; // 0-20
  fvgAssoc: number; // 0-15
  volume: number; // 0-15
  freshness: number; // 0-10
  premiumDiscount: number; // 0-10
  confluence: number; // 0-10
  score: number; // 0-100
  mitigated: boolean;
  timeframe: Timeframe;
}

export interface LiquidityPool {
  id: string;
  level: number;
  type: string;
  side: 'above' | 'below';
  distance: number;
  targetProb: number;
  reactionProb: number;
  consumed: number; // 0-1
  horizon: string;
  time: number;
}

export interface DealingRange {
  high: number;
  low: number;
  equilibrium: number;
  premium: [number, number];
  discount: [number, number];
  label: string;
}

export interface VolumeNode {
  price: number;
  volume: number;
  buyVolume: number;
  sellVolume: number;
}

export interface VolumeProfile {
  poc: number;
  vah: number;
  val: number;
  nodes: VolumeNode[];
  hvn: number[];
  lvn: number[];
  initialBalance: [number, number];
  valueArea: [number, number];
}

export interface VWAPSet {
  daily: number;
  weekly: number;
  session: number;
  anchored: number;
  bands: { upper: number; lower: number; stdDev: number };
}

export interface AbsorptionEvent {
  side: 'buyer' | 'seller';
  zone: [number, number];
  volume: number;
  duration: number;
  confidence: number;
  structuralValidation: boolean;
  time: number;
}

export interface ExhaustionEvent {
  side: 'buyer' | 'seller';
  level: number;
  volume: number;
  progression: number;
  confidence: number;
  time: number;
}

export interface IcebergEvent {
  side: 'buyer' | 'seller';
  level: number;
  confidence: number;
  contracts: number;
  held: boolean;
  time: number;
}

export interface SweepEvent {
  side: 'buyer' | 'seller';
  level: number;
  speed: number;
  institutional: boolean;
  liquidityGap: boolean;
  time: number;
}

export interface MicrostructureState {
  ofi: number;
  delta: number;
  cvd: number;
  cvdTrend: 'up' | 'down' | 'flat';
  priceTrend: 'up' | 'down' | 'flat';
  divergence: 'none' | 'bullish' | 'bearish';
  absorption: AbsorptionEvent | null;
  exhaustion: ExhaustionEvent | null;
  iceberg: IcebergEvent | null;
  sweep: SweepEvent | null;
}

export interface Scenario {
  name: string;
  probability: number; // 0-1
  direction: Direction;
  trigger: string;
  entry: [number, number];
  invalidation: number;
  targets: number[];
  rR: number[];
  note: string;
}

export interface MacroEvent {
  time: number;
  name: string;
  impact: 'low' | 'medium' | 'high';
  consensus: string;
  actual: string | null;
  currency: string;
  minutesUntil: number;
}

export interface NewsItem {
  time: number;
  headline: string;
  source: string;
  sourceLevel: 1 | 2 | 3;
  novelty: number; // 0-100
  marketImpact: number; // 0-100
  direction: Direction;
  entities: string[];
}

export interface GeoEvent {
  eventType: string;
  actors: string[];
  location: string;
  timestamp: number;
  source: string;
  confirmationLevel: number; // 0-3
  severity: number; // 0-1
  escalationProbability: number;
  safeHavenImpact: number;
  credibility: number;
  grossImpact: 'bullish' | 'bearish' | 'neutral';
  netImpact: 'bullish' | 'bearish' | 'neutral';
  score: number; // 0-100
}

export interface TradePlan {
  status: 'WAIT' | 'READY' | 'EXECUTE' | 'NO_TRADE' | 'MONITOR';
  direction: Direction;
  confidence: number; // calibrated 0-1
  regime: Regime;
  regimeLabel: string;
  horizon: string;
  zone: [number, number];
  trigger: string;
  entry: [number, number];
  stop: number;
  targets: number[];
  rR: number[];
  macro: string;
  geopolitical: string;
  orderFlow: string;
  liquidity: string;
  invalidation: string;
  nextNews: string;
  action: string;
  decisionTree: string[];
  conflicts: string[];
  ev: number;
  scenarios: Scenario[];
  agents: AgentSignal[];
  timestamp: number;
}

export interface AlertItem {
  id: string;
  time: number;
  type: 'context' | 'setup' | 'trigger' | 'validated' | 'invalidated' | 'news' | 'risk' | 'protect' | 'model';
  message: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface JournalEntry {
  id: string;
  time: number;
  direction: Direction;
  status: string;
  confidence: number;
  regime: string;
  entry: number;
  stop: number;
  targets: number[];
  outcome: 'pending' | 'win' | 'loss' | 'void';
  reasoning: string;
  conflicts: string[];
  ev: number;
}

export interface CorrelationState {
  dxy: number;
  realYields10y: number;
  nominal10y: number;
  sp500: number;
  silver: number;
  vix: number;
  regimeNote: string;
  broken: boolean;
}

export interface OptionsState {
  ivATM: number;
  skew: 'bullish' | 'bearish' | 'neutral';
  skewChange24h: number;
  skewPercentile: number;
  pinning: number[];
  walls: number[];
  gamma: number;
  note: string;
}

export interface MarketSnapshot {
  time: number;
  price: PriceState;
  candles: Record<Timeframe, Candle[]>;
  regime: Regime;
  regimeLabel: string;
  structure: Record<Timeframe, StructureState>;
  microstructure: MicrostructureState;
  volumeProfile: VolumeProfile;
  vwap: VWAPSet;
  correlations: CorrelationState;
  options: OptionsState;
  macro: MacroEvent[];
  news: NewsItem[];
  geo: GeoEvent[];
  liquidities: LiquidityPool[];
  scenarios: Scenario[];
  agents: AgentSignal[];
  plan: TradePlan;
  alerts: AlertItem[];
  quality: QualityReport;
}

export interface StructureState {
  bias: StructureBias;
  swings: SwingPoint[];
  lastEvent: StructureEvent | null;
  fvgs: FVG[];
  orderBlocks: OrderBlock[];
  dealingRange: DealingRange | null;
  premium: boolean;
  discount: boolean;
  liquidity: LiquidityPool[];
  noise: number;
}
