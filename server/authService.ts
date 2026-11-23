import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import { promisify } from 'util';

const scryptAsync = promisify(crypto.scrypt);
export const SESSION_COOKIE_NAME = 'nc_session';

export type UserRole = 'admin' | 'tester';

export interface SessionPayload {
  sub: string;
  role: UserRole;
  testAccountId?: string;
  iat: number;
  exp: number;
  jti: string;
}

export interface ClaimedCredentialRecord {
  email: string;
  salt: string;
  passwordHash: string;
  claimedAt: number;
}

export interface TemporaryTestAccountRecord {
  id: string;
  email: string;
  note?: string;
  salt: string;
  passwordHash: string;
  createdAt: number;
  expiresAt: number;
  revoked: boolean;
  revokedAt?: number;
}

export interface PublicTestAccountInfo {
  id: string;
  email: string;
  note: string;
  createdAt: number;
  expiresAt: number;
  revoked: boolean;
  status: 'active' | 'expired' | 'revoked';
}

export interface AuthValidationResult {
  valid: boolean;
  email: string;
  error?: string;
}

interface RevokedTokenEntry {
  jti: string;
  exp: number;
}

interface PersistedAuthStore {
  claimedAccount: ClaimedCredentialRecord | null;
  testAccounts: TemporaryTestAccountRecord[];
  revokedTokens?: RevokedTokenEntry[];
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN_PASSWORD_LENGTH = 6;
const MAX_PASSWORD_LENGTH = 128;
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours max session token
export const TEST_ACCOUNT_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours automatic expiry

// Ephemeral fallback secret per process when AUTH_SESSION_SECRET is not set
const fallbackSessionSecret = crypto.randomBytes(32).toString('hex');

function getSessionSecret(): string {
  const configured = process.env.AUTH_SESSION_SECRET;
  if (typeof configured === 'string' && configured.trim().length >= 16) {
    return configured.trim();
  }
  return fallbackSessionSecret;
}

export function normalizeEmail(rawEmail: unknown): string {
  if (typeof rawEmail !== 'string') return '';
  return rawEmail.trim().toLowerCase().slice(0, 160);
}

export function validateAuthCredentialsInput(
  rawEmail: unknown,
  rawPassword: unknown
): AuthValidationResult {
  const email = normalizeEmail(rawEmail);
  if (!email || !EMAIL_REGEX.test(email)) {
    return {
      valid: false,
      email,
      error: 'Introduz um endereço de email válido.',
    };
  }

  if (typeof rawPassword !== 'string' || rawPassword.length < MIN_PASSWORD_LENGTH) {
    return {
      valid: false,
      email,
      error: `A palavra-passe deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`,
    };
  }

  if (rawPassword.length > MAX_PASSWORD_LENGTH) {
    return {
      valid: false,
      email,
      error: 'A palavra-passe excede o limite permitido.',
    };
  }

  return { valid: true, email };
}

export function hashPasswordWithSalt(password: string, existingSalt?: string): {
  salt: string;
  hash: string;
} {
  const salt = existingSalt || crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return {
    salt,
    hash: derivedKey.toString('hex'),
  };
}

export async function hashPasswordWithSaltAsync(
  password: string,
  existingSalt?: string
): Promise<{ salt: string; hash: string }> {
  const salt = existingSalt || crypto.randomBytes(16).toString('hex');
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return {
    salt,
    hash: derivedKey.toString('hex'),
  };
}

export function verifyPasswordAgainstHash(
  password: string,
  salt: string,
  expectedHashHex: string
): boolean {
  if (!password || !salt || !expectedHashHex) return false;
  try {
    const derived = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(expectedHashHex, 'hex');
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export async function verifyPasswordAgainstHashAsync(
  password: string,
  salt: string,
  expectedHashHex: string
): Promise<boolean> {
  if (!password || !salt || !expectedHashHex) return false;
  try {
    const derived = (await scryptAsync(password, salt, 64)) as Buffer;
    const expected = Buffer.from(expectedHashHex, 'hex');
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export function constantTimeStringMatch(a: string, b: string): boolean {
  // Hash to fixed 32-byte digests first so string length is never leaked via timing
  const digestA = crypto.createHash('sha256').update(a, 'utf8').digest();
  const digestB = crypto.createHash('sha256').update(b, 'utf8').digest();
  return crypto.timingSafeEqual(digestA, digestB);
}

export function parseCookieHeader(cookieHeader: unknown): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (typeof cookieHeader !== 'string' || !cookieHeader) return cookies;
  for (const part of cookieHeader.split(';')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) continue;
    const name = part.slice(0, eqIdx).trim();
    const val = part.slice(eqIdx + 1).trim();
    if (!name) continue;
    try {
      cookies[name] = decodeURIComponent(val);
    } catch {
      cookies[name] = val;
    }
  }
  return cookies;
}

export function generateTemporaryPassword(length = 12): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += alphabet[crypto.randomInt(0, alphabet.length)];
  }
  return result;
}

export interface AuthManagerOptions {
  storePath?: string | null;
  nowFn?: () => number;
}

export class AuthManager {
  private claimedAccount: ClaimedCredentialRecord | null = null;
  private testAccounts: TemporaryTestAccountRecord[] = [];
  private revokedTokens = new Map<string, number>();
  private writeQueue: Promise<void> = Promise.resolve();
  private readonly storePath: string | null;
  private readonly nowFn: () => number;

