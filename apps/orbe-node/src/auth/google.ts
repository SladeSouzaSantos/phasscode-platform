import * as oidc from 'openid-client';
import type { EnabledAuthConfig } from '../../../../packages/shared-config/src/auth.js';
import { AppError } from '../domain/errors.js';
import type { ExternalProfile, OAuthTransaction } from './types.js';

export interface GoogleIdentityProvider {
  authorizationUrl(state: string, nonce: string, verifier: string): Promise<string>;
  exchange(callback: URL, transaction: OAuthTransaction, state: string): Promise<ExternalProfile>;
}
export class GoogleOidc implements GoogleIdentityProvider {
  private discovery: Promise<oidc.Configuration> | undefined;
  constructor(private readonly config: EnabledAuthConfig) {}
  private client(): Promise<oidc.Configuration> {
    this.discovery ??= oidc
      .discovery(
        new URL(this.config.AUTH_GOOGLE_ISSUER),
        this.config.AUTH_GOOGLE_CLIENT_ID,
        { id_token_signed_response_alg: 'RS256' },
        oidc.ClientSecretPost(this.config.AUTH_GOOGLE_CLIENT_SECRET),
        {
          timeout: this.config.AUTH_HTTP_TIMEOUT_SECONDS,
          execute: [
            oidc.enableNonRepudiationChecks,
            ...(this.config.testIssuer ? [oidc.allowInsecureRequests] : []),
          ],
        },
      )
      .catch(() => {
        this.discovery = undefined;
        throw new AppError('AUTH_PROVIDER_UNAVAILABLE', 503, 'Login temporariamente indisponível.');
      });
    return this.discovery;
  }
  async authorizationUrl(state: string, nonce: string, verifier: string): Promise<string> {
    const client = await this.client();
    return oidc.buildAuthorizationUrl(client, {
      redirect_uri: this.config.callbackUrl,
      scope: 'openid email profile',
      response_type: 'code',
      state,
      nonce,
      code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
      code_challenge_method: 'S256',
      prompt: 'select_account',
    }).href;
  }
  async exchange(
    callback: URL,
    transaction: OAuthTransaction,
    state: string,
  ): Promise<ExternalProfile> {
    try {
      const result = await oidc.authorizationCodeGrant(await this.client(), callback, {
        expectedState: state,
        expectedNonce: transaction.nonce,
        pkceCodeVerifier: transaction.verifier,
        idTokenExpected: true,
      });
      const claims = result.claims();
      if (
        !claims ||
        typeof claims.sub !== 'string' ||
        !claims.sub ||
        typeof claims.email !== 'string' ||
        claims.email_verified !== true
      )
        throw new Error('Verified identity required.');
      return {
        issuer: claims.iss,
        subject: claims.sub,
        email: claims.email.slice(0, 320),
        displayName: typeof claims.name === 'string' ? claims.name.slice(0, 100) : 'Usuário',
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        'AUTH_LOGIN_FAILED',
        401,
        'Não foi possível validar o login. Inicie novamente.',
      );
    }
  }
}
