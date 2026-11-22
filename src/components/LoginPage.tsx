import React, { useEffect, useState } from 'react';
import { AlertCircle, ArrowRight, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { NextCandleBrandLogo } from './NextCandleBrandLogo';

export interface AuthSessionState {
  token: string;
  email: string;
  role: 'admin' | 'tester';
  expiresAt: number | null;
  clockOffsetMs: number;
}

interface LoginPageProps {
  authMode: 'login' | 'setup';
  initialNotice?: string | null;
  onAuthenticated: (session: AuthSessionState) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  authMode,
  initialNotice,
  onAuthenticated,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(initialNotice || null);

  useEffect(() => {
    if (initialNotice) {
      setErrorMsg(initialNotice);
    }
  }, [initialNotice]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmedEmail)) {
      setErrorMsg('Introduz um endereço de email válido.');
      return;
    }
    if (password.length < 6) {
      setErrorMsg('A palavra-passe deve ter pelo menos 6 caracteres.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    const endpoint = authMode === 'setup' ? '/api/auth/setup' : '/api/auth/login';

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: trimmedEmail,
          password,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        // Fallback smoothly to /api/auth/login if server was already claimed by another session
        if (response.status === 409 && endpoint === '/api/auth/setup') {
          const loginRes = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: trimmedEmail, password }),
          });
          const loginData = await loginRes.json().catch(() => ({}));
          if (loginRes.ok && loginData.token) {
            onAuthenticated({
              token: loginData.token,
              email: loginData.email || trimmedEmail,
              role: loginData.role === 'tester' ? 'tester' : 'admin',
              expiresAt: typeof loginData.expiresAt === 'number' ? loginData.expiresAt : null,
              clockOffsetMs:
                typeof loginData.serverNow === 'number' ? loginData.serverNow - Date.now() : 0,
            });
            return;
          }
          setErrorMsg(loginData.error || 'Email ou palavra-passe inválidos.');
          return;
        }
        setErrorMsg(payload.error || 'Não foi possível iniciar sessão. Verifica os teus dados.');
        return;
      }

      if (payload.token) {
        onAuthenticated({
          token: payload.token,
          email: payload.email || trimmedEmail,
          role: payload.role === 'tester' ? 'tester' : 'admin',
          expiresAt: typeof payload.expiresAt === 'number' ? payload.expiresAt : null,
          clockOffsetMs:
            typeof payload.serverNow === 'number' ? payload.serverNow - Date.now() : 0,
        });
      } else {
        setErrorMsg('Resposta de autenticação inválida do servidor.');
      }
    } catch {
      setErrorMsg('Erro de ligação ao servidor. Tenta novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full grid grid-cols-1 lg:grid-cols-2 bg-[#000000] text-slate-100 overflow-x-hidden">
      {/* Left Brand & Editorial Showcase Panel */}
      <section className="relative overflow-hidden bg-[#0a0a0f] lg:border-r lg:border-white/[0.06] flex flex-col justify-between px-7 py-8 sm:px-12 sm:py-11 lg:px-16 lg:py-12 min-h-[340px] lg:min-h-screen">
        {/* Subtle bottom-right ambient violet depth glow matching reference */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-28 -right-24 w-[460px] h-[460px] rounded-full bg-[#7c5dfa]/[0.09] blur-[110px]"
        />

        {/* Top-left Logo + Brand Wordmark */}
        <div className="relative z-10 flex items-center gap-3">
          <NextCandleBrandLogo variant="icon" className="w-9 h-9 sm:w-10 sm:h-10 shrink-0" />
          <span className="text-xl sm:text-[22px] tracking-tight whitespace-nowrap shrink-0">
            <strong className="font-bold text-white">NextCandle</strong>
            <span className="font-normal text-[#9b9ba8]">.AI</span>
          </span>
        </div>

        {/* Center-left Hero Copy */}
        <div className="relative z-10 my-10 lg:my-auto max-w-[440px]">
          <p className="text-[13px] sm:text-sm font-medium text-[#8b6dff] mb-3.5 tracking-normal">
            Bem-vindo de volta
          </p>
          <h1 className="text-[36px] sm:text-[46px] lg:text-[52px] font-extrabold text-white tracking-[-0.025em] leading-[1.06] text-balance">
            A tua IA
            <br />
            espera por ti.
          </h1>
          <p className="mt-5 text-[16px] text-[#8d8d9e] leading-[1.6] max-w-[440px]">
            Entre e aceda à{' '}
            <strong className="font-semibold text-white">NextCandle.AI</strong>: o futuro da
            análise gráfica.
            <br />
            Conte com superagentes equipados com as melhores estratégias e todo o poder da
            Inteligência Artificial para elevar a assertividade das suas operações.
          </p>
        </div>

        {/* Bottom-left Copyright */}
        <p className="relative z-10 text-xs text-[#6f6f80]">© 2026 NextCandle</p>

        {/* Bottom-right Atmospheric Logo Watermark */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-16 -right-14 sm:-bottom-20 sm:-right-16 w-[280px] sm:w-[420px] lg:w-[490px] opacity-[0.10] lg:opacity-[0.16] mix-blend-screen"
        >
          <NextCandleBrandLogo variant="watermark" className="w-full h-auto" />
        </div>
      </section>

      {/* Right Authentication Form Panel */}
      <main className="bg-[#000000] flex items-center justify-center px-6 py-12 sm:px-12 lg:px-16">
        <div className="w-full max-w-[380px]">
          <div>
            <h2 className="text-[28px] sm:text-[32px] font-bold text-white tracking-tight leading-tight">
              Entrar
            </h2>
            <p className="text-sm text-[#8d8d9e] mt-1.5">Acede à tua conta NextCandle.</p>
          </div>

          <form onSubmit={handleSubmit} noValidate className="mt-8 space-y-5">
            {/* Email Field */}
            <div>
              <label
                htmlFor="login-email"
                className="block text-[13px] font-medium text-[#d4d4dc] mb-2"
              >
                Email
              </label>
              <div className="h-12 rounded-xl bg-[#16171d] border border-[#242631] px-3.5 flex items-center gap-3 transition-colors focus-within:border-[#7c5dfa] focus-within:ring-2 focus-within:ring-[#7c5dfa]/25">
                <Mail className="w-4 h-4 text-[#6d7080] shrink-0" aria-hidden="true" />
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  placeholder="exemplo@email.com"
                  className="w-full bg-transparent text-sm text-white placeholder-[#5c5f6e] focus:outline-none"
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label
                htmlFor="login-password"
                className="block text-[13px] font-medium text-[#d4d4dc] mb-2"
              >
                Password
              </label>
              <div className="h-12 rounded-xl bg-[#16171d] border border-[#242631] px-3.5 flex items-center gap-3 transition-colors focus-within:border-[#7c5dfa] focus-within:ring-2 focus-within:ring-[#7c5dfa]/25">
                <Lock className="w-4 h-4 text-[#6d7080] shrink-0" aria-hidden="true" />
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={authMode === 'setup' ? 'new-password' : 'current-password'}
                  required
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  placeholder="••••••••"
                  className="w-full bg-transparent text-sm text-white placeholder-[#5c5f6e] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Ocultar palavra-passe' : 'Mostrar palavra-passe'}
                  className="p-1.5 -mr-1 text-[#6d7080] hover:text-zinc-300 transition-colors cursor-pointer shrink-0"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" aria-hidden="true" />
                  ) : (
                    <Eye className="w-4 h-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            {/* Subtle First-Run Setup Guidance (hidden once claimed or configured via env) */}
            {authMode === 'setup' && (
              <p className="text-xs text-[#7d7f8e] leading-relaxed">
                Primeiro acesso neste terminal: as credenciais inseridas configuram a conta
                principal de Administrador.
              </p>
            )}

            {/* Inline Validation / Authentication Error */}
            {errorMsg && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/35 text-rose-300 text-xs flex items-start gap-2"
              >
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Primary Violet Pill Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-12 rounded-full bg-[#7c5dfa] hover:bg-[#6d4ef2] active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-[0_8px_24px_rgba(124,93,250,0.28)]"
            >
              <span>{isSubmitting ? 'A entrar...' : 'Entrar'}</span>
              {!isSubmitting && <ArrowRight className="w-4 h-4" aria-hidden="true" />}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
};
