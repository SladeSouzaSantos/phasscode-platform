import { describe, expect, it } from 'vitest';
import {
  decodeLoginBrowserCookie,
  encodeLoginBrowserCookie,
  loginErrorReturnUrl,
  resolveLoginReturnUrl,
} from '../apps/orbe-node/src/auth/login-navigation.js';

const frontend = 'https://portfolio.example.test/login-complete?lang=pt#panel';
const browserToken = 'A'.repeat(43);
const cookieWith = (value: string | Buffer) =>
  `${browserToken}.${Buffer.from(value).toString('base64url')}`;

describe('login navigation destinations', () => {
  it('preserves the configured URL and same-origin path/query/fragment overrides', () => {
    expect(resolveLoginReturnUrl(frontend)).toBe(frontend);
    expect(resolveLoginReturnUrl(frontend, '/')).toBe('https://portfolio.example.test/');
    expect(resolveLoginReturnUrl(frontend, '/projects?tag=java#gameboy')).toBe(
      'https://portfolio.example.test/projects?tag=java#gameboy',
    );
    expect(resolveLoginReturnUrl(frontend, '/projetos/seguran%C3%A7a?q=foo%20bar')).toBe(
      'https://portfolio.example.test/projetos/seguran%C3%A7a?q=foo%20bar',
    );
    expect(resolveLoginReturnUrl('https://portfolio.example.test/login?q=foo%20bar#panel')).toBe(
      'https://portfolio.example.test/login?q=foo%20bar#panel',
    );
  });

  it('removes every reserved auth_error parameter for a fresh or successful login', () => {
    expect(
      resolveLoginReturnUrl(
        'https://portfolio.example.test/login?auth_error=OLD&lang=pt&auth_error=OTHER#panel',
      ),
    ).toBe('https://portfolio.example.test/login?lang=pt#panel');
    expect(resolveLoginReturnUrl(frontend, '/projects?auth_error=OLD&tag=java#list')).toBe(
      'https://portfolio.example.test/projects?tag=java#list',
    );
  });

  it.each([
    '',
    'projects',
    '?next=/admin',
    '#panel',
    'https://attacker.example/steal',
    '//attacker.example/steal',
    '///attacker.example/steal',
    '/\\attacker.example/steal',
    '/projects\\admin',
    '/ projects',
    '/projects\tadmin',
    '/projects\r\nLocation:https://attacker.example',
    '/projects\u0000admin',
    '/projects\u007fadmin',
    '/%2Fattacker.example',
    '/%5cattacker.example',
    '/projects?next=%0d%0aLocation:evil',
    '/invalid%FF',
    '/invalid%',
    '/invalid\ud800',
    `/${'a'.repeat(1024)}`,
    `/${'\u00e9'.repeat(512)}`,
  ])('rejects an unsafe or oversized return path: %j', (returnTo) => {
    expect(() => resolveLoginReturnUrl(frontend, returnTo)).toThrowError(
      expect.objectContaining({ code: 'INVALID_REQUEST', status: 400 }),
    );
  });

  it('accepts the full UTF-8 byte limit and never accepts frontend URL credentials', () => {
    expect(resolveLoginReturnUrl(frontend, `/${'a'.repeat(1023)}`)).toHaveLength(
      'https://portfolio.example.test'.length + 1024,
    );
    expect(() => resolveLoginReturnUrl('https://user:password@portfolio.example.test/')).toThrow();
  });
});

describe('browser-bound login navigation cookies', () => {
  it('preserves legacy secrets and round-trips a canonical optional return path', () => {
    expect(encodeLoginBrowserCookie(browserToken)).toBe(browserToken);
    expect(decodeLoginBrowserCookie(browserToken)).toEqual({ browserToken });
    const returnTo = '/projetos/seguran\u00e7a?tag=java#list';
    const value = encodeLoginBrowserCookie(browserToken, returnTo);
    expect(value).toBe(cookieWith(returnTo));
    expect(decodeLoginBrowserCookie(value)).toEqual({ browserToken, returnTo });
  });

  it('requires a valid secret and validates a return path before encoding it', () => {
    expect(() => encodeLoginBrowserCookie('short', '/')).toThrow();
    expect(() => encodeLoginBrowserCookie(browserToken, '//attacker.example/')).toThrow();
  });

  it.each([
    undefined,
    null,
    42,
    ['cookie'],
    '',
    'A'.repeat(42),
    'A'.repeat(44),
    `${browserToken}.`,
    `${browserToken}.Lw==`,
    `${browserToken}.Lx`,
    `${browserToken}.Lw.more`,
    `${browserToken}.Lw\n`,
    cookieWith('https://attacker.example/'),
    cookieWith('//attacker.example/'),
    cookieWith('/\\attacker.example/'),
    cookieWith('/%0D%0Aheader'),
    cookieWith(Buffer.from([0x2f, 0xc3, 0x28])),
    cookieWith(Buffer.from([0xef, 0xbb, 0xbf, 0x2f])),
    cookieWith(Buffer.from([0x2f, 0xed, 0xa0, 0x80])),
    cookieWith(`/${'a'.repeat(1024)}`),
  ])('rejects malformed, noncanonical or unsafe cookies: %j', (cookie) => {
    expect(decodeLoginBrowserCookie(cookie)).toBeUndefined();
  });

  it('supports the maximum canonical payload without increasing the secret size', () => {
    const returnTo = `/${'a'.repeat(1023)}`;
    expect(decodeLoginBrowserCookie(encodeLoginBrowserCookie(browserToken, returnTo))).toEqual({
      browserToken,
      returnTo,
    });
  });
});

describe('public login failure destinations', () => {
  it.each([
    'AUTH_ADMIN_ONLY',
    'AUTH_REQUIRED',
    'AUTH_LOGIN_FAILED',
    'AUTH_PROVIDER_UNAVAILABLE',
    'AUTH_UNAVAILABLE',
  ])('exposes only the safe public error code %s while retaining query and fragment', (code) => {
    const destination = new URL(loginErrorReturnUrl(frontend, code));
    expect(destination.origin).toBe('https://portfolio.example.test');
    expect(destination.pathname).toBe('/login-complete');
    expect(destination.searchParams.get('lang')).toBe('pt');
    expect(destination.searchParams.getAll('auth_error')).toEqual([code]);
    expect(destination.hash).toBe('#panel');
  });

  it('replaces previous errors and maps unknown codes to a generic failure', () => {
    const destination = new URL(
      loginErrorReturnUrl(
        'https://portfolio.example.test/login?auth_error=OLD&auth_error=OTHER#panel',
        '<script>internal provider details</script>',
      ),
    );
    expect(destination.searchParams.getAll('auth_error')).toEqual(['AUTH_LOGIN_FAILED']);
    expect(destination.href).not.toContain('script');
    expect(destination.hash).toBe('#panel');
  });
});
