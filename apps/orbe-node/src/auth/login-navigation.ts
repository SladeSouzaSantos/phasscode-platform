import { AppError } from '../domain/errors.js';

const maximumReturnBytes = 1024;
const secretPattern = /^[A-Za-z0-9_-]{43}$/;
const encodedReturnPattern = /^[A-Za-z0-9_-]+$/;
const maximumCookieLength = 44 + Math.ceil((maximumReturnBytes * 4) / 3);
const invalidReturn = () =>
  new AppError('INVALID_REQUEST', 400, 'Destino de retorno do login inválido.');

function validateReturnPath(returnTo: string): void {
  const bytes = Buffer.from(returnTo, 'utf8');
  if (
    !returnTo.startsWith('/') ||
    returnTo.startsWith('//') ||
    /[\\\s\p{Cc}]/u.test(returnTo) ||
    bytes.length > maximumReturnBytes ||
    bytes.toString('utf8') !== returnTo
  )
    throw invalidReturn();
  // URL parsers retain these escapes, but routers/proxies can decode them.
  // Exclude ambiguous separators and encoded controls before redirecting.
  let decoded: string;
  try {
    decoded = decodeURIComponent(returnTo);
  } catch {
    throw invalidReturn();
  }
  if (decoded.startsWith('//') || /[\\\p{Cc}]/u.test(decoded)) throw invalidReturn();
}

/** Only a same-origin path may override the operator-configured frontend URL. */
export function resolveLoginReturnUrl(frontendUrl: string, returnTo?: string): string {
  const frontend = new URL(frontendUrl);
  if (frontend.username || frontend.password) throw invalidReturn();
  let destination = frontend;
  if (returnTo !== undefined) {
    validateReturnPath(returnTo);
    destination = new URL(returnTo, frontend.origin);
  }
  if (destination.origin !== frontend.origin || destination.username || destination.password)
    throw invalidReturn();
  if (destination.searchParams.has('auth_error')) destination.searchParams.delete('auth_error');
  return destination.href;
}

/** The transaction hashes the entire cookie, including this optional return path. */
export function encodeLoginBrowserCookie(secret: string, returnTo?: string): string {
  if (!secretPattern.test(secret)) throw invalidReturn();
  if (returnTo === undefined) return secret;
  validateReturnPath(returnTo);
  return `${secret}.${Buffer.from(returnTo, 'utf8').toString('base64url')}`;
}

export function decodeLoginBrowserCookie(
  value: unknown,
): { browserToken: string; returnTo?: string } | undefined {
  if (typeof value !== 'string' || value.length > maximumCookieLength) return;
  if (secretPattern.test(value)) return { browserToken: value };
  const parts = value.split('.');
  if (parts.length !== 2) return;
  const [browserToken, encodedReturn] = parts;
  if (
    !browserToken ||
    !secretPattern.test(browserToken) ||
    !encodedReturn ||
    !encodedReturnPattern.test(encodedReturn)
  )
    return;
  try {
    const bytes = Buffer.from(encodedReturn, 'base64url');
    if (bytes.length > maximumReturnBytes || bytes.toString('base64url') !== encodedReturn) return;
    const returnTo = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    validateReturnPath(returnTo);
    return { browserToken, returnTo };
  } catch {
    return;
  }
}

const publicLoginErrors = new Set([
  'AUTH_ADMIN_ONLY',
  'AUTH_REQUIRED',
  'AUTH_LOGIN_FAILED',
  'AUTH_PROVIDER_UNAVAILABLE',
  'AUTH_UNAVAILABLE',
]);

export function loginErrorReturnUrl(frontendReturnUrl: string, code: string): string {
  const destination = new URL(frontendReturnUrl);
  destination.searchParams.set(
    'auth_error',
    publicLoginErrors.has(code) ? code : 'AUTH_LOGIN_FAILED',
  );
  return destination.href;
}