  constructor(options: AuthManagerOptions = {}) {
    this.storePath = options.storePath === undefined ? null : options.storePath;
    this.nowFn = options.nowFn || (() => Date.now());
    this.loadStoreFromDisk();
  }

  private pruneExpiredRevocations(now = this.nowFn()): void {
    for (const [jti, exp] of this.revokedTokens.entries()) {
      if (now >= exp) {
        this.revokedTokens.delete(jti);
      }
    }
  }

  private loadStoreFromDisk(): void {
    if (!this.storePath) return;
    try {
      if (!fs.existsSync(this.storePath)) return;
      const raw = fs.readFileSync(this.storePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<PersistedAuthStore>;
      if (parsed.claimedAccount && typeof parsed.claimedAccount.email === 'string') {
        this.claimedAccount = parsed.claimedAccount;
      }
      if (Array.isArray(parsed.testAccounts)) {
        this.testAccounts = parsed.testAccounts.filter(
          (acc) =>
            acc &&
            typeof acc.id === 'string' &&
            typeof acc.email === 'string' &&
            typeof acc.salt === 'string' &&
            typeof acc.passwordHash === 'string' &&
            typeof acc.expiresAt === 'number'
        );
      }
      if (Array.isArray(parsed.revokedTokens)) {
        const now = this.nowFn();
        for (const entry of parsed.revokedTokens) {
          if (
            entry &&
            typeof entry.jti === 'string' &&
            typeof entry.exp === 'number' &&
            entry.exp > now
          ) {
            this.revokedTokens.set(entry.jti, entry.exp);
          }
        }
      }
    } catch {
      // Ignore corrupt/unreadable auth store on boot
    }
  }

  private buildPersistedPayload(): PersistedAuthStore {
    this.pruneExpiredRevocations();
    return {
      claimedAccount: this.claimedAccount,
      testAccounts: this.testAccounts,
      revokedTokens: Array.from(this.revokedTokens.entries()).map(([jti, exp]) => ({ jti, exp })),
    };
  }

  private saveStoreToDisk(): void {
    if (!this.storePath) return;
    try {
      const dir = path.dirname(this.storePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      }
      fs.writeFileSync(this.storePath, JSON.stringify(this.buildPersistedPayload(), null, 2), {
        encoding: 'utf8',
        mode: 0o600,
      });
    } catch {
      // Fail safely without leaking credentials
    }
  }

  private saveStoreToDiskAsync(): Promise<void> {
    if (!this.storePath) return Promise.resolve();
    const targetPath = this.storePath;
    const serialized = JSON.stringify(this.buildPersistedPayload(), null, 2);

    this.writeQueue = this.writeQueue
      .then(async () => {
        const dir = path.dirname(targetPath);
        await fs.promises.mkdir(dir, { recursive: true, mode: 0o700 });
        await fs.promises.writeFile(targetPath, serialized, {
          encoding: 'utf8',
          mode: 0o600,
        });
      })
      .catch(() => {
        // Fail safely without leaking credentials
      });

    return this.writeQueue;
  }

  private cleanEnvCredentialValue(raw: unknown): string {
    if (typeof raw !== 'string') return '';
    let cleaned = raw.replace(/[\r\n]+/g, '').trim();
    if (
      cleaned.length >= 2 &&
      ((cleaned.startsWith('"') && cleaned.endsWith('"')) ||
        (cleaned.startsWith("'") && cleaned.endsWith("'")))
    ) {
      cleaned = cleaned.slice(1, -1).trim();
    }
    return cleaned;
  }

  private getEnvConfiguredCredentials(): { email: string; password: string } | null {
    const envPassword =
      this.cleanEnvCredentialValue(process.env.ADMIN_PASSWORD) ||
      this.cleanEnvCredentialValue(process.env.AUTH_PASSWORD);
    if (!envPassword) {
      return null;
    }
    const envEmail = normalizeEmail(
      this.cleanEnvCredentialValue(process.env.ADMIN_EMAIL) ||
        this.cleanEnvCredentialValue(process.env.AUTH_EMAIL)
    );
    return {
      email: envEmail,
      password: envPassword,
    };
  }

  private getAdminEmail(): string | null {
    const envCreds = this.getEnvConfiguredCredentials();
    if (envCreds?.email) return envCreds.email;
    if (this.claimedAccount?.email) return this.claimedAccount.email;
    return null;
  }

  public isConfigured(): boolean {
    return Boolean(this.getEnvConfiguredCredentials() || this.claimedAccount);
  }

  public getAuthSource(): 'env' | 'claimed' | 'none' {
    if (this.getEnvConfiguredCredentials()) return 'env';
    if (this.claimedAccount) return 'claimed';
    return 'none';
  }

  public getMode(): 'login' | 'setup' {
    return this.isConfigured() ? 'login' : 'setup';
  }

  public setupFirstAccess(rawEmail: unknown, rawPassword: unknown): {
    ok: boolean;
    status: number;
    email?: string;
    role?: UserRole;
    expiresAt?: number | null;
    token?: string;
    error?: string;
  } {
    if (this.isConfigured()) {
      return {
        ok: false,
        status: 409,
        error: 'O acesso de administrador já foi configurado. Utiliza o login com as tuas credenciais.',
      };
    }

    const validation = validateAuthCredentialsInput(rawEmail, rawPassword);
    if (!validation.valid) {
      return {
        ok: false,
        status: 400,
        error: validation.error,
      };
    }

    const now = this.nowFn();
    const { salt, hash } = hashPasswordWithSalt(rawPassword as string);
    this.claimedAccount = {
      email: validation.email,
      salt,
      passwordHash: hash,
      claimedAt: now,
    };
    this.saveStoreToDisk();

    const token = this.issueSessionToken(validation.email, 'admin');
    return {
      ok: true,
      status: 201,
      email: validation.email,
      role: 'admin',
      expiresAt: null,
      token,
    };
  }

  public async setupFirstAccessAsync(rawEmail: unknown, rawPassword: unknown): Promise<{
    ok: boolean;
    status: number;
    email?: string;
    role?: UserRole;
    expiresAt?: number | null;
    token?: string;
    error?: string;
  }> {
    if (this.isConfigured()) {
      return {
        ok: false,
        status: 409,
        error: 'O acesso de administrador já foi configurado. Utiliza o login com as tuas credenciais.',
      };
    }

    const validation = validateAuthCredentialsInput(rawEmail, rawPassword);
    if (!validation.valid) {
      return {
        ok: false,
        status: 400,
        error: validation.error,
      };
    }

    const now = this.nowFn();
    const { salt, hash } = await hashPasswordWithSaltAsync(rawPassword as string);
    // Re-check after async hashing to prevent setup race
    if (this.isConfigured()) {
      return {
        ok: false,
        status: 409,
        error: 'O acesso de administrador já foi configurado. Utiliza o login com as tuas credenciais.',
      };
    }

    this.claimedAccount = {
      email: validation.email,
      salt,
      passwordHash: hash,
      claimedAt: now,
    };
    await this.saveStoreToDiskAsync();

    const token = this.issueSessionToken(validation.email, 'admin');
    return {
      ok: true,
      status: 201,
      email: validation.email,
      role: 'admin',
      expiresAt: null,
      token,
    };
  }

  public authenticate(rawEmail: unknown, rawPassword: unknown): {
    ok: boolean;
    status: number;
    email?: string;
    role?: UserRole;
    expiresAt?: number | null;
    token?: string;
    error?: string;
  } {
    const validation = validateAuthCredentialsInput(rawEmail, rawPassword);
    if (!validation.valid) {
      return {
        ok: false,
        status: 400,
        error: validation.error,
      };
    }

    const password = rawPassword as string;
    const now = this.nowFn();

    // 1. Check Env Admin credentials first (takes strict precedence)
    const envCreds = this.getEnvConfiguredCredentials();
    if (envCreds) {
      const emailMatches = envCreds.email
        ? constantTimeStringMatch(validation.email, envCreds.email)
        : true;
      const passwordMatches = constantTimeStringMatch(password, envCreds.password);
      if (emailMatches && passwordMatches) {
        return {
          ok: true,
          status: 200,
          email: validation.email,
          role: 'admin',
          expiresAt: null,
          token: this.issueSessionToken(validation.email, 'admin'),
        };
      }
    } else if (this.claimedAccount) {
      // 2. Check claimed Admin credential
      const emailMatches = constantTimeStringMatch(validation.email, this.claimedAccount.email);
      const passwordMatches = verifyPasswordAgainstHash(
        password,
        this.claimedAccount.salt,
        this.claimedAccount.passwordHash
      );
      if (emailMatches && passwordMatches) {
        return {
          ok: true,
          status: 200,
          email: validation.email,
          role: 'admin',
          expiresAt: null,
          token: this.issueSessionToken(validation.email, 'admin'),
        };
      }
    }

    // 3. Check Temporary 24h Test Accounts
    const matchingTestAccounts = this.testAccounts.filter((acc) =>
      constantTimeStringMatch(validation.email, acc.email)
    );

    if (matchingTestAccounts.length > 0) {
      // Evaluate newest matching account first
      const sorted = [...matchingTestAccounts].sort((a, b) => b.createdAt - a.createdAt);
      for (const acc of sorted) {
        const passwordMatches = verifyPasswordAgainstHash(password, acc.salt, acc.passwordHash);
        if (!passwordMatches) continue;

        if (acc.revoked) {
          return {
            ok: false,
            status: 403,
            error: 'Este acesso temporário foi revogado pelo administrador.',
          };
        }

        if (now >= acc.expiresAt) {
          return {
            ok: false,
            status: 403,
            error:
              'Acesso temporário expirado: a validade de 24 horas terminou e a conta foi bloqueada automaticamente.',
          };
        }

        return {
          ok: true,
          status: 200,
          email: acc.email,
          role: 'tester',
          expiresAt: acc.expiresAt,
          token: this.issueSessionToken(acc.email, 'tester', acc.id, acc.expiresAt),
        };
      }
    }

    if (!this.isConfigured() && matchingTestAccounts.length === 0) {
      return {
        ok: false,
        status: 401,
        error: 'Nenhuma conta configurada ainda neste terminal.',
      };
    }

    return {
      ok: false,
      status: 401,
      error: 'Email ou palavra-passe inválidos.',
    };
  }

  public async authenticateAsync(rawEmail: unknown, rawPassword: unknown): Promise<{
    ok: boolean;
    status: number;
    email?: string;
    role?: UserRole;
    expiresAt?: number | null;
    token?: string;
    error?: string;
  }> {
    const validation = validateAuthCredentialsInput(rawEmail, rawPassword);
    if (!validation.valid) {
      return {
        ok: false,
        status: 400,
        error: validation.error,
      };
    }

    const password = rawPassword as string;
    const now = this.nowFn();

    const envCreds = this.getEnvConfiguredCredentials();
    if (envCreds) {
      const emailMatches = envCreds.email
        ? constantTimeStringMatch(validation.email, envCreds.email)
        : true;
      const passwordMatches = constantTimeStringMatch(password, envCreds.password);
      if (emailMatches && passwordMatches) {
        return {
          ok: true,
          status: 200,
          email: validation.email,
          role: 'admin',
          expiresAt: null,
          token: this.issueSessionToken(validation.email, 'admin'),
        };
      }
    } else if (this.claimedAccount) {
      const emailMatches = constantTimeStringMatch(validation.email, this.claimedAccount.email);
      const passwordMatches = await verifyPasswordAgainstHashAsync(
        password,
        this.claimedAccount.salt,
        this.claimedAccount.passwordHash
      );
      if (emailMatches && passwordMatches) {
        return {
          ok: true,
          status: 200,
          email: validation.email,
          role: 'admin',
          expiresAt: null,
          token: this.issueSessionToken(validation.email, 'admin'),
        };
      }
    }

    const matchingTestAccounts = this.testAccounts.filter((acc) =>
      constantTimeStringMatch(validation.email, acc.email)
    );

    if (matchingTestAccounts.length > 0) {
      const sorted = [...matchingTestAccounts].sort((a, b) => b.createdAt - a.createdAt);
      for (const acc of sorted) {
        const passwordMatches = await verifyPasswordAgainstHashAsync(password, acc.salt, acc.passwordHash);
        if (!passwordMatches) continue;

        if (acc.revoked) {
          return {
            ok: false,
            status: 403,
            error: 'Este acesso temporário foi revogado pelo administrador.',
          };
        }

        if (now >= acc.expiresAt) {
          return {
            ok: false,
            status: 403,
            error:
              'Acesso temporário expirado: a validade de 24 horas terminou e a conta foi bloqueada automaticamente.',
          };
        }

        return {
          ok: true,
          status: 200,
          email: acc.email,
          role: 'tester',
          expiresAt: acc.expiresAt,
          token: this.issueSessionToken(acc.email, 'tester', acc.id, acc.expiresAt),
        };
      }
    }

    if (!this.isConfigured() && matchingTestAccounts.length === 0) {
      return {
        ok: false,
        status: 401,
        error: 'Nenhuma conta configurada ainda neste terminal.',
      };
    }

    return {
      ok: false,
      status: 401,
      error: 'Email ou palavra-passe inválidos.',
    };
  }

  public createTemporaryTestAccount(rawEmail?: unknown, rawNote?: unknown): {
    ok: boolean;
    status: number;
    credential?: {
      id: string;
      email: string;
      password: string;
      note: string;
      createdAt: number;
      expiresAt: number;
    };
    account?: PublicTestAccountInfo;
    error?: string;
  } {
    const now = this.nowFn();
    let targetEmail = normalizeEmail(rawEmail);

    if (!targetEmail) {
      const randomTag = crypto.randomBytes(3).toString('hex');
      targetEmail = `teste.${randomTag}@nextcandle.ai`;
    } else if (!EMAIL_REGEX.test(targetEmail)) {
      return {
        ok: false,
        status: 400,
        error: 'Introduz um endereço de email válido para o utilizador de teste.',
      };
    }

    const adminEmail = this.getAdminEmail();
    if (adminEmail && constantTimeStringMatch(targetEmail, adminEmail)) {
      return {
        ok: false,
        status: 400,
        error: 'Não é possível gerar uma credencial temporária com o email do administrador.',
      };
    }

    const hasActiveConflict = this.testAccounts.some(
      (acc) => !acc.revoked && now < acc.expiresAt && constantTimeStringMatch(acc.email, targetEmail)
    );
    if (hasActiveConflict) {
      return {
        ok: false,
        status: 409,
        error: 'Já existe uma credencial temporária ativa com este endereço de email.',
      };
    }

    const note =
      typeof rawNote === 'string' ? rawNote.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 80) : '';
    const tempPassword = generateTemporaryPassword(12);
    const { salt, hash } = hashPasswordWithSalt(tempPassword);
    const id = `test_${crypto.randomBytes(6).toString('hex')}`;
    const expiresAt = now + TEST_ACCOUNT_DURATION_MS;

    const record: TemporaryTestAccountRecord = {
      id,
      email: targetEmail,
      note,
      salt,
      passwordHash: hash,
      createdAt: now,
      expiresAt,
      revoked: false,
    };

    this.testAccounts = [record, ...this.testAccounts].slice(0, 100);
    this.saveStoreToDisk();

    return {
      ok: true,
      status: 201,
      credential: {
        id,
        email: targetEmail,
        password: tempPassword,
        note,
        createdAt: now,
        expiresAt,
      },
      account: this.toPublicTestAccount(record, now),
    };
  }

