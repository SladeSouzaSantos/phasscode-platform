import { createPublicKey } from 'node:crypto';
import {
  createLocalJWKSet,
  exportJWK,
  importPKCS8,
  importSPKI,
  jwtVerify,
  SignJWT,
  type JSONWebKeySet,
  type JWK,
} from 'jose';
import type { EnabledAuthConfig } from '../../../../packages/shared-config/src/auth.js';
import { AppError } from '../domain/errors.js';
import type { AuthSession } from './types.js';

export class AuthTokens {
  private constructor(
    private readonly config: EnabledAuthConfig,
    private readonly privateKey: CryptoKey,
    readonly jwks: JSONWebKeySet,
  ) {}
  static async create(config: EnabledAuthConfig): Promise<AuthTokens> {
    const pem = config.AUTH_JWT_PRIVATE_KEY.replaceAll('\\n', '\n');
    const publicKey = createPublicKey(pem);
    if (
      publicKey.asymmetricKeyType !== 'rsa' ||
      (publicKey.asymmetricKeyDetails?.modulusLength ?? 0) < 2048
    )
      throw new Error('AUTH_JWT_PRIVATE_KEY deve ser RSA com pelo menos 2048 bits.');
    const privateKey = await importPKCS8(pem, 'RS256');
    const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const key = await exportJWK(await importSPKI(publicPem, 'RS256'));
    let previous: unknown;
    try {
      previous = JSON.parse(config.AUTH_JWT_PREVIOUS_JWKS);
    } catch {
      throw new Error('AUTH_JWT_PREVIOUS_JWKS inválido.');
    }
    if (
      !previous ||
      typeof previous !== 'object' ||
      !('keys' in previous) ||
      !Array.isArray(previous.keys) ||
      previous.keys.length > 5
    )
      throw new Error('AUTH_JWT_PREVIOUS_JWKS inválido.');
    const seen = new Set([config.AUTH_JWT_KEY_ID]);
    const oldKeys: JWK[] = previous.keys.map((value: unknown) => {
      if (!value || typeof value !== 'object') throw new Error('JWKS anterior inválido.');
      const item = value as Record<string, unknown>;
      if (
        item.kty !== 'RSA' ||
        typeof item.n !== 'string' ||
        typeof item.e !== 'string' ||
        typeof item.kid !== 'string' ||
        !/^[A-Za-z0-9_-]{1,80}$/.test(item.kid) ||
        seen.has(item.kid) ||
        ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth'].some((name) => name in item) ||
        (item.alg !== undefined && item.alg !== 'RS256') ||
        (item.use !== undefined && item.use !== 'sig')
      )
        throw new Error('JWKS anterior deve conter somente chaves públicas RSA únicas.');
      const previousKey = createPublicKey({
        key: { kty: 'RSA', n: item.n, e: item.e },
        format: 'jwk',
      });
      if ((previousKey.asymmetricKeyDetails?.modulusLength ?? 0) < 2048)
        throw new Error('JWKS anterior exige RSA com pelo menos 2048 bits.');
      seen.add(item.kid);
      return { kty: 'RSA', n: item.n, e: item.e, kid: item.kid, alg: 'RS256', use: 'sig' };
    });
    return new AuthTokens(config, privateKey, {
      keys: [{ ...key, kid: config.AUTH_JWT_KEY_ID, alg: 'RS256', use: 'sig' }, ...oldKeys],
    });
  }
  async issue(session: AuthSession): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({ sid: session.id, roles: session.user.roles })
      .setProtectedHeader({ alg: 'RS256', kid: this.config.AUTH_JWT_KEY_ID, typ: 'at+jwt' })
      .setIssuer(this.config.AUTH_JWT_ISSUER ?? this.config.AUTH_PUBLIC_URL)
      .setAudience(this.config.AUTH_JWT_AUDIENCE)
      .setSubject(session.userId)
      .setIssuedAt(now)
      .setExpirationTime(
        Math.min(
          now + this.config.AUTH_ACCESS_TTL_SECONDS,
          Math.floor(session.expiresAt.getTime() / 1000),
        ),
      )
      .sign(this.privateKey);
  }
  async verify(token: string): Promise<{ userId: string; sessionId: string }> {
    try {
      const { payload } = await jwtVerify(token, createLocalJWKSet(this.jwks), {
        issuer: this.config.AUTH_JWT_ISSUER ?? this.config.AUTH_PUBLIC_URL,
        audience: this.config.AUTH_JWT_AUDIENCE,
        algorithms: ['RS256'],
        typ: 'at+jwt',
        requiredClaims: ['sub', 'sid', 'iat', 'exp', 'iss', 'aud'],
        maxTokenAge: this.config.AUTH_ACCESS_TTL_SECONDS,
        clockTolerance: 5,
      });
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (
        typeof payload.sub !== 'string' ||
        typeof payload.sid !== 'string' ||
        !uuid.test(payload.sid) ||
        !uuid.test(payload.sub)
      )
        throw new Error('Invalid subject/session.');
      return { userId: payload.sub, sessionId: payload.sid };
    } catch {
      throw new AppError('AUTH_REQUIRED', 401, 'Autenticação válida é necessária.');
    }
  }
}
