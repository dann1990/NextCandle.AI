import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AuthManager,
  TEST_ACCOUNT_DURATION_MS,
  hashPasswordWithSalt,
  validateAuthCredentialsInput,
  verifyPasswordAgainstHash,
} from './authService';

test('validateAuthCredentialsInput rejects invalid emails and short passwords', () => {
  assert.equal(validateAuthCredentialsInput('invalid-email', 'secret123').valid, false);
  assert.equal(validateAuthCredentialsInput('user@nextcandle.ai', '12345').valid, false);
  const valid = validateAuthCredentialsInput('  User@NextCandle.AI ', 'StrongPass99');
  assert.equal(valid.valid, true);
  assert.equal(valid.email, 'user@nextcandle.ai');
});

test('scrypt password hashing verifies matching password and rejects wrong password', () => {
  const { salt, hash } = hashPasswordWithSalt('NextCandle#2026');
  assert.equal(verifyPasswordAgainstHash('NextCandle#2026', salt, hash), true);
  assert.equal(verifyPasswordAgainstHash('WrongPassword', salt, hash), false);
});

test('AuthManager setup claims Admin role, locks setup, and issues verifiable Bearer tokens', () => {
  const prevEmail = process.env.ADMIN_EMAIL;
  const prevPass = process.env.ADMIN_PASSWORD;
  const prevAuthEmail = process.env.AUTH_EMAIL;
  const prevAuthPass = process.env.AUTH_PASSWORD;
  delete process.env.ADMIN_EMAIL;
  delete process.env.ADMIN_PASSWORD;
  delete process.env.AUTH_EMAIL;
  delete process.env.AUTH_PASSWORD;

  try {
    const manager = new AuthManager({ storePath: null });
    assert.equal(manager.getMode(), 'setup');

    const first = manager.setupFirstAccess('dann.g.f.a@gmail.com', 'alpha123');
    assert.equal(first.ok, true);
    assert.equal(first.status, 201);
    assert.equal(first.role, 'admin');
    assert.ok(first.token);
    assert.equal(manager.getMode(), 'login');

    const second = manager.setupFirstAccess('other@nextcandle.ai', 'beta456');
    assert.equal(second.ok, false);
    assert.equal(second.status, 409);

    const validLogin = manager.authenticate('dann.g.f.a@gmail.com', 'alpha123');
    assert.equal(validLogin.ok, true);
    assert.equal(validLogin.role, 'admin');
    assert.ok(validLogin.token);

    const badLogin = manager.authenticate('dann.g.f.a@gmail.com', 'wrong-pass');
    assert.equal(badLogin.ok, false);
    assert.equal(badLogin.status, 401);

    const verified = manager.verifySessionToken(validLogin.token);
    assert.equal(verified.session?.sub, 'dann.g.f.a@gmail.com');
    assert.equal(verified.session?.role, 'admin');
    manager.revokeToken(validLogin.token);
    assert.equal(manager.verifySessionToken(validLogin.token).session, null);
  } finally {
    if (prevEmail !== undefined) process.env.ADMIN_EMAIL = prevEmail;
    if (prevPass !== undefined) process.env.ADMIN_PASSWORD = prevPass;
    if (prevAuthEmail !== undefined) process.env.AUTH_EMAIL = prevAuthEmail;
    if (prevAuthPass !== undefined) process.env.AUTH_PASSWORD = prevAuthPass;
  }
});

