import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { detectMarketEnvironment } from './src/utils/timingEngine.js';
import { getEconomicCalendarStatus, getLiveEconomicEvents } from './server/economicCalendar.js';
import {
  getCurrentCalibrationProfile,
  isCalibrationStale,
  refreshCalibrationWithAI,
} from './server/aiCalibrationService.js';
import {
  authManager,
  parseCookieHeader,
  SESSION_COOKIE_NAME,
  SessionPayload,
} from './server/authService.js';
import { SlidingWindowRateLimiter } from './server/rateLimiter.js';
import { handleAnalyzeChartRequest } from './server/chartAnalysisPipeline.js';

if (fs.existsSync('/etc/secrets/.env')) {
  dotenv.config({ path: '/etc/secrets/.env', override: false });
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

const allowedCorsOrigins = new Set(
  (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean)
);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  const origin = typeof req.headers.origin === 'string' ? req.headers.origin.replace(/\/+$/, '') : '';
  if (origin && allowedCorsOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
  }

  return next();
});

const port = Number(process.env.PORT) || 3000;

app.get('/api/health', (_req: Request, res: Response) => {
  return res.status(200).json({
    ok: true,
    status: 'healthy',
    uptimeSeconds: Math.floor(process.uptime()),
  });
});

// Tight default JSON/urlencoded limit across all routes; heavy chart upload route gets explicit 25mb parser
const smallJsonParser = express.json({ limit: '64kb' });
const smallUrlEncodedParser = express.urlencoded({ extended: true, limit: '64kb' });
const chartJsonParser = express.json({ limit: '25mb' });

app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.path === '/api/analyze-chart') {
    return next();
  }
  return smallJsonParser(req, res, (err) => {
    if (err) return next(err);
    return smallUrlEncodedParser(req, res, next);
  });
});

// Initialize Gemini client with telemetry header
const rawApiKey = process.env.GEMINI_API_KEY;
const apiKey =
  typeof rawApiKey === 'string' ? rawApiKey.trim().replace(/^["']|["']$/g, '') : '';
let aiClient: GoogleGenAI | null = null;
if (apiKey && apiKey !== 'MY_GEMINI_API_KEY') {
  aiClient = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Sliding-window rate limiters for auth endpoints
const loginRateLimiter = new SlidingWindowRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxAttempts: 10,
});
const setupRateLimiter = new SlidingWindowRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxAttempts: 5,
});

function getClientKey(req: Request): string {
  return (req.ip || req.socket?.remoteAddress || 'unknown').trim();
}

function isHttpsRequest(req: Request): boolean {
  const forwardedProto = req.headers['x-forwarded-proto'];
  if (typeof forwardedProto === 'string') {
    return forwardedProto.split(',')[0].trim().toLowerCase() === 'https';
  }
  return Boolean(req.secure);
}

