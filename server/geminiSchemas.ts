import { Schema, Type } from '@google/genai';

export const CHART_ANALYSIS_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  required: ['asset', 'timeframe', 'marketEnvironment', 'insights', 'agents', 'plan', 'radarMetrics'],
  properties: {
    asset: { type: Type.STRING },
    timeframe: { type: Type.STRING },
    marketEnvironment: { type: Type.STRING, enum: ['MERCADO_ABERTO', 'MERCADO_OTC'] },
    marketCriteriaSummary: { type: Type.STRING },
    detectedPattern: { type: Type.STRING },
    currentPriceEstimate: { type: Type.STRING },
    insights: {
      type: Type.OBJECT,
      required: ['trend', 'trendDirection', 'keyPattern', 'qualityScore', 'idealExpiration', 'entryTiming'],
      properties: {
        trend: { type: Type.STRING },
        trendDirection: { type: Type.STRING, enum: ['alta', 'baixa', 'lateral'] },
        keyPattern: { type: Type.STRING },
        patternType: { type: Type.STRING },
        quality: { type: Type.STRING },
        qualityGrade: { type: Type.STRING, enum: ['A+', 'A', 'B', 'C'] },
        qualityScore: { type: Type.NUMBER },
        idealExpiration: { type: Type.STRING },
        expirationRationale: { type: Type.STRING },
        entryTiming: { type: Type.STRING },
        entryTrigger: { type: Type.STRING },
        entryTimingRationale: { type: Type.STRING },
      },
    },
    visualQuality: {
      type: Type.OBJECT,
      properties: {
        isReadable: { type: Type.BOOLEAN },
        hasPriceAxis: { type: Type.BOOLEAN },
        hasTimeAxis: { type: Type.BOOLEAN },
        visibleCandlesCount: { type: Type.NUMBER },
        issues: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
    },
    macroAnalysis: {
      type: Type.OBJECT,
      properties: {
        macroTimeframe: { type: Type.STRING },
        macroTrend: { type: Type.STRING, enum: ['alta', 'baixa', 'lateral', 'indefinida'] },
        macroSummary: { type: Type.STRING },
      },
    },
    multiTimeframeBreakdown: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ['timeframe', 'trend'],
        properties: {
          timeframe: { type: Type.STRING },
          trend: { type: Type.STRING, enum: ['alta', 'baixa', 'lateral', 'indefinida'] },
        },
      },
    },
    squeezeAnalysis: {
      type: Type.OBJECT,
      properties: {
        nearestObstructionType: { type: Type.STRING, enum: ['support', 'resistance', 'none'] },
        obstructionPrice: { type: Type.STRING },
        freeClearanceRR: { type: Type.NUMBER },
        isSqueezed: { type: Type.BOOLEAN },
      },
    },
    agents: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ['id', 'vote', 'confidence', 'rationale'],
        properties: {
          id: {
            type: Type.STRING,
            enum: ['price_action', 'indicators', 'flow_volatility', 'predictive_ml', 'confluence_risk'],
          },
          name: { type: Type.STRING },
          role: { type: Type.STRING },
          vote: { type: Type.STRING, enum: ['COMPRA', 'VENDA', 'AGUARDAR'] },
          confidence: { type: Type.NUMBER },
          rationale: { type: Type.STRING },
          signals: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              required: ['label', 'value', 'sentiment'],
              properties: {
                label: { type: Type.STRING },
                value: { type: Type.STRING },
                sentiment: { type: Type.STRING, enum: ['bullish', 'bearish', 'neutral'] },
              },
            },
          },
        },
      },
    },
    plan: {
      type: Type.OBJECT,
      properties: {
        entryZone: { type: Type.STRING },
        takeProfit1: { type: Type.STRING },
        takeProfit2: { type: Type.STRING },
        stopLoss: { type: Type.STRING },
        riskRewardRatio: { type: Type.STRING },
        suggestedExpiration: { type: Type.STRING },
        riskLevel: { type: Type.STRING, enum: ['Baixo', 'Moderado', 'Alto', 'Extremo'] },
      },
    },
    radarMetrics: {
      type: Type.OBJECT,
      properties: {
        priceAction: { type: Type.NUMBER },
        technicals: { type: Type.NUMBER },
        flowVolatility: { type: Type.NUMBER },
        predictiveML: { type: Type.NUMBER },
        riskManagement: { type: Type.NUMBER },
      },
    },
    visualAnnotations: {
      type: Type.OBJECT,
      properties: {
        analyzedZone: {
          type: Type.OBJECT,
          properties: {
            x: { type: Type.NUMBER },
            y: { type: Type.NUMBER },
            width: { type: Type.NUMBER },
            height: { type: Type.NUMBER },
            label: { type: Type.STRING },
          },
        },
        triggerPoint: {
          type: Type.OBJECT,
          properties: {
            x: { type: Type.NUMBER },
            y: { type: Type.NUMBER },
            label: { type: Type.STRING },
            timingLabel: { type: Type.STRING },
          },
        },
        trendArrow: {
          type: Type.OBJECT,
          properties: {
            fromX: { type: Type.NUMBER },
            fromY: { type: Type.NUMBER },
            toX: { type: Type.NUMBER },
            toY: { type: Type.NUMBER },
            label: { type: Type.STRING },
          },
        },
        keyLevels: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              y: { type: Type.NUMBER },
              type: { type: Type.STRING, enum: ['support', 'resistance', 'target'] },
              label: { type: Type.STRING },
            },
          },
        },
        strategyTitle: { type: Type.STRING },
        technicalReason: { type: Type.STRING },
        steps: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              step: { type: Type.NUMBER },
              title: { type: Type.STRING },
              detail: { type: Type.STRING },
            },
          },
        },
      },
    },
  },
};

