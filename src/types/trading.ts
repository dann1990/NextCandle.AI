export type VoteType = 'COMPRA' | 'VENDA' | 'AGUARDAR';

export type MarketEnvironment = 'MERCADO_ABERTO' | 'MERCADO_OTC';

export type AllowedMultiTimeframe = 'H1' | 'M15' | 'M5';

export type EntryExecutionTimeframe = 'M1' | 'M5';

export interface TimeframeImageItem {
  timeframe: AllowedMultiTimeframe;
  imageBase64: string;
}

export type AgentId = 
  | 'price_action' 
  | 'indicators' 
  | 'flow_volatility' 
  | 'predictive_ml' 
  | 'confluence_risk';

export interface AgentSignal {
  label: string;
  value: string;
  sentiment: 'bullish' | 'bearish' | 'neutral';
}

export interface AgentResult {
  id: AgentId;
  name: string;
  role: string;
  vote: VoteType;
  confidence: number; // 0 - 100
  rationale: string;
  signals: AgentSignal[];
}

export interface ConsensusVerdict {
  verdict: VoteType;
  consensusRatio: number; // e.g. 0.8 (80%)
  agreementCount: number; // e.g. 4
  totalAgents: number; // 5
  buyVotes: number;
  sellVotes: number;
  neutralVotes: number;
  overallConfidence: number; // 0 - 100
  hasConsensus: boolean; // >= 80% agreement
  confluenceScore: number; // 0 - 100
  recommendedAction: string;
  keyFactors: string[];
}

export interface TradingPlan {
  asset: string;
  timeframe: string;
  entryZone: string;
  takeProfit1: string;
  takeProfit2: string;
  stopLoss: string;
  riskRewardRatio: string;
  suggestedExpiration: string; // e.g. "3 a 5 velas (15m - 25m)"
  riskLevel: 'Baixo' | 'Moderado' | 'Alto' | 'Extremo';
  direction: VoteType;
}

export interface CandleData {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  isProjected?: boolean;
}

export interface SupportResistanceLevel {
  price: number;
  type: 'support' | 'resistance';
  strength: 'fraco' | 'moderado' | 'forte';
  label: string;
}

export interface RadarMetrics {
  priceAction: number;
  technicals: number;
  flowVolatility: number;
  predictiveML: number;
  riskManagement: number;
}

export interface KeyAnalysisInsights {
  trend: string;               // 1- Tendência (ex: "Alta Forte - Estrutura de Topos/Fundos Ascendentes")
  trendDirection: 'alta' | 'baixa' | 'lateral';
  keyPattern: string;          // 2- Padrão chave (ex: "Engolfo de Alta em Suporte com Pullback")
  patternType: string;         // ex: "Reversão Confirmada" | "Continuação de Fluxo"
  quality: string;             // 3- Qualidade (ex: "A+ (Excelente Confluência 5/5 - 94%)")
  qualityGrade: 'A+' | 'A' | 'B' | 'C';
  qualityScore: number;        // 0 - 100
  idealExpiration: string;     // 4- Expiração ideal dinâmica (baseada em volatilidade, timeframe e padrão)
  expirationRationale?: string;
  entryTiming: string;         // 5- Horário / Momento de Entrada recomendado
  entryTrigger?: string;       // ex: "Abertura Próxima Vela" | "Entrada Imediata" | "Aguardar Confirmação"
  entryTimingRationale?: string;
  sessionLiquidity?: string;   // ex: "Alta · Sobreposição Londres / NY" ou "Mercado OTC · Algorítmico 24/7"
  sessionAdvisory?: string;    // Conselho operacional de liquidez ou critério OTC
  marketEnvironment?: MarketEnvironment;
  timezone?: string;           // IANA timezone identifier active for this analysis
  timezoneLabel?: string;      // Human-readable offset/city label (e.g. "UTC-3 · Brasília")
}

export interface VisualQualityCheck {
  isReadable: boolean;
  hasPriceAxis: boolean;
  hasTimeAxis: boolean;
  visibleCandlesCount: number;
  issues: string[];
  blocked: boolean;
  summary: string;
}

export interface MultiTimeframeCheck {
  macroAttached: boolean;
  macroTimeframe?: string;
  macroTrend: 'alta' | 'baixa' | 'lateral' | 'indefinida';
  aligned: boolean;
  blocked: boolean;
  timeframesAnalyzed?: Array<{
    timeframe: AllowedMultiTimeframe;
    trend: 'alta' | 'baixa' | 'lateral' | 'indefinida';
  }>;
  rejectedTimeframes?: string[];
  summary: string;
}

