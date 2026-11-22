import { AnalysisResult, CandleData } from '../types/trading';

// Helper to generate a realistic financial candlestick SVG as a Data URI
function createCandlestickSvgDataUri(
  title: string,
  candles: CandleData[],
  trend: 'up' | 'down' | 'neutral',
  indicatorType: string
): string {
  const width = 800;
  const height = 450;
  const padding = 40;

  const minPrice = Math.min(...candles.map(c => c.low));
  const maxPrice = Math.max(...candles.map(c => c.high));
  const priceRange = maxPrice - minPrice || 1;

  const getY = (price: number) => {
    return height - padding - ((price - minPrice) / priceRange) * (height - padding * 2);
  };

  const candleWidth = (width - padding * 2) / candles.length;

  let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="background-color: #0b0f19; font-family: monospace;">`;
  
  // Grid lines
  for (let i = 0; i <= 5; i++) {
    const y = padding + (i * (height - padding * 2)) / 5;
    const priceVal = (maxPrice - (i * priceRange) / 5).toFixed(4);
    svgContent += `<line x1="${padding}" y1="${y}" x2="${width - padding}" y2="${y}" stroke="#1e293b" stroke-dasharray="3,3" stroke-width="1"/>`;
    svgContent += `<text x="${width - padding + 5}" y="${y + 4}" fill="#64748b" font-size="10">${priceVal}</text>`;
  }

  // Header info
  svgContent += `<text x="${padding}" y="24" fill="#f8fafc" font-size="14" font-weight="bold">${title} [${indicatorType}]</text>`;
  svgContent += `<text x="${width - padding}" y="24" text-anchor="end" fill="#94a3b8" font-size="11">NextCandle.AI Vision Feed · Realtime Simulator</text>`;

  // Draw EMA line (20 periods approx)
  let emaPoints: string[] = [];
  let ema = candles[0].close;
  candles.forEach((c, idx) => {
    ema = c.close * (2 / 15) + ema * (1 - 2 / 15);
    const x = padding + idx * candleWidth + candleWidth / 2;
    const y = getY(ema);
    emaPoints.push(`${x},${y}`);
  });
  svgContent += `<polyline fill="none" stroke="#38bdf8" stroke-width="1.5" points="${emaPoints.join(' ')}" opacity="0.8"/>`;

  // Draw candles
  candles.forEach((c, idx) => {
    const isBullish = c.close >= c.open;
    const color = isBullish ? '#10b981' : '#f43f5e';
    const x = padding + idx * candleWidth;
    const centerX = x + candleWidth / 2;

    const highY = getY(c.high);
    const lowY = getY(c.low);
    const openY = getY(c.open);
    const closeY = getY(c.close);

    const bodyY = Math.min(openY, closeY);
    const bodyHeight = Math.max(Math.abs(closeY - openY), 2);

    // Wick
    svgContent += `<line x1="${centerX}" y1="${highY}" x2="${centerX}" y2="${lowY}" stroke="${color}" stroke-width="1.5"/>`;
    // Body
    svgContent += `<rect x="${x + candleWidth * 0.15}" y="${bodyY}" width="${candleWidth * 0.7}" height="${bodyHeight}" fill="${color}" rx="1"/>`;
  });

  // Footer volume bars
  const maxVol = Math.max(...candles.map(c => c.volume || 1000));
  candles.forEach((c, idx) => {
    const volHeight = ((c.volume || 1000) / maxVol) * 45;
    const x = padding + idx * candleWidth;
    const isBull = c.close >= c.open;
    svgContent += `<rect x="${x + candleWidth * 0.2}" y="${height - 15 - volHeight}" width="${candleWidth * 0.6}" height="${volHeight}" fill="${isBull ? '#10b981' : '#f43f5e'}" opacity="0.25"/>`;
  });

  svgContent += `</svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svgContent)}`;
}

// Generate base candles for realistic presets
function createCandleSequence(startPrice: number, count: number, pattern: 'bullish_breakout' | 'bearish_reversal' | 'ranging' | 'false_breakout'): CandleData[] {
  const candles: CandleData[] = [];
  let price = startPrice;

  for (let i = 0; i < count; i++) {
    const hour = Math.floor(i / 12) + 9;
    const min = (i % 12) * 5;
    const time = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;

    let change = 0;
    if (pattern === 'bullish_breakout') {
      change = i > count - 8 ? (Math.random() * 0.0018 + 0.0005) : ((Math.random() - 0.48) * 0.0008);
    } else if (pattern === 'bearish_reversal') {
      change = i > count - 6 ? -(Math.random() * 0.0022 + 0.0008) : ((Math.random() - 0.45) * 0.001);
    } else if (pattern === 'ranging') {
      change = Math.sin(i / 2.5) * 0.0012 + (Math.random() - 0.5) * 0.0006;
    } else {
      // false breakout (pumps then sharp reject)
      if (i === count - 3) change = 0.003;
      else if (i >= count - 2) change = -0.0035;
      else change = (Math.random() - 0.5) * 0.001;
    }

    const open = price;
    const close = Number((open + change).toFixed(5));
    const high = Number((Math.max(open, close) + Math.random() * 0.0008).toFixed(5));
    const low = Number((Math.min(open, close) - Math.random() * 0.0008).toFixed(5));
    const volume = Math.floor(1200 + Math.random() * 2500 * (i > count - 5 ? 2.5 : 1));

    candles.push({ time, open, high, low, close, volume });
    price = close;
  }

  return candles;
}

export interface SampleChartPreset {
  id: string;
  name: string;
  asset: string;
  timeframe: string;
  badge: string;
  verdictType: 'COMPRA' | 'VENDA' | 'AGUARDAR';
  description: string;
  imageUrl: string;
  analysis: AnalysisResult;
}

// 1. Bullish Breakout Preset (5/5 COMPRA)
const eurusdCandles = createCandleSequence(1.0820, 24, 'bullish_breakout');
const eurusdImage = createCandlestickSvgDataUri('EUR/USD · M5 Bullish Expansion', eurusdCandles, 'up', 'EMA 20/50 + RSI Divergence');

// 2. Bearish Reversal Preset (4/5 VENDA)
const btcusdCandles = createCandleSequence(67450, 24, 'bearish_reversal');
const btcusdImage = createCandlestickSvgDataUri('BTC/USDT · M15 Resistance Rejection', btcusdCandles, 'down', 'Double Top + Bearish Pinbar');

// 3. Choppy Ranging Preset (AGUARDAR 2/5)
const ethusdCandles = createCandleSequence(3420, 24, 'ranging');
const ethusdImage = createCandlestickSvgDataUri('ETH/USDT · H1 Consolidation Channel', ethusdCandles, 'neutral', 'Inside Bar Consolidation');

// 4. False Breakout Trap Preset (AGUARDAR 3/5)
const xauusdCandles = createCandleSequence(2385.5, 24, 'false_breakout');
const xauusdImage = createCandlestickSvgDataUri('XAU/USD (Gold) · M1 Liquidity Sweep Trap', xauusdCandles, 'neutral', 'Liquidity Sweep + High Wick Reject');

export const SAMPLE_CHART_PRESETS: SampleChartPreset[] = [
  {
    id: 'sample_eurusd_buy',
    name: 'EUR/USD - Rompimento com Confluência',
    asset: 'EUR/USD',
    timeframe: 'M5',
    badge: 'Consenso 5/5 COMPRA',
    verdictType: 'COMPRA',
    description: 'Rompimento de LTB com engolfo de alta sustentado pela EMA 20 e expansão de volume institucional.',
    imageUrl: eurusdImage,
    analysis: {
      id: 'analysis_sample_1',
      timestamp: Date.now(),
      imagePreview: eurusdImage,
      mode: 'pro',
      asset: 'EUR/USD',
      timeframe: 'M5',
      additionalContext: 'EMA 20/50 cruzada para cima, RSI acima de 55 em expansão.',
      verdict: {
        verdict: 'COMPRA',
        consensusRatio: 1.0,
        agreementCount: 5,
        totalAgents: 5,
        buyVotes: 5,
        sellVotes: 0,
        neutralVotes: 0,
        overallConfidence: 91,
        hasConsensus: true,
        confluenceScore: 94,
        recommendedAction: 'Confluência unânime de alta (5/5). Rompimento estrutural confirmado com projeção de 3 a 5 velas no timeframe M5.',
        keyFactors: [
          'Price Action: Rompimento limpo da resistência dinâmica com vela de impulsão marubozu.',
          'Indicadores: EMA 20 inclinada positivamente acima da EMA 50; RSI em 62 sem sobrecompra.',
          'Fluxo: Volume 180% acima da média móvel de 20 períodos sem rejeição superior.',
          'Preditivo ML: Probabilidade estocástica de continuação altista estimada em 84.6% nas próximas 5 velas.'
        ]
      },
      insights: {
        trend: 'Alta Forte (Topos e Fundos Ascendentes alinhados às EMAs)',
        trendDirection: 'alta',
        keyPattern: 'Rompimento de LTB com Pullback e Engolfo de Alta',
        patternType: 'Reversão Confirmada',
        quality: 'A+ (Excelente Confluência 5/5 - 94%)',
        qualityGrade: 'A+',
        qualityScore: 94,
        idealExpiration: '3 velas (15 min)',
        expirationRationale: 'Calibrada individualmente para EUR/USD (M5): rompimento de LTB com volatilidade equilibrada favorece 3 velas até o TP1.',
        entryTiming: 'Abertura da próxima vela M5 (Virada de Ciclo)',
        entryTrigger: 'Virada de Vela · M5',
        entryTimingRationale: 'Engolfo de alta fechando acima da LTB com volume institucional 1.8x acima da média confirma entrada na abertura da próxima vela.',
      },
      agents: [
        {
          id: 'price_action',
          name: 'Agente de Price Action & Estrutura',
          role: 'Analista de Suportes, Resistências e Padrões de Candlestick',
          vote: 'COMPRA',
          confidence: 94,
          rationale: 'Rompimento confirmado de resistência com candle de força (Bullish Marubozu) fechando acima da máxima anterior.',
          signals: [
            { label: 'Padrão Candle', value: 'Engolfo de Alta / Marubozu', sentiment: 'bullish' },
            { label: 'Estrutura', value: 'Topos e Fundos Ascendentes', sentiment: 'bullish' },
            { label: 'Suporte Chave', value: '1.08250 (Testado e mantido)', sentiment: 'bullish' }
          ]
        },
        {
          id: 'indicators',
          name: 'Agente de Indicadores Técnicos',
          role: 'Extrator de Médias Móveis, Bandas de Bollinger e Osciladores',
          vote: 'COMPRA',
          confidence: 92,
          rationale: 'Alinhamento altista perfeito: EMA 20 acima da EMA 50, RSI em 62 com momentum acelerando sem divergências.',
          signals: [
            { label: 'EMAs 20/50', value: 'Cruzamento de Ouro Ativo', sentiment: 'bullish' },
            { label: 'RSI (14)', value: '62.4 (Zona Bullish Confortável)', sentiment: 'bullish' },
            { label: 'Bandas Bollinger', value: 'Banda Superior em Expansão', sentiment: 'bullish' }
          ]
        },
        {
          id: 'flow_volatility',
          name: 'Agente de Fluxo e Volatilidade',
          role: 'Avaliador de Pressão Compradora/Vendedora e Risco de Armadilha',
          vote: 'COMPRA',
          confidence: 88,
          rationale: 'Volume financeiro 1.8x maior na perna de alta; ausência de pavios de rejeição no topo da vela atual.',
          signals: [
            { label: 'Volume Delta', value: '+74% Comprador', sentiment: 'bullish' },
            { label: 'Pavios de Rejeição', value: 'Inferiores (Defesa compradora)', sentiment: 'bullish' },
            { label: 'Risco de Falso Rompimento', value: 'Baixo (< 18%)', sentiment: 'bullish' }
          ]
        },
        {
          id: 'predictive_ml',
          name: 'Agente Preditivo (Machine Learning)',
          role: 'Modelagem Estatística de Séries Temporais e Monte Carlo',
          vote: 'COMPRA',
          confidence: 89,
          rationale: 'Simulação estatística com 5.000 iterações indica 84.6% de probabilidade de avanço positivo para as próximas 3 a 5 velas.',
          signals: [
            { label: 'Probabilidade de Alta', value: '84.6%', sentiment: 'bullish' },
            { label: 'Drift Estimado', value: '+0.092% por vela', sentiment: 'bullish' },
            { label: 'Modelo', value: 'Random Walk com Drift Direcional', sentiment: 'bullish' }
          ]
        },
        {
          id: 'confluence_risk',
          name: 'Agente de Confluência e Risco (Juiz)',
          role: 'Consolidador de Risco, Relação R:R e Tempo de Expiração',
          vote: 'COMPRA',
          confidence: 93,
          rationale: 'Relação Risco-Retorno excelente de 1:2.8. Stop loss bem protegido abaixo do fundo de referência.',
          signals: [
            { label: 'Relação R:R', value: '1:2.85', sentiment: 'bullish' },
            { label: 'Nível de Risco', value: 'Baixo', sentiment: 'bullish' },
            { label: 'Expiração Recomendada', value: '3 a 5 velas (15m - 25m)', sentiment: 'neutral' }
          ]
        }
      ],
      plan: {
        asset: 'EUR/USD',
        timeframe: 'M5',
        entryZone: '1.08380 - 1.08410',
        takeProfit1: '1.08580 (+18 pips)',
        takeProfit2: '1.08720 (+32 pips)',
        stopLoss: '1.08310 (-9 pips)',
        riskRewardRatio: '1:2.85',
        suggestedExpiration: '3 a 5 velas (15m a 25m)',
        riskLevel: 'Baixo',
        direction: 'COMPRA'
      },
      radarMetrics: {
        priceAction: 94,
        technicals: 92,
        flowVolatility: 88,
        predictiveML: 89,
        riskManagement: 93
      },
      candles: eurusdCandles,
      levels: [
        { price: 1.08310, type: 'support', strength: 'forte', label: 'Suporte Dinâmico EMA 20' },
        { price: 1.08580, type: 'resistance', strength: 'moderado', label: 'Alvo TP 1' },
        { price: 1.08720, type: 'resistance', strength: 'forte', label: 'Resistência H1 (TP 2)' }
      ],
      outcome: 'win'
    }
  },
  {
    id: 'sample_btcusd_sell',
    name: 'BTC/USDT - Rejeição de Resistência (4/5 VENDA)',
    asset: 'BTC/USDT',
    timeframe: 'M15',
    badge: 'Consenso 4/5 VENDA',
    verdictType: 'VENDA',
    description: 'Padrão de Topo Duplo com Shooting Star (Estrela Cadente), divergência de baixa no RSI e exaustão de volume.',
    imageUrl: btcusdImage,
    analysis: {
      id: 'analysis_sample_2',
      timestamp: Date.now() - 3600000,
      imagePreview: btcusdImage,
      mode: 'pro',
      asset: 'BTC/USDT',
      timeframe: 'M15',
      additionalContext: 'Rejeição violenta na zona psicológica de $67.500 com absorção vendedora.',
      verdict: {
        verdict: 'VENDA',
        consensusRatio: 0.8,
        agreementCount: 4,
        totalAgents: 5,
        buyVotes: 0,
        sellVotes: 4,
        neutralVotes: 1,
        overallConfidence: 87,
        hasConsensus: true,
        confluenceScore: 88,
        recommendedAction: 'Consenso qualificado de 80% (4 em 5 agentes votam VENDA). Forte sinal de reversão baixista após exaustão compradora.',
        keyFactors: [
          'Price Action: Estrela Cadente com longo pavio superior após teste duplo na resistência.',
          'Indicadores: RSI formou divergência baixista evidente (preço fez topo igual, RSI fez topo descendente).',
          'Fluxo: Absorção agressiva de compra com virada de delta negativo.',
          'Risco: Stop curto acima do pavio da máxima ($67.850).'
        ]
      },
      insights: {
        trend: 'Baixa Iminente (Reversão de Topo em Resistência)',
        trendDirection: 'baixa',
        keyPattern: 'Topo Duplo com Estrela Cadente (Shooting Star)',
        patternType: 'Reversão de Topo',
        quality: 'A (Alta Confluência 4/5 - 88%)',
        qualityGrade: 'A',
        qualityScore: 88,
        idealExpiration: '2 velas (30 min)',
        expirationRationale: 'Calibrada individualmente para BTC/USDT (M15): rejeição em topo duplo com alta volatilidade pede expiração curta de 2 velas.',
        entryTiming: 'Abertura da próxima vela M15 após rejeição',
        entryTrigger: 'Rejeição em Resistência · M15',
        entryTimingRationale: 'Pavio superior de 65% na zona de $67.550 confirma absorção vendedora imediata na virada do candle M15.',
      },
      agents: [
        {
          id: 'price_action',
          name: 'Agente de Price Action & Estrutura',
          role: 'Analista de Suportes, Resistências e Padrões de Candlestick',
          vote: 'VENDA',
          confidence: 91,
          rationale: 'Rejeição categórica em topo duplo com formação de Shooting Star de forte conotação vendedora.',
          signals: [
            { label: 'Padrão', value: 'Estrela Cadente / Topo Duplo', sentiment: 'bearish' },
            { label: 'Resistência', value: '$67.550 (Rejeitada com pavio)', sentiment: 'bearish' },
            { label: 'Linha de Tendência', value: 'Perda da LTA acelerada', sentiment: 'bearish' }
          ]
        },
        {
          id: 'indicators',
          name: 'Agente de Indicadores Técnicos',
          role: 'Extrator de Médias Móveis, Bandas de Bollinger e Osciladores',
          vote: 'VENDA',
          confidence: 89,
          rationale: 'Divergência clássica no RSI no M15 combinada com rejeição na banda superior de Bollinger.',
          signals: [
            { label: 'Divergência RSI', value: 'Baixista Clara (74 -> 58)', sentiment: 'bearish' },
            { label: 'MACD', value: 'Histograma perdendo força compradora', sentiment: 'bearish' },
            { label: 'Preço x Média', value: 'Retornando para testar EMA 20', sentiment: 'neutral' }
          ]
        },
        {
          id: 'flow_volatility',
          name: 'Agente de Fluxo e Volatilidade',
          role: 'Avaliador de Pressão Compradora/Vendedora e Risco de Armadilha',
          vote: 'VENDA',
          confidence: 86,
          rationale: 'Grande volume no pavio superior comprova absorção institucional despejando posições compradas.',
          signals: [
            { label: 'Pavio Superior', value: '65% do tamanho total da vela', sentiment: 'bearish' },
            { label: 'Delta de Fluxo', value: 'Saldo Vendedor Predominante', sentiment: 'bearish' },
            { label: 'Volatilidade ATR', value: 'Elevada (Expansão na queda)', sentiment: 'bearish' }
          ]
        },
        {
          id: 'predictive_ml',
          name: 'Agente Preditivo (Machine Learning)',
          role: 'Modelagem Estatística de Séries Temporais e Monte Carlo',
          vote: 'VENDA',
          confidence: 84,
          rationale: 'Regressão logística e projeção estocástica indicam 81.2% de probabilidade de recuo até o suporte anterior.',
          signals: [
            { label: 'Probabilidade de Queda', value: '81.2%', sentiment: 'bearish' },
            { label: 'Alvo Médio Estimado', value: '$66.820', sentiment: 'bearish' },
            { label: 'Risco de Re-teste', value: 'Moderado (18.8%)', sentiment: 'neutral' }
          ]
        },
        {
          id: 'confluence_risk',
          name: 'Agente de Confluência e Risco (Juiz)',
          role: 'Consolidador de Risco, Relação R:R e Tempo de Expiração',
          vote: 'AGUARDAR',
          confidence: 65,
          rationale: 'Embora a direção seja vendedora, recomendo cautela caso ocorra um re-teste imediato do pavio antes da aceleração.',
          signals: [
            { label: 'Veredito Próprio', value: 'Cautela no gatilho imediato', sentiment: 'neutral' },
            { label: 'Relação R:R', value: '1:2.40', sentiment: 'bullish' },
            { label: 'Proteção SL', value: '$67.850', sentiment: 'bullish' }
          ]
        }
      ],
      plan: {
        asset: 'BTC/USDT',
        timeframe: 'M15',
        entryZone: '$67.350 - $67.450',
        takeProfit1: '$66.850',
        takeProfit2: '$66.200',
        stopLoss: '$67.850',
        riskRewardRatio: '1:2.40',
        suggestedExpiration: '3 a 6 velas (45m a 90m)',
        riskLevel: 'Moderado',
        direction: 'VENDA'
      },
      radarMetrics: {
        priceAction: 91,
        technicals: 89,
        flowVolatility: 86,
        predictiveML: 84,
        riskManagement: 65
      },
      candles: btcusdCandles,
      levels: [
        { price: 67850, type: 'resistance', strength: 'forte', label: 'Stop Loss / Topo do Pavio' },
        { price: 66850, type: 'support', strength: 'moderado', label: 'Take Profit 1' },
        { price: 66200, type: 'support', strength: 'forte', label: 'Take Profit 2' }
      ],
      outcome: 'win'
    }
  },
  {
    id: 'sample_ethusd_ranging',
    name: 'ETH/USDT - Lateralização e Ruído (AGUARDAR)',
    asset: 'ETH/USDT',
    timeframe: 'H1',
    badge: 'Consenso 2/5 (AGUARDAR)',
    verdictType: 'AGUARDAR',
    description: 'Preço preso em canal estreito sem direção definida, EMAs entrelaçadas e sem confluência mínima de 80%.',
    imageUrl: ethusdImage,
    analysis: {
      id: 'analysis_sample_3',
      timestamp: Date.now() - 7200000,
      imagePreview: ethusdImage,
      mode: 'simple',
      asset: 'ETH/USDT',
      timeframe: 'H1',
      additionalContext: 'Mercado em compressão de volatilidade esperando dados macroeconômicos.',
      verdict: {
        verdict: 'AGUARDAR',
        consensusRatio: 0.4,
        agreementCount: 2,
        totalAgents: 5,
        buyVotes: 2,
        sellVotes: 1,
        neutralVotes: 2,
        overallConfidence: 54,
        hasConsensus: false,
        confluenceScore: 48,
        recommendedAction: 'CONSENSO INSUFICIENTE (2/5). A regra NextCandle.AI de 80% bloqueia qualquer entrada em mercado lateral para blindar seu capital.',
        keyFactors: [
          'Preço consolidado em caixote lateral (Dois topos e dois fundos nivelados).',
          'EMAs 20 e 50 horizontais e sobrepostas sem inclinação diretiva.',
          'Volume abaixo da média histórica denotando desinteresse institucional.',
          'RSI em 50.4 (exatamente no centro neutro).'
        ]
      },
      insights: {
        trend: 'Lateralização / Consolidação em Range',
        trendDirection: 'lateral',
        keyPattern: 'Indecisão / Doji em Meio de Canal Estreito',
        patternType: 'Compressão de Volatilidade',
        quality: 'C (Sem Confluência - Evitar Operar)',
        qualityGrade: 'C',
        qualityScore: 48,
        idealExpiration: 'Aguardar rompimento · Ref. 2 velas (2h)',
        expirationRationale: 'Operar dentro de range lateral gera falso rompimento e ruído de mercado.',
        entryTiming: 'Aguardar fechamento fora da faixa $3.400 - $3.450',
        entryTrigger: 'Bloqueado · Sem Consenso ≥ 80%',
        entryTimingRationale: 'Médias flat e baixa liquidez no H1 recomendam aguardar rompimento confirmado na virada de hora.',
      },
      agents: [
        {
          id: 'price_action',
          name: 'Agente de Price Action & Estrutura',
          role: 'Analista de Suportes, Resistências e Padrões de Candlestick',
          vote: 'AGUARDAR',
          confidence: 78,
          rationale: 'Ausência de topos e fundos direcionais. Padrão de caixote lateral / Inside Bars sucessivas.',
          signals: [
            { label: 'Tendência', value: 'Lateral Indefinida', sentiment: 'neutral' },
            { label: 'Amplitude', value: 'Estreita (< 0.8%)', sentiment: 'neutral' },
            { label: 'Gatilho', value: 'Nenhum rompimento válido', sentiment: 'neutral' }
          ]
        },
        {
          id: 'indicators',
          name: 'Agente de Indicadores Técnicos',
          role: 'Extrator de Médias Móveis, Bandas de Bollinger e Osciladores',
          vote: 'AGUARDAR',
          confidence: 82,
          rationale: 'Médias móveis totalmente flat e entrelaçadas. RSI cravado em 50 sem momentum.',
          signals: [
            { label: 'RSI (14)', value: '50.4 (Zona Morta)', sentiment: 'neutral' },
            { label: 'Bandas Bollinger', value: 'Squeeze Severo (Compressão)', sentiment: 'neutral' },
            { label: 'EMA 20/50', value: 'Cruzando aleatoriamente', sentiment: 'neutral' }
          ]
        },
        {
          id: 'flow_volatility',
          name: 'Agente de Fluxo e Volatilidade',
          role: 'Avaliador de Pressão Compradora/Vendedora e Risco de Armadilha',
          vote: 'COMPRA',
          confidence: 52,
          rationale: 'Leve acúmulo no suporte do canal, porém sem convicção institucional suficiente.',
          signals: [
            { label: 'Fluxo', value: 'Neutro / Baixa Liquidez', sentiment: 'neutral' },
            { label: 'Risco de Ruído', value: 'Extremamente Alto', sentiment: 'bearish' }
          ]
        },
        {
          id: 'predictive_ml',
          name: 'Agente Preditivo (Machine Learning)',
          role: 'Modelagem Estatística de Séries Temporais e Monte Carlo',
          vote: 'VENDA',
          confidence: 48,
          rationale: 'Modelo não encontra padrão estatístico com significância p < 0.05. Probabilidade 51% vs 49%.',
          signals: [
            { label: 'Acurácia Modelo', value: 'Inconclusiva (Random Walk)', sentiment: 'neutral' },
            { label: 'Dispersão', value: 'Alta variância estocástica', sentiment: 'neutral' }
          ]
        },
        {
          id: 'confluence_risk',
          name: 'Agente de Confluência e Risco (Juiz)',
          role: 'Consolidador de Risco, Relação R:R e Tempo de Expiração',
          vote: 'AGUARDAR',
          confidence: 95,
          rationale: 'Bloqueio estrito de capital. Operar em consolidação de média flat viola o gerenciamento de risco profissional.',
          signals: [
            { label: 'Autorização', value: 'BLOQUEADA (Consenso 40%)', sentiment: 'bearish' },
            { label: 'Recomendação', value: 'Aguardar Rompimento dos Extremos', sentiment: 'neutral' }
          ]
        }
      ],
      plan: {
        asset: 'ETH/USDT',
        timeframe: 'H1',
        entryZone: 'Aguardar saída de $3.400 - $3.450',
        takeProfit1: 'Não Aplicável',
        takeProfit2: 'Não Aplicável',
        stopLoss: 'Não Aplicável',
        riskRewardRatio: 'N/A',
        suggestedExpiration: 'Aguardar confirmação de vela fora do canal',
        riskLevel: 'Alto',
        direction: 'AGUARDAR'
      },
      radarMetrics: {
        priceAction: 45,
        technicals: 40,
        flowVolatility: 50,
        predictiveML: 46,
        riskManagement: 90
      },
      candles: ethusdCandles,
      levels: [
        { price: 3450, type: 'resistance', strength: 'moderado', label: 'Topo do Caixote' },
        { price: 3400, type: 'support', strength: 'moderado', label: 'Fundo do Caixote' }
      ],
      outcome: 'pending'
    }
  },
  {
    id: 'sample_xauusd_trap',
    name: 'XAU/USD (Ouro) - Rompimento Falso (AGUARDAR 3/5)',
    asset: 'XAU/USD',
    timeframe: 'M1',
    badge: 'Armadilha Detectada (AGUARDAR)',
    verdictType: 'AGUARDAR',
    description: 'Armadilha de touro (Bull Trap) com falso rompimento rápido e rejeição imediata por pavio superior.',
    imageUrl: xauusdImage,
    analysis: {
      id: 'analysis_sample_4',
      timestamp: Date.now() - 14400000,
      imagePreview: xauusdImage,
      mode: 'pro',
      asset: 'XAU/USD',
      timeframe: 'M1',
      additionalContext: 'Spike de liquidez de abertura do mercado de Londres.',
      verdict: {
        verdict: 'AGUARDAR',
        consensusRatio: 0.6,
        agreementCount: 3,
        totalAgents: 5,
        buyVotes: 0,
        sellVotes: 3,
        neutralVotes: 2,
        overallConfidence: 71,
        hasConsensus: false,
        confluenceScore: 62,
        recommendedAction: 'AGUARDAR: Risco elevado de armadilha de liquidez (Sweep). Consenso de 60% não atinge a regra obrigatória de 80%.',
        keyFactors: [
          'Vela furou a resistência e foi imediatamente repelida para dentro da faixa.',
          'Divergência entre agentes: 3 defendem VENDA mas 2 recomendam AGUARDAR pelo spread.',
          'Pavio de rejeição de 70% com volume de parada.'
        ]
      },
      insights: {
        trend: 'Tendência Comprometida / Falso Rompimento',
        trendDirection: 'lateral',
        keyPattern: 'Armadilha de Touro (Bull Trap / Liquidity Sweep)',
        patternType: 'Rejeição Violenta por Pavio',
        quality: 'B (Risco Elevado - 62%)',
        qualityGrade: 'B',
        qualityScore: 62,
        idealExpiration: 'Aguardar rompimento · Ref. 3 velas (3 min)',
        expirationRationale: 'Stop hunters atuando na máxima; aguardar reteste para definição clara.',
        entryTiming: 'Aguardar estabilização nos próximos fechamentos de M1',
        entryTrigger: 'Bloqueado · Risco de Armadilha',
        entryTimingRationale: 'Liquidity sweep violento no M1 sem consenso mínimo de 80%; aguardar estabilização do spread e novo candle.',
      },
      agents: [
        {
          id: 'price_action',
          name: 'Agente de Price Action & Estrutura',
          role: 'Analista de Suportes, Resistências e Padrões de Candlestick',
          vote: 'VENDA',
          confidence: 82,
          rationale: 'Falso rompimento clássico (Bull Trap) com fechamento abaixo do nível violado.',
          signals: [
            { label: 'Padrão', value: 'Pinbar Invertido / Fakeout', sentiment: 'bearish' },
            { label: 'Rejeição', value: '$2388.50', sentiment: 'bearish' }
          ]
        },
        {
          id: 'indicators',
          name: 'Agente de Indicadores Técnicos',
          role: 'Extrator de Médias Móveis, Bandas de Bollinger e Osciladores',
          vote: 'AGUARDAR',
          confidence: 60,
          rationale: 'Indicadores no M1 ainda sofrem de atraso frente ao spike de volatilidade instantâneo.',
          signals: [
            { label: 'RSI M1', value: '68 caindo rápido', sentiment: 'neutral' },
            { label: 'Confiabilidade', value: 'Reduzida em timeframes ultracurtos', sentiment: 'neutral' }
          ]
        },
        {
          id: 'flow_volatility',
          name: 'Agente de Fluxo e Volatilidade',
          role: 'Avaliador de Pressão Compradora/Vendedora e Risco de Armadilha',
          vote: 'VENDA',
          confidence: 85,
          rationale: 'Liquidity sweep capturou stops de compradores no topo e reverteu agressivamente.',
          signals: [
            { label: 'Liquidity Sweep', value: 'Confirmado no topo', sentiment: 'bearish' },
            { label: 'Volume Reversão', value: 'Alto no topo', sentiment: 'bearish' }
          ]
        },
        {
          id: 'predictive_ml',
          name: 'Agente Preditivo (Machine Learning)',
          role: 'Modelagem Estatística de Séries Temporais e Monte Carlo',
          vote: 'VENDA',
          confidence: 76,
          rationale: 'Probabilidade de retorno à média de 78%, porém horizonte de 1 a 2 velas é volátil.',
          signals: [
            { label: 'Probabilidade', value: '78% Retração', sentiment: 'bearish' }
          ]
        },
        {
          id: 'confluence_risk',
          name: 'Agente de Confluência e Risco (Juiz)',
          role: 'Consolidador de Risco, Relação R:R e Tempo de Expiração',
          vote: 'AGUARDAR',
          confidence: 88,
          rationale: 'Apenas 3 votos favoráveis de 5 (60%). O limiar de 80% é intransigível para proteger contra ruídos de 1 minuto.',
          signals: [
            { label: 'Consenso', value: '3/5 (Abaixo de 80%)', sentiment: 'neutral' },
            { label: 'Decisão do Juiz', value: 'Ordem de Espera', sentiment: 'neutral' }
          ]
        }
      ],
      plan: {
        asset: 'XAU/USD',
        timeframe: 'M1',
        entryZone: 'Aguardar re-teste estável em $2385.00',
        takeProfit1: '$2381.50',
        takeProfit2: '$2378.00',
        stopLoss: '$2389.20',
        riskRewardRatio: '1:1.80',
        suggestedExpiration: 'Aguardar novo fechamento de M5',
        riskLevel: 'Extremo',
        direction: 'AGUARDAR'
      },
      radarMetrics: {
        priceAction: 82,
        technicals: 60,
        flowVolatility: 85,
        predictiveML: 76,
        riskManagement: 88
      },
      candles: xauusdCandles,
      levels: [
        { price: 2388.50, type: 'resistance', strength: 'forte', label: 'Topo da Armadilha' },
        { price: 2381.50, type: 'support', strength: 'moderado', label: 'Suporte Alvo M1' }
      ],
      outcome: 'win'
    }
  }
];