export const CALIBRATION_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  required: ['marketRegimeSummary', 'openMarketIndicators', 'otcIndicators', 'agents'],
  properties: {
    marketRegimeSummary: { type: Type.STRING },
    openMarketIndicators: { type: Type.ARRAY, items: { type: Type.STRING } },
    otcIndicators: { type: Type.ARRAY, items: { type: Type.STRING } },
    agents: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ['id', 'openMarketFocus', 'otcFocus', 'prioritizedIndicators', 'weight'],
        properties: {
          id: {
            type: Type.STRING,
            enum: ['price_action', 'indicators', 'flow_volatility', 'predictive_ml', 'confluence_risk'],
          },
          openMarketFocus: { type: Type.STRING },
          otcFocus: { type: Type.STRING },
          prioritizedIndicators: { type: Type.ARRAY, items: { type: Type.STRING } },
          weight: { type: Type.NUMBER },
        },
      },
    },
  },
};

export const ECONOMIC_EVENTS_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  required: ['events'],
  properties: {
    events: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ['title', 'currency', 'impact', 'isoTimestampUtc'],
        properties: {
          title: { type: Type.STRING },
          currency: { type: Type.STRING },
          impact: { type: Type.STRING, enum: ['High', 'Medium', 'Low'] },
          isoTimestampUtc: { type: Type.STRING },
        },
      },
    },
  },
};

export interface ClassifiedGeminiError {
  status: number;
  code: string;
  userMessage: string;
}

export function classifyGeminiApiError(err: unknown): ClassifiedGeminiError {
  const statusRaw = Number((err as any)?.status || (err as any)?.code);
  const message = String((err as any)?.message || err || '');

  if (statusRaw === 429 || /429|RESOURCE_EXHAUSTED|quota|rate[- ]?limit/i.test(message)) {
    return {
      status: 429,
      code: 'AI_RATE_LIMITED',
      userMessage: 'Cota ou limite de requisições da API Gemini atingido. Aguarda alguns segundos e tenta novamente.',
    };
  }

  if (
    statusRaw === 401 ||
    statusRaw === 403 ||
    /API_KEY_INVALID|PERMISSION_DENIED|API key not valid|unauthenticated|forbidden/i.test(message)
  ) {
    return {
      status: 502,
      code: 'AI_CREDENTIALS_INVALID',
      userMessage: 'Falha de autenticação com o motor Gemini (GEMINI_API_KEY inválida ou sem permissão no servidor).',
    };
  }

  if (statusRaw === 404 || /NOT_FOUND|model.*not found/i.test(message)) {
    return {
      status: 502,
      code: 'AI_MODEL_UNAVAILABLE',
      userMessage: 'Modelo de visão Gemini indisponível ou não encontrado na conta configurada.',
    };
  }

  if (/timeout|timed out|AbortError|aborted/i.test(message)) {
    return {
      status: 504,
      code: 'AI_TIMEOUT',
      userMessage: 'Tempo limite excedido ao aguardar resposta do motor de visão. Tenta novamente com a imagem do gráfico.',
    };
  }

  return {
    status: 502,
    code: 'AI_UPSTREAM_ERROR',
    userMessage: 'O motor de visão computacional retornou uma resposta inválida ou indisponível no momento. Tenta novamente.',
  };
}