  public async createTemporaryTestAccountAsync(rawEmail?: unknown, rawNote?: unknown): Promise<{
    ok: boolean;
    status: number;
    credential?: {
      id: string;
      email: string;
      password: string;
      note: string;
      createdAt: number;
      expiresAt: number;
    };
    account?: PublicTestAccountInfo;
    error?: string;
  }> {
    const now = this.nowFn();
    let targetEmail = normalizeEmail(rawEmail);

    if (!targetEmail) {
      const randomTag = crypto.randomBytes(3).toString('hex');
      targetEmail = `teste.${randomTag}@nextcandle.ai`;
    } else if (!EMAIL_REGEX.test(targetEmail)) {
      return {
        ok: false,
        status: 400,
        error: 'Introduz um endereço de email válido para o utilizador de teste.',
      };
    }

    const adminEmail = this.getAdminEmail();
    if (adminEmail && constantTimeStringMatch(targetEmail, adminEmail)) {
      return {
        ok: false,
        status: 400,
        error: 'Não é possível gerar uma credencial temporária com o email do administrador.',
      };
    }

    const hasActiveConflict = this.testAccounts.some(
      (acc) => !acc.revoked && now < acc.expiresAt && constantTimeStringMatch(acc.email, targetEmail)
    );
    if (hasActiveConflict) {
      return {
        ok: false,
        status: 409,
        error: 'Já existe uma credencial temporária ativa com este endereço de email.',
      };
    }

    const note =
      typeof rawNote === 'string' ? rawNote.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 80) : '';
    const tempPassword = generateTemporaryPassword(12);
    const { salt, hash } = await hashPasswordWithSaltAsync(tempPassword);
    const id = `test_${crypto.randomBytes(6).toString('hex')}`;
    const expiresAt = now + TEST_ACCOUNT_DURATION_MS;

