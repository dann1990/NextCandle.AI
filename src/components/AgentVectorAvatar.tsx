import React from 'react';

export type AgentCharacterId = 'price_action' | 'indicators' | 'flow_volatility' | 'predictive_ml' | 'confluence_risk';

export interface AgentCharacterInfo {
  id: AgentCharacterId;
  fictionalName: string;
  gender: 'female' | 'male';
  specialty: string;
  accentColor: string;
}

export const AGENT_CHARACTERS: Record<AgentCharacterId, AgentCharacterInfo> = {
  price_action: {
    id: 'price_action',
    fictionalName: 'Sofia Alencar',
    gender: 'female',
    specialty: 'Especialista em Price Action & Estrutura',
    accentColor: 'emerald',
  },
  indicators: {
    id: 'indicators',
    fictionalName: 'Dr. Lucas Vance',
    gender: 'male',
    specialty: 'Engenheiro de Indicadores & Osciladores',
    accentColor: 'cyan',
  },
  flow_volatility: {
    id: 'flow_volatility',
    fictionalName: 'Elena Rostova',
    gender: 'female',
    specialty: 'Analista de Fluxo Delta & Volatilidade',
    accentColor: 'purple',
  },
  predictive_ml: {
    id: 'predictive_ml',
    fictionalName: 'Gabriel Chen',
    gender: 'male',
    specialty: 'Cientista de Dados & Séries Temporais',
    accentColor: 'amber',
  },
  confluence_risk: {
    id: 'confluence_risk',
    fictionalName: 'Marcus Sterling',
    gender: 'male',
    specialty: 'Juiz Chefe de Confluência & Risco',
    accentColor: 'indigo',
  },
};

interface AgentVectorAvatarProps {
  agentId: AgentCharacterId | string;
  size?: number;
  className?: string;
}

