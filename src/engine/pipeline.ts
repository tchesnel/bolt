// Master pipeline: orchestrates all engines into a MarketSnapshot.

import { Candle, MarketSnapshot, Timeframe, PriceState, QualityReport, StructureState, MicrostructureState, VolumeProfile, VWAPSet, CorrelationState, OptionsState, MacroEvent, NewsItem, GeoEvent, LiquidityPool, Scenario, AgentSignal, TradePlan, AlertItem } from './types';
import { computeStructure } from './structure';
import { computeMicrostructure } from './microstructure';
import { computeVolumeProfile, computeVWAPSet } from './indicators';
import { detectRegime, computeCorrelations, computeOptionsState, generateMacroEvents, generateNews, generateGeoEvents } from './context';
import { fuseAgents, buildScenarios, detectConflicts, computeEV, buildTradePlan, generateAlerts } from './decision';
import { atr } from './indicators';

export function runPipeline(
  candles: Record<Timeframe, Candle[]>,
  price: PriceState,
  currentTime: number
): MarketSnapshot {
  const currentPrice = price.median;

  // Quality
  const quality: QualityReport = {
    status: price.stale ? 'STALE' : price.maxDivergence > 0.5 ? 'CONFLICTING' : price.quality < 70 ? 'OUTLIER' : 'VALID',
    score: price.quality,
    reason: price.stale ? 'Flux périmé détecté' : price.maxDivergence > 0.5 ? 'Divergence entre fournisseurs' : 'Tous flux valides',
  };

  // Structure per timeframe
  const tfs: Timeframe[] = ['M1', 'M5', 'M15', 'H1', 'H4', 'D', 'W'];
  const structure: Record<Timeframe, StructureState> = {} as Record<Timeframe, StructureState>;
  for (const tf of tfs) {
    structure[tf] = computeStructure(candles[tf], tf, currentPrice);
  }

  // Microstructure from M1
  const microSwings = structure.M5.swings.map((s) => ({ type: s.type, price: s.price }));
  const microstructure: MicrostructureState = computeMicrostructure(candles.M1, microSwings);

  // Volume profile from session (H1)
  const volumeProfile: VolumeProfile = computeVolumeProfile(candles.H1.slice(-48), 40);

  // VWAP
  const dailyCandles = candles.D.length > 0 ? candles.D.slice(-1) : candles.H1.slice(-24);
  const weeklyCandles = candles.W.length > 0 ? candles.W.slice(-1) : candles.H1.slice(-120);
  const sessionCandles = candles.H1.slice(-8);
  const anchoredCandles = candles.H1.slice(-24);
  const vwap: VWAPSet = computeVWAPSet(dailyCandles, weeklyCandles, sessionCandles, anchoredCandles);

  // Correlations
  const correlations: CorrelationState = computeCorrelations(candles.H1.slice(-50));

  // Options
  const options: OptionsState = computeOptionsState(candles.H1.slice(-50), currentPrice);

  // Macro, news, geo
  const macro: MacroEvent[] = generateMacroEvents(currentTime);
  const news: NewsItem[] = generateNews(currentTime);
  const geo: GeoEvent[] = generateGeoEvents(currentTime);

  // Regime
  const { regime, label } = detectRegime(candles);

  // Agent fusion
  const agents: AgentSignal[] = fuseAgents({
    regime,
    structure,
    micro: microstructure,
    correlations,
    options,
    macro,
    news,
    geo,
    price: currentPrice,
    candles,
  });

  // Scenarios
  const scenarios: Scenario[] = buildScenarios({ regime, structure, micro: microstructure, correlations, options, macro, news, geo, price: currentPrice, candles }, agents);

  // Conflicts
  const conflicts = detectConflicts(agents);

  // EV
  const main = scenarios[0];
  const entryMid = main ? (main.entry[0] + main.entry[1]) / 2 : currentPrice;
  const ev = main ? computeEV(scenarios, main.invalidation, entryMid) : 0;

  // Trade plan
  const plan: TradePlan = buildTradePlan({ regime, structure, micro: microstructure, correlations, options, macro, news, geo, price: currentPrice, candles }, agents, scenarios, conflicts, ev);
  plan.regimeLabel = label;

  // Alerts
  const alerts: AlertItem[] = generateAlerts(plan, { regime, structure, micro: microstructure, correlations, options, macro, news, geo, price: currentPrice, candles });

  return {
    time: currentTime,
    price,
    candles,
    regime,
    regimeLabel: label,
    structure,
    microstructure,
    volumeProfile,
    vwap,
    correlations,
    options,
    macro,
    news,
    geo,
    liquidities: structure.H1.liquidity,
    scenarios,
    agents,
    plan,
    alerts,
    quality,
  };
}