    const record: TemporaryTestAccountRecord = {
      id,
      email: targetEmail,
      note,
      salt,
      passwordHash: hash,
      createdAt: now,
      expiresAt,
      revoked: false,
    };

    this.testAccounts = [record, ...this.testAccounts].slice(0, 100);
    await this.saveStoreToDiskAsync();

    return {
      ok: true,
      status: 201,
      credential: {
        id,
        email: targetEmail,
        password: tempPassword,
        note,
        createdAt: now,
        expiresAt,
      },
      account: this.toPublicTestAccount(record, now),
    };
  }

  private toPublicTestAccount(
    acc: TemporaryTestAccountRecord,
    now = this.nowFn()
  ): PublicTestAccountInfo {
    const status: PublicTestAccountInfo['status'] = acc.revoked
      ? 'revoked'
      : now >= acc.expiresAt
      ? 'expired'
      : 'active';

    return {
      id: acc.id,
      email: acc.email,
      note: acc.note || '',
      createdAt: acc.createdAt,
      expiresAt: acc.expiresAt,
      revoked: acc.revoked,
      status,
    };
  }

  public listTemporaryTestAccounts(): PublicTestAccountInfo[] {
    const now = this.nowFn();
    return this.testAccounts.map((acc) => this.toPublicTestAccount(acc, now));
  }