export const AgentVectorAvatar: React.FC<AgentVectorAvatarProps> = ({
  agentId,
  size = 48,
  className = '',
}) => {
  const normId = (agentId in AGENT_CHARACTERS ? agentId : 'confluence_risk') as AgentCharacterId;

  switch (normId) {
    case 'price_action':
      // Sofia Alencar (Mulher 1 - Price Action): Dark sleek bun, emerald earrings, analytical gaze
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`shrink-0 rounded-full border border-emerald-500/40 shadow-sm shadow-emerald-500/20 bg-slate-900 ${className}`}
        >
          <defs>
            <linearGradient id="sofia-bg" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
              <stop stopColor="#064e3b" />
              <stop offset="1" stopColor="#022c22" />
            </linearGradient>
            <linearGradient id="sofia-skin" x1="50" y1="20" x2="50" y2="70" gradientUnits="userSpaceOnUse">
              <stop stopColor="#fcd34d" />
              <stop offset="1" stopColor="#f59e0b" />
            </linearGradient>
            <linearGradient id="sofia-hair" x1="20" y1="10" x2="80" y2="60" gradientUnits="userSpaceOnUse">
              <stop stopColor="#1e1b4b" />
              <stop offset="1" stopColor="#0f172a" />
            </linearGradient>
          </defs>
          {/* Background circle */}
          <circle cx="50" cy="50" r="48" fill="url(#sofia-bg)" stroke="#10b981" strokeWidth="2" strokeOpacity="0.4" />
          
          {/* Hair back bun */}
          <circle cx="50" cy="22" r="14" fill="url(#sofia-hair)" />

          {/* Shoulders & Business Collar */}
          <path d="M22 92 C26 74 38 68 50 68 C62 68 74 74 78 92 Z" fill="#0f172a" />
          <path d="M38 72 L50 86 L62 72 L50 68 Z" fill="#047857" />
          <path d="M44 80 L50 96 L56 80 Z" fill="#10b981" opacity="0.8" />

          {/* Neck */}
          <path d="M44 56 H56 V68 H44 Z" fill="#d97706" />

          {/* Face base */}
          <path d="M32 38 C32 26 68 26 68 38 C68 54 58 64 50 64 C42 64 32 54 32 38 Z" fill="url(#sofia-skin)" />

          {/* Hair front sleek frame */}
          <path d="M30 36 C34 22 66 22 70 36 C64 30 54 28 50 28 C46 28 36 30 30 36 Z" fill="url(#sofia-hair)" />
          <path d="M31 36 C31 46 34 50 35 52 C33 46 32 40 31 36 Z" fill="url(#sofia-hair)" />
          <path d="M69 36 C69 46 66 50 65 52 C67 46 68 40 69 36 Z" fill="url(#sofia-hair)" />

          {/* Eyes & Brows */}
          <path d="M37 38 Q42 36 45 38" stroke="#0f172a" strokeWidth="2" strokeLinecap="round" />
          <path d="M55 38 Q58 36 63 38" stroke="#0f172a" strokeWidth="2" strokeLinecap="round" />
          <ellipse cx="41" cy="42" rx="3" ry="2.2" fill="#0f172a" />
          <circle cx="42" cy="41" r="0.9" fill="#ffffff" />
          <ellipse cx="59" cy="42" rx="3" ry="2.2" fill="#0f172a" />
          <circle cx="60" cy="41" r="0.9" fill="#ffffff" />

          {/* Nose & Smile */}
          <path d="M50 43 V48 L52 49" stroke="#b45309" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M45 54 Q50 58 55 54" stroke="#991b1b" strokeWidth="2" strokeLinecap="round" />

          {/* Emerald Earring */}
          <circle cx="31" cy="48" r="2.5" fill="#10b981" />
          <circle cx="69" cy="48" r="2.5" fill="#10b981" />
        </svg>
      );

    case 'indicators':
      // Dr. Lucas Vance (Homem 1 - Indicadores): Smart tech glasses, neat hair, beard, cyan glow
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`shrink-0 rounded-full border border-cyan-500/40 shadow-sm shadow-cyan-500/20 bg-slate-900 ${className}`}
        >
          <defs>
            <linearGradient id="lucas-bg" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
              <stop stopColor="#083344" />
              <stop offset="1" stopColor="#0f172a" />
            </linearGradient>
            <linearGradient id="lucas-skin" x1="50" y1="20" x2="50" y2="70" gradientUnits="userSpaceOnUse">
              <stop stopColor="#fed7aa" />
              <stop offset="1" stopColor="#fba464" />
            </linearGradient>
          </defs>
          <circle cx="50" cy="50" r="48" fill="url(#lucas-bg)" stroke="#06b6d4" strokeWidth="2" strokeOpacity="0.4" />

          {/* Shoulders & Modern Tech Sweater */}
          <path d="M22 92 C26 73 37 67 50 67 C63 67 74 73 78 92 Z" fill="#1e293b" />
          <path d="M42 69 L50 80 L58 69 Z" fill="#0891b2" />

          {/* Neck */}
          <path d="M43 56 H57 V68 H43 Z" fill="#ea580c" opacity="0.6" />

          {/* Head & Jaw */}
          <path d="M31 36 C31 24 69 24 69 36 C69 52 61 64 50 64 C39 64 31 52 31 36 Z" fill="url(#lucas-skin)" />

          {/* Short neat styled hair */}
          <path d="M29 34 C29 20 50 16 68 20 C72 26 71 34 69 36 C67 30 63 26 50 26 C38 26 33 29 29 34 Z" fill="#334155" />

          {/* Beard / Stubble */}
          <path d="M35 48 C35 58 43 65 50 65 C57 65 65 58 65 48 C65 54 58 62 50 62 C42 62 35 54 35 48 Z" fill="#475569" opacity="0.8" />

          {/* Tech Glasses (Cyan frame) */}
          <rect x="33" y="37" width="14" height="10" rx="2" stroke="#06b6d4" strokeWidth="2" fill="#083344" fillOpacity="0.6" />
          <rect x="53" y="37" width="14" height="10" rx="2" stroke="#06b6d4" strokeWidth="2" fill="#083344" fillOpacity="0.6" />
          <path d="M47 41 H53" stroke="#06b6d4" strokeWidth="2" />
          {/* Eyes behind glasses */}
          <circle cx="40" cy="42" r="2" fill="#38bdf8" />
          <circle cx="60" cy="42" r="2" fill="#38bdf8" />

          {/* Nose & Mouth */}
          <path d="M50 44 V50 L52 51" stroke="#c2410c" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M45 56 Q50 58 55 56" stroke="#475569" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );

    case 'flow_volatility':
      // Elena Rostova (Mulher 2 - Fluxo e Volatilidade): Auburn/copper styled bob hair, sharp purple detail
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`shrink-0 rounded-full border border-purple-500/40 shadow-sm shadow-purple-500/20 bg-slate-900 ${className}`}
        >
          <defs>
            <linearGradient id="elena-bg" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
              <stop stopColor="#3b0764" />
              <stop offset="1" stopColor="#0f172a" />
            </linearGradient>
            <linearGradient id="elena-skin" x1="50" y1="20" x2="50" y2="70" gradientUnits="userSpaceOnUse">
              <stop stopColor="#fef3c7" />
              <stop offset="1" stopColor="#fde68a" />
            </linearGradient>
            <linearGradient id="elena-hair" x1="20" y1="15" x2="80" y2="65" gradientUnits="userSpaceOnUse">
              <stop stopColor="#9a3412" />
              <stop offset="1" stopColor="#7c2d12" />
            </linearGradient>
          </defs>
          <circle cx="50" cy="50" r="48" fill="url(#elena-bg)" stroke="#a855f7" strokeWidth="2" strokeOpacity="0.4" />

          {/* Shoulders & Blazer */}
          <path d="M22 92 C26 73 37 67 50 67 C63 67 74 73 78 92 Z" fill="#1e1b4b" />
          <path d="M38 70 L50 86 L62 70 Z" fill="#9333ea" opacity="0.8" />

          {/* Neck */}
          <path d="M44 56 H56 V68 H44 Z" fill="#d97706" opacity="0.4" />

          {/* Face */}
          <path d="M32 37 C32 25 68 25 68 37 C68 53 59 63 50 63 C41 63 32 53 32 37 Z" fill="url(#elena-skin)" />

          {/* Layered Auburn Bob Hair */}
          <path d="M26 36 C26 18 74 18 74 36 C74 54 70 60 67 62 C68 50 67 36 63 30 C55 24 45 24 37 30 C33 36 32 50 33 62 C30 60 26 54 26 36 Z" fill="url(#elena-hair)" />

          {/* Eyes & Brows */}
          <path d="M37 36 Q42 34 46 36" stroke="#431407" strokeWidth="2" strokeLinecap="round" />
          <path d="M54 36 Q58 34 63 36" stroke="#431407" strokeWidth="2" strokeLinecap="round" />
          <ellipse cx="41" cy="41" rx="3" ry="2.2" fill="#431407" />
          <circle cx="42" cy="40" r="0.9" fill="#c084fc" />
          <ellipse cx="59" cy="41" rx="3" ry="2.2" fill="#431407" />
          <circle cx="60" cy="40" r="0.9" fill="#c084fc" />

          {/* Nose & Confident Smile */}
          <path d="M50 43 V48 L52 49" stroke="#b45309" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M45 54 Q50 57 55 54" stroke="#a21caf" strokeWidth="2" strokeLinecap="round" />

          {/* Violet Cyber Ear Cuff */}
          <circle cx="31" cy="44" r="2.5" fill="#a855f7" />
          <circle cx="31" cy="48" r="1.8" fill="#c084fc" />
        </svg>
      );

    case 'predictive_ml':
      // Gabriel Chen (Homem 2 - ML & Séries Temporais): Young focused data analyst, textured dark hair, amber neural accent
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`shrink-0 rounded-full border border-amber-500/40 shadow-sm shadow-amber-500/20 bg-slate-900 ${className}`}
        >
          <defs>
            <linearGradient id="gabriel-bg" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
              <stop stopColor="#451a03" />
              <stop offset="1" stopColor="#0f172a" />
            </linearGradient>
            <linearGradient id="gabriel-skin" x1="50" y1="20" x2="50" y2="70" gradientUnits="userSpaceOnUse">
              <stop stopColor="#ffedd5" />
              <stop offset="1" stopColor="#fed7aa" />
            </linearGradient>
          </defs>
          <circle cx="50" cy="50" r="48" fill="url(#gabriel-bg)" stroke="#f59e0b" strokeWidth="2" strokeOpacity="0.4" />

          {/* Shoulders & Tech Hoodie */}
          <path d="M22 92 C26 73 37 67 50 67 C63 67 74 73 78 92 Z" fill="#1c1917" />
          <path d="M40 70 L50 82 L60 70 Z" fill="#d97706" opacity="0.8" />

          {/* Neck */}
          <path d="M44 56 H56 V68 H44 Z" fill="#f97316" opacity="0.3" />

          {/* Face base */}
          <path d="M32 36 C32 24 68 24 68 36 C68 53 60 63 50 63 C40 63 32 53 32 36 Z" fill="url(#gabriel-skin)" />

          {/* Spiky / Textured Dark Hair */}
          <path d="M28 32 C27 20 42 15 50 15 C60 15 72 18 72 32 C68 24 62 23 54 23 C46 23 34 25 28 32 Z" fill="#18181b" />
          <path d="M33 24 L37 18 L43 23 L48 16 L54 22 L61 17 L65 24 Z" fill="#18181b" />

          {/* Eyes & Brows */}
          <path d="M37 36 Q42 34 46 35" stroke="#18181b" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M54 35 Q58 34 63 36" stroke="#18181b" strokeWidth="2.2" strokeLinecap="round" />
          <ellipse cx="41" cy="41" rx="3.2" ry="2.2" fill="#18181b" />
          <circle cx="42" cy="40" r="1" fill="#f59e0b" />
          <ellipse cx="59" cy="41" rx="3.2" ry="2.2" fill="#18181b" />
          <circle cx="60" cy="40" r="1" fill="#f59e0b" />

          {/* Nose & Calm focused expression */}
          <path d="M50 43 V49 L52 50" stroke="#ea580c" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M45 55 H55" stroke="#78350f" strokeWidth="2" strokeLinecap="round" />

          {/* Amber Data Lapel / Neural Pin */}
          <circle cx="68" cy="74" r="2.5" fill="#f59e0b" />
          <circle cx="68" cy="74" r="1" fill="#ffffff" />
        </svg>
      );

    case 'confluence_risk':
    default:
      // Marcus Sterling (Homem 3 - Juiz de Confluência & Risco): Distinguished senior head, grey temples, commanding authoritative look
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`shrink-0 rounded-full border border-indigo-500/40 shadow-sm shadow-indigo-500/20 bg-slate-900 ${className}`}
        >
          <defs>
            <linearGradient id="marcus-bg" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
              <stop stopColor="#1e1b4b" />
              <stop offset="1" stopColor="#0f172a" />
            </linearGradient>
            <linearGradient id="marcus-skin" x1="50" y1="20" x2="50" y2="70" gradientUnits="userSpaceOnUse">
              <stop stopColor="#ffedd5" />
              <stop offset="1" stopColor="#fdba74" />
            </linearGradient>
          </defs>
          <circle cx="50" cy="50" r="48" fill="url(#marcus-bg)" stroke="#6366f1" strokeWidth="2" strokeOpacity="0.4" />

          {/* Shoulders & Institutional Suit with Tie */}
          <path d="M22 92 C26 73 37 67 50 67 C63 67 74 73 78 92 Z" fill="#0f172a" />
          <path d="M42 68 L50 92 L58 68 Z" fill="#ffffff" opacity="0.9" />
          <path d="M47 72 L50 92 L53 72 Z" fill="#4f46e5" />

          {/* Neck */}
          <path d="M43 56 H57 V68 H43 Z" fill="#fb923c" opacity="0.4" />

          {/* Square strong jaw & face */}
          <path d="M31 36 C31 24 69 24 69 36 C69 53 62 64 50 64 C38 64 31 53 31 36 Z" fill="url(#marcus-skin)" />

          {/* Silver / Grey Temples & Hair */}
          <path d="M29 34 C29 20 48 18 69 20 C71 28 69 36 67 36 C64 28 60 25 50 25 C39 25 34 28 31 36 Z" fill="#64748b" />
          <path d="M29 34 C30 28 33 25 36 24 C33 28 31 32 30 36 Z" fill="#cbd5e1" />
          <path d="M71 34 C70 28 67 25 64 24 C67 28 69 32 70 36 Z" fill="#cbd5e1" />

          {/* Determined Brows & Eyes */}
          <path d="M36 36 Q42 33 46 36" stroke="#334155" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M54 36 Q58 33 64 36" stroke="#334155" strokeWidth="2.5" strokeLinecap="round" />
          <ellipse cx="41" cy="41" rx="3" ry="2.2" fill="#0f172a" />
          <circle cx="42" cy="40" r="0.9" fill="#818cf8" />
          <ellipse cx="59" cy="41" rx="3" ry="2.2" fill="#0f172a" />
          <circle cx="60" cy="40" r="0.9" fill="#818cf8" />

          {/* Nose & Firm Line */}
          <path d="M50 43 V49 L53 50" stroke="#c2410c" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M44 56 Q50 57 56 56" stroke="#1e293b" strokeWidth="2" strokeLinecap="round" />

          {/* Chief Judge Gold / Indigo Shield Pin */}
          <polygon points="50,72 52,76 50,80 48,76" fill="#fbbf24" />
        </svg>
      );
  }
};
