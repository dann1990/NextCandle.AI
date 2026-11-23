import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Ban,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  KeyRound,
  Lock,
  Plus,
  RefreshCw,
  Shield,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { formatRemainingAccessTime } from '../utils/accessTimer';
import { formatDateTimeInTimeZone, getBrowserTimeZone, normalizeTimeZone } from '../utils/timezone';
import { resolveApiUrl } from '../utils/urlHelpers';

export interface AdminTestAccountItem {
  id: string;
  email: string;
  note: string;
  createdAt: number;
  expiresAt: number;
  revoked: boolean;
  status: 'active' | 'expired' | 'revoked';
}

interface GeneratedCredentialPreview {
  id: string;
  email: string;
  password: string;
  note: string;
  createdAt: number;
  expiresAt: number;
}

interface AdminDiagnostics {
  aiConfigured: boolean;
  sessionSecretConfigured: boolean;
  persistentDataDirConfigured: boolean;
  authSource: 'env' | 'claimed' | 'none';
}

interface AdminPanelProps {
  token: string;
  adminEmail: string;
  timezone?: string;
  onBackToTerminal: () => void;
  onSessionExpired: (message: string) => void;
}

type FilterMode = 'all' | 'active' | 'blocked';

const AccountCountdownRowCell: React.FC<{
  expiresAt: number;
  clockOffsetMs: number;
  onReachExpiry?: () => void;
}> = React.memo(({ expiresAt, clockOffsetMs, onReachExpiry }) => {
  const [tick, setTick] = useState<number>(() => Date.now());
  const triggeredRef = useRef(false);
  const onReachExpiryRef = useRef(onReachExpiry);

  useEffect(() => {
    onReachExpiryRef.current = onReachExpiry;
  }, [onReachExpiry]);

  useEffect(() => {
    triggeredRef.current = false;
    const id = setInterval(() => {
      const now = Date.now();
      setTick(now);
      if (now + clockOffsetMs >= expiresAt && !triggeredRef.current) {
        triggeredRef.current = true;
        onReachExpiryRef.current?.();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [expiresAt, clockOffsetMs]);

  const timer = formatRemainingAccessTime(expiresAt, tick + clockOffsetMs);
  if (timer.isExpired) {
    return <span className="text-slate-500">00h 00m 00s</span>;
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 ${
        timer.isExpiringSoon ? 'text-amber-300' : 'text-slate-200'
      }`}
    >
      <Clock className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
      <span>{timer.formatted}</span>
    </span>
  );
});

export const AdminPanel: React.FC<AdminPanelProps> = ({
  token,
  adminEmail,
  timezone,
  onBackToTerminal,
  onSessionExpired,
}) => {
  const [accounts, setAccounts] = useState<AdminTestAccountItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [customEmail, setCustomEmail] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [generatedCredential, setGeneratedCredential] =
    useState<GeneratedCredentialPreview | null>(null);
  const [copiedField, setCopiedField] = useState<'all' | 'email' | 'password' | null>(null);
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [diagnostics, setDiagnostics] = useState<AdminDiagnostics | null>(null);

  // Only recalculate static table status/counts on API updates or when a row crosses expiration
  const [statusAnchorMs, setStatusAnchorMs] = useState<number>(() => Date.now());
  const [clockOffsetMs, setClockOffsetMs] = useState<number>(0);

  const authHeaders = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : undefined),
    [token]
  );

  const effectiveNow = statusAnchorMs + clockOffsetMs;

  const fetchAccounts = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(resolveApiUrl('/api/admin/test-users'), {
        credentials: 'include',
        headers: authHeaders,
      });
      if (res.status === 401 || res.status === 403) {
        onSessionExpired('Sessão de administrador expirada ou inválida.');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(data.error || 'Erro ao carregar credenciais temporárias.');
        return;
      }
      setStatusAnchorMs(Date.now());
      if (typeof data.serverNow === 'number') {
        setClockOffsetMs(data.serverNow - Date.now());
      }
      if (data.diagnostics && typeof data.diagnostics === 'object') {
        setDiagnostics(data.diagnostics as AdminDiagnostics);
      }
      setAccounts(Array.isArray(data.accounts) ? data.accounts : []);
    } catch {
      setErrorMsg('Erro de ligação ao carregar painel administrativo.');
    } finally {
      setIsLoading(false);
    }
  }, [authHeaders, onSessionExpired]);

  useEffect(() => {
    void fetchAccounts();
  }, [fetchAccounts]);

  const handleCreateTemporaryAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    setErrorMsg(null);
    try {
      const res = await fetch(resolveApiUrl('/api/admin/test-users'), {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(authHeaders || {}),
        },
        body: JSON.stringify({
          email: customEmail.trim(),
          note: noteInput.trim(),
        }),
      });

      if (res.status === 401 || res.status === 403) {
        onSessionExpired('Sessão de administrador expirada.');
        return;
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(data.error || 'Não foi possível gerar a credencial temporária.');
        return;
      }

      setStatusAnchorMs(Date.now());
      if (typeof data.serverNow === 'number') {
        setClockOffsetMs(data.serverNow - Date.now());
      }
      if (data.credential) {
        setGeneratedCredential(data.credential);
      }
      if (data.account) {
        setAccounts((prev) => [data.account, ...prev.filter((a) => a.id !== data.account.id)]);
      }
      setCustomEmail('');
      setNoteInput('');
      setCopiedField(null);
    } catch {
      setErrorMsg('Erro de comunicação ao gerar credencial de teste.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleRevokeAccount = async (id: string) => {
    setErrorMsg(null);
    try {
      const res = await fetch(
        resolveApiUrl(`/api/admin/test-users/${encodeURIComponent(id)}/revoke`),
        {
          method: 'POST',
          credentials: 'include',
          headers: authHeaders,
        }
      );
      if (res.status === 401 || res.status === 403) {
        onSessionExpired('Sessão de administrador expirada.');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data.accounts)) {
        setStatusAnchorMs(Date.now());
        setAccounts(data.accounts);
      } else {
        setErrorMsg(data.error || 'Falha ao revogar acesso.');
      }
    } catch {
      setErrorMsg('Erro de comunicação ao revogar acesso.');
    }
  };

  const handleDeleteAccount = async (id: string) => {
    setErrorMsg(null);
    try {
      const res = await fetch(resolveApiUrl(`/api/admin/test-users/${encodeURIComponent(id)}`), {
        method: 'DELETE',
        credentials: 'include',
        headers: authHeaders,
      });
      if (res.status === 401 || res.status === 403) {
        onSessionExpired('Sessão de administrador expirada.');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data.accounts)) {
        setStatusAnchorMs(Date.now());
        setAccounts(data.accounts);
        if (generatedCredential?.id === id) {
          setGeneratedCredential(null);
        }
      } else {
        setErrorMsg(data.error || 'Falha ao remover registo.');
      }
    } catch {
      setErrorMsg('Erro de comunicação ao remover registo.');
    }
  };

  const handleCopyText = async (text: string, field: 'all' | 'email' | 'password') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2200);
    } catch {
      // Clipboard fallback ignored cleanly
    }
  };

  const handleRowReachExpiry = useCallback(() => {
    setStatusAnchorMs(Date.now());
  }, []);

  const liveAccounts = useMemo(() => {
    return accounts.map((acc) => {
      const isExpired = effectiveNow >= acc.expiresAt;
      const liveStatus: 'active' | 'expired' | 'revoked' = acc.revoked
        ? 'revoked'
        : isExpired
        ? 'expired'
        : 'active';
      return {
        ...acc,
        liveStatus,
      };
    });
  }, [accounts, effectiveNow]);

  const counts = useMemo(() => {
    let active = 0;
    let blocked = 0;
    for (const acc of liveAccounts) {
      if (acc.liveStatus === 'active') active += 1;
      else blocked += 1;
    }
    return { total: liveAccounts.length, active, blocked };
  }, [liveAccounts]);

  const filteredAccounts = useMemo(() => {
    if (filterMode === 'active') return liveAccounts.filter((a) => a.liveStatus === 'active');
    if (filterMode === 'blocked') return liveAccounts.filter((a) => a.liveStatus !== 'active');
    return liveAccounts;
  }, [liveAccounts, filterMode]);

  const activeTimezone = normalizeTimeZone(timezone, getBrowserTimeZone());
  const formatDateTime = (ts: number) => formatDateTimeInTimeZone(ts, activeTimezone, true);

  return (
    <section
      aria-label="Painel de Administração"
      className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6"
    >
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <Shield className="w-5 h-5 text-[#8b6dff]" aria-hidden="true" />
            <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
              Painel de Administração
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Sessão autenticada como <span className="text-slate-200 font-medium">{adminEmail}</span>{' '}
            · Gere credenciais temporárias com bloqueio automático após 24 horas.
          </p>
        </div>

        <button
          type="button"
          onClick={onBackToTerminal}
          className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-medium text-slate-200 flex items-center gap-2 self-start sm:self-auto whitespace-nowrap shrink-0 cursor-pointer transition-colors"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          <span>Voltar ao Terminal</span>
        </button>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-400">Acessos Temporários Ativos</p>
          <p className="text-2xl font-bold text-emerald-400 tabular-nums mt-1">{counts.active}</p>
        </div>
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-400">Contas Expiradas / Bloqueadas</p>
          <p className="text-2xl font-bold text-rose-400 tabular-nums mt-1">{counts.blocked}</p>
        </div>
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-400">Total de Credenciais Geradas</p>
          <p className="text-2xl font-bold text-white tabular-nums mt-1">{counts.total}</p>
        </div>
      </div>

      {/* Render / Production Environment Diagnostics (Admin Only) */}
      {diagnostics && (
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-200">
              Estado do Ambiente no Servidor (Deploy)
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              Auth: {diagnostics.authSource === 'env' ? 'Variáveis Render (ADMIN_*)' : 'Primeiro Acesso'}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs">
            <div
              className={`rounded-lg border px-3 py-2 flex items-center gap-2 ${
                diagnostics.aiConfigured
                  ? 'bg-emerald-950/30 border-emerald-800/50 text-emerald-300'
                  : 'bg-amber-950/30 border-amber-800/50 text-amber-300'
              }`}
            >
              {diagnostics.aiConfigured ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
              ) : (
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
              )}
              <span>
                GEMINI_API_KEY: {diagnostics.aiConfigured ? 'Ativa' : 'Não Configurada'}
              </span>
            </div>

            <div
              className={`rounded-lg border px-3 py-2 flex items-center gap-2 ${
                diagnostics.sessionSecretConfigured
                  ? 'bg-emerald-950/30 border-emerald-800/50 text-emerald-300'
                  : 'bg-amber-950/30 border-amber-800/50 text-amber-300'
              }`}
            >
              {diagnostics.sessionSecretConfigured ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
              ) : (
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
              )}
              <span>
                AUTH_SESSION_SECRET:{' '}
                {diagnostics.sessionSecretConfigured ? 'Fixo (Seguro)' : 'Efêmero (Reinicia)'}
              </span>
            </div>

            <div
              className={`rounded-lg border px-3 py-2 flex items-center gap-2 ${
                diagnostics.persistentDataDirConfigured
                  ? 'bg-emerald-950/30 border-emerald-800/50 text-emerald-300'
                  : 'bg-slate-900/70 border-slate-700/70 text-slate-300'
              }`}
            >
              {diagnostics.persistentDataDirConfigured ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
              ) : (
                <Clock className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
              )}
              <span>
                DATA_DIR:{' '}
                {diagnostics.persistentDataDirConfigured
                  ? 'Disco Persistente'
                  : 'Local (Plano Free)'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Error Banner */}
      {errorMsg && (
        <div
          role="alert"
          className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/35 text-rose-300 text-xs flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" aria-hidden="true" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-xs text-slate-300 hover:text-white cursor-pointer"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Generator Form */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-1">
          <KeyRound className="w-4 h-4 text-[#8b6dff]" aria-hidden="true" />
          <h2 className="text-base font-bold text-white">
            Gerar Credenciais Temporárias de Teste (24 Horas)
          </h2>
        </div>
        <p className="text-xs text-slate-400 mb-5">
          Gera automaticamente um e-mail e palavra-passe únicos com validade exata de 24 horas a
          partir da criação.
        </p>

        <form onSubmit={handleCreateTemporaryAccount} className="grid grid-cols-1 md:grid-cols-12 gap-3.5">
          <div className="md:col-span-5">
            <label htmlFor="temp-email" className="block text-xs font-medium text-slate-300 mb-1.5">
              E-mail de Teste (opcional)
            </label>
            <input
              id="temp-email"
              type="email"
              value={customEmail}
              onChange={(e) => setCustomEmail(e.target.value)}
              placeholder="Vazio = gerar automático (teste.xxxx@nextcandle.ai)"
              className="w-full h-11 px-3.5 rounded-lg bg-[#0b0f19] border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#7c5dfa]"
            />
          </div>

          <div className="md:col-span-4">
            <label htmlFor="temp-note" className="block text-xs font-medium text-slate-300 mb-1.5">
              Identificação / Nota (opcional)
            </label>
            <input
              id="temp-note"
              type="text"
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              placeholder="Ex: Cliente avaliação 24h"
              maxLength={80}
              className="w-full h-11 px-3.5 rounded-lg bg-[#0b0f19] border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#7c5dfa]"
            />
          </div>

          <div className="md:col-span-3 flex items-end">
            <button
              type="submit"
              disabled={isCreating}
              className="w-full h-11 px-4 rounded-lg bg-[#7c5dfa] hover:bg-[#6d4ef2] disabled:opacity-60 text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap shrink-0 transition-colors"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>{isCreating ? 'A gerar...' : 'Gerar Acesso 24h'}</span>
            </button>
          </div>
        </form>

        {/* One-Time Newly Generated Credential Output */}
        {generatedCredential && (
          <div
            data-testid="generated-credential-box"
            className="mt-5 p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/40 space-y-3"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-emerald-300 text-xs font-semibold">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
                <span>
                  Credencial gerada com sucesso — expira automaticamente em{' '}
                  {formatDateTime(generatedCredential.expiresAt)}
                </span>
              </div>

              <button
                type="button"
                onClick={() =>
                  void handleCopyText(
                    `NextCandle.AI - Acesso Temporário (24h)\nEmail: ${generatedCredential.email}\nSenha: ${generatedCredential.password}\nVálido até: ${formatDateTime(
                      generatedCredential.expiresAt
                    )}`,
                    'all'
                  )
                }
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 self-start sm:self-auto cursor-pointer whitespace-nowrap shrink-0"
              >
                {copiedField === 'all' ? (
                  <Check className="w-3.5 h-3.5" aria-hidden="true" />
                ) : (
                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                )}
                <span>{copiedField === 'all' ? 'Copiado!' : 'Copiar Tudo'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="bg-[#0b0f19] border border-slate-800 rounded-lg px-3 py-2.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-slate-400 block text-[11px]">Email Temporário</span>
                  <span
                    data-testid="generated-email"
                    className="font-mono text-white font-semibold truncate block"
                  >
                    {generatedCredential.email}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void handleCopyText(generatedCredential.email, 'email')}
                  aria-label="Copiar email temporário"
                  className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer shrink-0"
                >
                  {copiedField === 'email' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>

              <div className="bg-[#0b0f19] border border-slate-800 rounded-lg px-3 py-2.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-slate-400 block text-[11px]">
                    Palavra-passe Temporária (exibida apenas agora)
                  </span>
                  <span
                    data-testid="generated-password"
                    className="font-mono text-emerald-300 font-semibold truncate block"
                  >
                    {generatedCredential.password}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void handleCopyText(generatedCredential.password, 'password')}
                  aria-label="Copiar palavra-passe temporária"
                  className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer shrink-0"
                >
                  {copiedField === 'password' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Temporary Accounts Table / List */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <h2 className="text-base font-bold text-white">Contas Temporárias (Validade 24h)</h2>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 p-1 bg-[#0b0f19] border border-slate-800 rounded-lg">
              {(
                [
                  { key: 'all', label: `Todas (${counts.total})` },
                  { key: 'active', label: `Ativas (${counts.active})` },
                  { key: 'blocked', label: `Bloqueadas (${counts.blocked})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setFilterMode(tab.key)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    filterMode === tab.key
                      ? 'bg-[#7c5dfa] text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => void fetchAccounts()}
              aria-label="Atualizar lista de contas temporárias"
              className="p-2 rounded-lg bg-[#0b0f19] border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {isLoading && accounts.length === 0 ? (
          <p className="text-xs text-slate-400 py-8 text-center">
            A carregar credenciais temporárias...
          </p>
        ) : filteredAccounts.length === 0 ? (
          <div className="py-10 text-center border border-dashed border-slate-800 rounded-xl">
            <p className="text-sm text-slate-300 font-medium">
              Nenhuma credencial temporária encontrada neste filtro.
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Utilize o formulário acima para gerar uma credencial válida por 24 horas.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-2.5 pr-4 font-medium">E-mail</th>
                  <th className="py-2.5 pr-4 font-medium">Estado</th>
                  <th className="py-2.5 pr-4 font-medium">Tempo Restante</th>
                  <th className="py-2.5 pr-4 font-medium">Expira em</th>
                  <th className="py-2.5 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {filteredAccounts.map((acc) => (
                  <tr key={acc.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 pr-4">
                      <span className="font-mono text-white font-medium block">{acc.email}</span>
                      {acc.note && (
                        <span className="text-[11px] text-slate-400 block mt-0.5">{acc.note}</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      {acc.liveStatus === 'active' ? (
                        <span className="inline-flex items-center gap-1.5 text-emerald-400 font-medium">
                          <UserCheck className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Ativa (24h)</span>
                        </span>
                      ) : acc.liveStatus === 'expired' ? (
                        <span className="inline-flex items-center gap-1.5 text-rose-400 font-medium">
                          <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Bloqueada (Expirada)</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-amber-400 font-medium">
                          <Ban className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Revogada</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap font-mono tabular-nums">
                      {acc.liveStatus === 'active' ? (
                        <AccountCountdownRowCell
                          expiresAt={acc.expiresAt}
                          clockOffsetMs={clockOffsetMs}
                          onReachExpiry={handleRowReachExpiry}
                        />
                      ) : (
                        <span className="text-slate-500">00h 00m 00s</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap font-mono tabular-nums text-slate-400">
                      {formatDateTime(acc.expiresAt)}
                    </td>
                    <td className="py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-2">
                        {acc.liveStatus === 'active' && (
                          <button
                            type="button"
                            onClick={() => void handleRevokeAccount(acc.id)}
                            className="px-2.5 py-1 rounded bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-[11px] font-medium cursor-pointer"
                          >
                            Bloquear
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void handleDeleteAccount(acc.id)}
                          aria-label={`Remover ${acc.email}`}
                          className="p-1.5 rounded bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-300 border border-slate-700 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
};