  public revokeTemporaryTestAccount(id: string): boolean {
    const target = this.testAccounts.find((acc) => acc.id === id);
    if (!target) return false;
    target.revoked = true;
    target.revokedAt = this.nowFn();
    void this.saveStoreToDiskAsync();
    return true;
  }

  public deleteTemporaryTestAccount(id: string): boolean {
    const before = this.testAccounts.length;
    this.testAccounts = this.testAccounts.filter((acc) => acc.id !== id);
    if (this.testAccounts.length !== before) {
      void this.saveStoreToDiskAsync();
      return true;
    }
    return false;
  }

  public issueSessionToken(
    email: string,
    role: UserRole = 'admin',
    testAccountId?: string,
    accountExpiresAt?: number
  ): string {
    const now = this.nowFn();
    const defaultExp = now + (role === 'tester' ? TEST_ACCOUNT_DURATION_MS : TOKEN_TTL_MS);
    const finalExp =
      typeof accountExpiresAt === 'number' ? Math.min(defaultExp, accountExpiresAt) : defaultExp;

    const payload: SessionPayload = {
      sub: email,
      role,
      ...(testAccountId ? { testAccountId } : {}),
      iat: now,
      exp: finalExp,
      jti: crypto.randomBytes(12).toString('hex'),
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const signature = crypto
      .createHmac('sha256', getSessionSecret())
      .update(encodedPayload)
      .digest('base64url');
    return `${encodedPayload}.${signature}`;
  }

  public verifySessionToken(
    token: string | null | undefined
  ): { session: SessionPayload | null; reason?: 'expired' | 'revoked' | 'invalid' } {
    if (typeof token !== 'string' || !token.includes('.')) {
      return { session: null, reason: 'invalid' };
    }
    const parts = token.split('.');
    if (parts.length !== 2) return { session: null, reason: 'invalid' };

    const [encodedPayload, signature] = parts;
    if (!encodedPayload || !signature) return { session: null, reason: 'invalid' };

    const expectedSignature = crypto
      .createHmac('sha256', getSessionSecret())
      .update(encodedPayload)
      .digest('base64url');

    if (!constantTimeStringMatch(signature, expectedSignature)) {
      return { session: null, reason: 'invalid' };
    }

    try {
      const parsed = JSON.parse(
        Buffer.from(encodedPayload, 'base64url').toString('utf8')
      ) as Partial<SessionPayload>;

      if (
        typeof parsed.sub !== 'string' ||
        (parsed.role !== 'admin' && parsed.role !== 'tester') ||
        typeof parsed.exp !== 'number' ||
        typeof parsed.jti !== 'string'
      ) {
        return { session: null, reason: 'invalid' };
      }

      const now = this.nowFn();
      if (now >= parsed.exp) {
        return { session: null, reason: 'expired' };
      }
      const revokedExp = this.revokedTokens.get(parsed.jti);
      if (typeof revokedExp === 'number' && now < revokedExp) {
        return { session: null, reason: 'revoked' };
      }

      // Live enforcement for temporary 24h test accounts
      if (parsed.role === 'tester') {
        const account = parsed.testAccountId
          ? this.testAccounts.find((a) => a.id === parsed.testAccountId)
          : this.testAccounts.find((a) => constantTimeStringMatch(a.email, parsed.sub!));

        if (!account) {
          return { session: null, reason: 'revoked' };
        }
        if (account.revoked) {
          return { session: null, reason: 'revoked' };
        }
        if (now >= account.expiresAt) {
          return { session: null, reason: 'expired' };
        }
      }

      return { session: parsed as SessionPayload };
    } catch {
      return { session: null, reason: 'invalid' };
    }
  }

  public revokeToken(token: string | null | undefined): void {
    const { session } = this.verifySessionToken(token);
    if (session) {
      const now = this.nowFn();
      this.pruneExpiredRevocations(now);
      this.revokedTokens.set(session.jti, session.exp);
      if (this.revokedTokens.size > 2000) {
        const oldest = this.revokedTokens.keys().next().value;
        if (oldest) this.revokedTokens.delete(oldest);
      }
      void this.saveStoreToDiskAsync();
    }
  }
}

const defaultDataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(process.cwd(), '.data');

export const authManager = new AuthManager({
  storePath: path.join(defaultDataDir, 'auth-store.json'),
});