function setSessionCookie(req: Request, res: Response, token: string, maxAgeSeconds: number): void {
  const attributes = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.max(60, Math.floor(maxAgeSeconds))}`,
  ];
  if (isHttpsRequest(req)) {
    attributes.push('Secure');
  }
  res.setHeader('Set-Cookie', attributes.join('; '));
}

function clearSessionCookie(req: Request, res: Response): void {
  const attributes = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (isHttpsRequest(req)) {
    attributes.push('Secure');
  }
  res.setHeader('Set-Cookie', attributes.join('; '));
}

interface AuthenticatedRequest extends Request {
  authSession?: SessionPayload;
}

function extractAuthToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string') {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match && match[1].trim()) {
      return match[1].trim();
    }
  }
  const cookies = parseCookieHeader(req.headers.cookie);
  const cookieToken = cookies[SESSION_COOKIE_NAME];
  return cookieToken && cookieToken.trim() ? cookieToken.trim() : null;
}

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const token = extractAuthToken(req);
  const { session, reason } = authManager.verifySessionToken(token);
  if (!session) {
    if (parseCookieHeader(req.headers.cookie)[SESSION_COOKIE_NAME]) {
      clearSessionCookie(req, res);
    }
    if (reason === 'expired') {
      return res.status(401).json({
        code: 'ACCOUNT_EXPIRED',
        error: 'O acesso temporário de 24 horas expirou e a conta foi bloqueada automaticamente.',
      });
    }
    return res.status(401).json({
      code: 'UNAUTHORIZED',
      error: 'Sessão expirada ou não autorizada. Inicia sessão novamente.',
    });
  }
  req.authSession = session;
  return next();
}

function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  return requireAuth(req, res, () => {
    if (req.authSession?.role !== 'admin') {
      return res.status(403).json({
        error: 'Acesso restrito ao painel de Administração.',
      });
    }
    return next();
  });
}

// Auth Endpoints (async scrypt + HMAC-SHA256 HttpOnly cookie & Bearer fallback + 24h tester enforcement)
app.get('/api/auth/status', (req: Request, res: Response) => {
  const token = extractAuthToken(req);
  const { session } = token ? authManager.verifySessionToken(token) : { session: null };
  return res.json({
    configured: authManager.isConfigured(),
    mode: authManager.getMode(),
    authSource: authManager.getAuthSource(),
    session: session
      ? {
          email: session.sub,
          role: session.role,
          expiresAt: session.role === 'tester' ? session.exp : null,
          serverNow: Date.now(),
        }
      : null,
  });
});

app.post('/api/auth/setup', async (req: Request, res: Response) => {
  const clientKey = getClientKey(req);
  const limit = setupRateLimiter.check(clientKey);
  if (!limit.allowed) {
    res.setHeader('Retry-After', String(limit.retryAfterSeconds));
    return res.status(429).json({
      error: `Demasiadas tentativas de configuração. Tenta novamente em ${limit.retryAfterSeconds}s.`,
    });
  }

  const result = await authManager.setupFirstAccessAsync(req.body?.email, req.body?.password);
  if (!result.ok || !result.token) {
    return res.status(result.status).json({ error: result.error });
  }

  setupRateLimiter.reset(clientKey);
  setSessionCookie(req, res, result.token, 12 * 60 * 60);

  return res.status(result.status).json({
    token: result.token,
    email: result.email,
    role: result.role,
    expiresAt: result.expiresAt ?? null,
    serverNow: Date.now(),
  });
});

app.post('/api/auth/login', async (req: Request, res: Response) => {
  const clientKey = getClientKey(req);
  const limit = loginRateLimiter.check(clientKey);
  if (!limit.allowed) {
    res.setHeader('Retry-After', String(limit.retryAfterSeconds));
    return res.status(429).json({
      error: `Demasiadas tentativas de login. Aguarda ${limit.retryAfterSeconds} segundos antes de tentar novamente.`,
    });
  }

  const result = await authManager.authenticateAsync(req.body?.email, req.body?.password);
  if (!result.ok || !result.token) {
    return res.status(result.status).json({ error: result.error });
  }

  loginRateLimiter.reset(clientKey);
  const maxAgeSeconds =
    result.role === 'tester' && typeof result.expiresAt === 'number'
      ? Math.max(60, Math.floor((result.expiresAt - Date.now()) / 1000))
      : 12 * 60 * 60;
  setSessionCookie(req, res, result.token, maxAgeSeconds);

  return res.status(result.status).json({
    token: result.token,
    email: result.email,
    role: result.role,
    expiresAt: result.expiresAt ?? null,
    serverNow: Date.now(),
  });
});

app.get('/api/auth/session', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const session = req.authSession!;
  return res.json({
    email: session.sub,
    role: session.role,
    expiresAt: session.role === 'tester' ? session.exp : null,
    serverNow: Date.now(),
  });
});

app.post('/api/auth/logout', (req: Request, res: Response) => {
  const token = extractAuthToken(req);
  authManager.revokeToken(token);
  clearSessionCookie(req, res);
  return res.json({ ok: true });
});

// Admin Panel Endpoints (Protected by requireAdmin)
app.get('/api/admin/test-users', requireAdmin, (_req: Request, res: Response) => {
  return res.json({
    accounts: authManager.listTemporaryTestAccounts(),
    serverNow: Date.now(),
    diagnostics: {
      aiConfigured: Boolean(aiClient),
      sessionSecretConfigured:
        typeof process.env.AUTH_SESSION_SECRET === 'string' &&
        process.env.AUTH_SESSION_SECRET.trim().length >= 16,
      persistentDataDirConfigured: Boolean(
        process.env.DATA_DIR &&
          process.env.DATA_DIR.trim().length > 0 &&
          process.env.DATA_DIR.trim() !== '.data'
      ),
      authSource: authManager.getAuthSource(),
    },
  });
});

app.post('/api/admin/test-users', requireAdmin, async (req: Request, res: Response) => {
  const result = await authManager.createTemporaryTestAccountAsync(req.body?.email, req.body?.note);
  if (!result.ok) {
    return res.status(result.status).json({ error: result.error });
  }
  return res.status(result.status).json({
    credential: result.credential,
    account: result.account,
    serverNow: Date.now(),
  });
});

app.post('/api/admin/test-users/:id/revoke', requireAdmin, (req: Request, res: Response) => {
  const revoked = authManager.revokeTemporaryTestAccount(req.params.id);
  if (!revoked) {
    return res.status(404).json({ error: 'Conta temporária não encontrada.' });
  }
  return res.json({
    accounts: authManager.listTemporaryTestAccounts(),
    serverNow: Date.now(),
  });
});

app.delete('/api/admin/test-users/:id', requireAdmin, (req: Request, res: Response) => {
  const deleted = authManager.deleteTemporaryTestAccount(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: 'Conta temporária não encontrada.' });
  }
  return res.json({
    accounts: authManager.listTemporaryTestAccounts(),
    serverNow: Date.now(),
  });
});

// Endpoint: Live Economic Calendar (Open Market High-Impact News)
app.get('/api/economic-calendar', requireAuth, async (req: Request, res: Response) => {
  try {
    const asset = typeof req.query.asset === 'string' ? req.query.asset : 'EUR/USD';
    const envQuery = typeof req.query.marketEnvironment === 'string' ? req.query.marketEnvironment : '';
    const marketEnvironment =
      envQuery === 'MERCADO_OTC' ? 'MERCADO_OTC' : detectMarketEnvironment(asset, envQuery);

    const status = await getEconomicCalendarStatus({
      asset,
      marketEnvironment,
      aiClient,
    });
    const feed = await getLiveEconomicEvents(aiClient);

    return res.json({
      status,
      events: feed.events.slice(0, 25),
      sources: feed.sources,
      fetchedAt: Date.now(),
    });
  } catch (err: any) {
    console.warn('Erro ao consultar calendário econômico:', err?.message || err);
    return res.status(500).json({ error: 'Falha ao consultar calendário econômico ao vivo.' });
  }
});

// Endpoint: Get active AI Agent & Indicator Calibration Profile
app.get('/api/agent-calibration', requireAuth, (_req: Request, res: Response) => {
  const profile = getCurrentCalibrationProfile();
  if (aiClient && isCalibrationStale(profile)) {
    refreshCalibrationWithAI(aiClient, undefined, { persistGlobal: true }).catch(() => {});
  }
  return res.json(profile);
});

// Endpoint: Refresh Agents & Indicators dynamically (only Admin mutates global calibration state)
app.post('/api/agent-calibration/refresh', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { performanceFeedback } = req.body || {};
    const persistGlobal = req.authSession?.role === 'admin';
    const updated = await refreshCalibrationWithAI(aiClient, performanceFeedback, {
      persistGlobal,
    });
    return res.json(updated);
  } catch {
    return res.json(getCurrentCalibrationProfile());
  }
});

// Endpoint: 5-Agent Multimodal Chart Analysis (route-scoped 25mb JSON body parser)
app.post(
  '/api/analyze-chart',
  requireAuth,
  chartJsonParser,
  async (req: Request, res: Response) => {
    return handleAnalyzeChartRequest(req, res, aiClient);
  }
);

// Clean JSON error handler for body-parser payload limit / malformed JSON errors
app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
  if (!err) return next();
  if (err.type === 'entity.too.large' || err.status === 413) {
    return res.status(413).json({
      code: 'PAYLOAD_TOO_LARGE',
      error: 'O conteúdo enviado excede o tamanho máximo permitido por esta rota.',
    });
  }
  if (err instanceof SyntaxError && (err as { status?: number }).status === 400 && 'body' in err) {
    return res.status(400).json({
      code: 'INVALID_JSON',
      error: 'Corpo da requisição JSON malformado.',
    });
  }
  console.error('Erro não tratado no servidor:', err?.message || err);
  return res.status(500).json({ error: 'Erro interno do servidor.' });
});

// Start dev or production server
async function startServer() {
  const isBundledProdBuild =
    path.basename(__filename) === 'server.js' && fs.existsSync(path.join(__dirname, 'index.html'));
  const isProduction = process.env.NODE_ENV === 'production' || isBundledProdBuild;

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = fs.existsSync(path.join(__dirname, 'index.html'))
      ? __dirname
      : path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`NextCandle.AI Multi-Agent Terminal rodando na porta ${port}`);
  });
}

startServer();