export interface SqueezeZoneCheck {
  nearestObstructionType: 'support' | 'resistance' | 'none';
  obstructionPrice?: string;
  freeClearanceRR: number;
  isSqueezed: boolean;
  blocked: boolean;
  summary: string;
}

export interface EconomicNewsEvent {
  title: string;
  currency: string;
  impact: 'High' | 'Medium' | 'Low';
  timeUtc: string;
  timestampMs: number;
  minutesDelta: number;
  source: string;
}

export interface EconomicCalendarCheck {
  marketEnvironment: MarketEnvironment;
  exempt: boolean;
  blocked: boolean;
  windowMinutes: number;
  affectedCurrencies: string[];
  matchingEvents: EconomicNewsEvent[];
  upcomingEvents?: EconomicNewsEvent[];
  sources?: Array<{ title: string; uri: string }>;
  summary: string;
}

export interface GuardrailsReport {
  allPassed: boolean;
  vetoReasons: string[];
  visualQuality: VisualQualityCheck;
  multiTimeframe: MultiTimeframeCheck;
  squeezeZone: SqueezeZoneCheck;
  economicCalendar: EconomicCalendarCheck;
}

export interface AgentCalibrationDirective {
  id: AgentId;
  openMarketFocus: string;
  otcFocus: string;
  prioritizedIndicators: string[];
  weight: number;
}

export interface AgentCalibrationProfile {
  version: string;
  updatedAt: number;
  updatedBy: 'ai_adaptive' | 'telemetry_adaptive' | 'baseline';
  marketRegimeSummary: string;
  openMarketIndicators: string[];
  otcIndicators: string[];
  agents: AgentCalibrationDirective[];
  groundedSources?: Array<{ title: string; uri: string }>;
  notice?: string;
}

export interface BankrollSettings {
  bankrollAmount: number;
  riskPercent: 1 | 1.5 | 2;
}

export interface AssetTimeframeStats {
  key: string;
  asset: string;
  timeframe: string;
  marketEnvironment: MarketEnvironment;
  wins: number;
  losses: number;
  totalDecided: number;
  winRate: number;
}

export interface DailyBankrollProtection {
  bankrollAmount: number;
  riskPercent: number;
  suggestedStake: number;
  conservativeStake: number;
  maxStake: number;
  todayWins: number;
  todayLosses: number;
  todayConsecutiveLosses: number;
  protectionLevel: 'normal' | 'warning' | 'stop_daily';
  alertTitle: string;
  alertMessage: string;
}

export interface VisualAnalyzedZone {
  x: number; // 0 - 1000 normalized left
  y: number; // 0 - 1000 normalized top
  width: number; // 0 - 1000 normalized width
  height: number; // 0 - 1000 normalized height
  label: string;
}

export interface VisualTriggerPoint {
  x: number; // 0 - 1000 normalized x
  y: number; // 0 - 1000 normalized y
  label: string;
  timingLabel: string;
}

export interface VisualTrendArrow {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  label: string;
}

export interface VisualKeyLevel {
  y: number; // 0 - 1000 normalized vertical level
  type: 'support' | 'resistance' | 'target';
  label: string;
}

export interface VisualDecisionStep {
  step: 1 | 2 | 3;
  title: string;
  detail: string;
}

export interface VisualAnnotations {
  analyzedZone: VisualAnalyzedZone;
  triggerPoint: VisualTriggerPoint;
  trendArrow: VisualTrendArrow;
  keyLevels: VisualKeyLevel[];
  strategyTitle: string;
  technicalReason: string;
  steps: VisualDecisionStep[];
}

export interface AnalysisResult {
  id: string;
  timestamp: number;
  timezone?: string;
  imagePreview?: string;
  macroImagePreview?: string;
  timeframeImages?: Array<{ timeframe: AllowedMultiTimeframe; imagePreview?: string }>;
  mode: 'simple' | 'pro';
  asset: string;
  timeframe: string;
  entryTimeframe?: EntryExecutionTimeframe;
  additionalContext?: string;
  analysisSource?: 'ai_vision' | 'heuristic_fallback';
  marketEnvironment?: MarketEnvironment;
  marketCriteriaSummary?: string;
  calibrationVersion?: string;
  guardrails?: GuardrailsReport;
  verdict: ConsensusVerdict;
  insights?: KeyAnalysisInsights;
  agents: AgentResult[];
  plan: TradingPlan;
  radarMetrics: RadarMetrics;
  candles: CandleData[];
  levels: SupportResistanceLevel[];
  visualAnnotations?: VisualAnnotations;
  outcome?: 'win' | 'loss' | 'pending';
}