test('Temporary 24h test credentials authenticate with tester role and auto-block immediately upon expiration', () => {
  const prevEmail = process.env.ADMIN_EMAIL;
  const prevPass = process.env.ADMIN_PASSWORD;
  delete process.env.ADMIN_EMAIL;
  delete process.env.ADMIN_PASSWORD;

  try {
    let fakeNow = 1_700_000_000_000;
    const manager = new AuthManager({ storePath: null, nowFn: () => fakeNow });
    manager.setupFirstAccess('dann.g.f.a@gmail.com', 'adminpass123');

    // Admin generates temporary 24h test account
    const created = manager.createTemporaryTestAccount('tester01@nextcandle.ai', 'Cliente Demo');
    assert.equal(created.ok, true);
    assert.ok(created.credential);
    assert.equal(created.credential.expiresAt, fakeNow + TEST_ACCOUNT_DURATION_MS);

    // Login succeeds while within 24h window
    fakeNow += 23 * 60 * 60 * 1000; // +23h
    const loginBeforeExpiry = manager.authenticate(
      created.credential.email,
      created.credential.password
    );
    assert.equal(loginBeforeExpiry.ok, true);
    assert.equal(loginBeforeExpiry.role, 'tester');
    assert.equal(loginBeforeExpiry.expiresAt, created.credential.expiresAt);
    assert.ok(loginBeforeExpiry.token);
    assert.equal(manager.verifySessionToken(loginBeforeExpiry.token).session?.role, 'tester');

    // Advance past 24h boundary -> active token AND fresh login are automatically blocked
    fakeNow += 60 * 60 * 1000 + 1; // total +24h + 1ms
    const tokenCheckAfterExpiry = manager.verifySessionToken(loginBeforeExpiry.token);
    assert.equal(tokenCheckAfterExpiry.session, null);
    assert.equal(tokenCheckAfterExpiry.reason, 'expired');

    const loginAfterExpiry = manager.authenticate(
      created.credential.email,
      created.credential.password
    );
    assert.equal(loginAfterExpiry.ok, false);
    assert.equal(loginAfterExpiry.status, 403);

    const list = manager.listTemporaryTestAccounts();
    assert.equal(list[0].status, 'expired');
  } finally {
    if (prevEmail !== undefined) process.env.ADMIN_EMAIL = prevEmail;
    if (prevPass !== undefined) process.env.ADMIN_PASSWORD = prevPass;
  }
});

test('Revoking temporary test account blocks both active session and new logins immediately', () => {
  let fakeNow = 1_700_000_000_000;
  const manager = new AuthManager({ storePath: null, nowFn: () => fakeNow });
  manager.setupFirstAccess('dann.g.f.a@gmail.com', 'adminpass123');

  const created = manager.createTemporaryTestAccount();
  assert.equal(created.ok, true);
  assert.ok(created.credential);

  const login = manager.authenticate(created.credential.email, created.credential.password);
  assert.equal(login.ok, true);
  assert.ok(login.token);

  assert.equal(manager.revokeTemporaryTestAccount(created.credential.id), true);
  const tokenCheck = manager.verifySessionToken(login.token);
  assert.equal(tokenCheck.session, null);
  assert.equal(tokenCheck.reason, 'revoked');

  const retryLogin = manager.authenticate(created.credential.email, created.credential.password);
  assert.equal(retryLogin.ok, false);
  assert.equal(retryLogin.status, 403);
});

test('AuthManager gives priority to configured process.env ADMIN credentials', () => {
  const prevEmail = process.env.ADMIN_EMAIL;
  const prevPass = process.env.ADMIN_PASSWORD;
  process.env.ADMIN_EMAIL = 'admin@nextcandle.ai';
  process.env.ADMIN_PASSWORD = 'EnvPassword!99';

  try {
    const manager = new AuthManager({ storePath: null });
    assert.equal(manager.getMode(), 'login');
    assert.equal(manager.setupFirstAccess('someone@nextcandle.ai', '123456').status, 409);

    const fail = manager.authenticate('admin@nextcandle.ai', 'wrong-pass');
    assert.equal(fail.ok, false);
    assert.equal(fail.status, 401);

    const pass = manager.authenticate('ADMIN@nextcandle.ai', 'EnvPassword!99');
    assert.equal(pass.ok, true);
    assert.equal(pass.role, 'admin');
    assert.ok(pass.token);
  } finally {
    if (prevEmail === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = prevEmail;
    if (prevPass === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = prevPass;
  }
});

test('AuthManager handles accidental quotes and trailing whitespace in Render env credentials', () => {
  const prevEmail = process.env.ADMIN_EMAIL;
  const prevPass = process.env.ADMIN_PASSWORD;
  process.env.ADMIN_EMAIL = '  "admin@nextcandle.ai" \n';
  process.env.ADMIN_PASSWORD = ' "EnvPassword!99" ';

  try {
    const manager = new AuthManager({ storePath: null });
    const pass = manager.authenticate('admin@nextcandle.ai', 'EnvPassword!99');
    assert.equal(pass.ok, true);
    assert.equal(pass.role, 'admin');
  } finally {
    if (prevEmail === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = prevEmail;
    if (prevPass === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = prevPass;
  }
});

