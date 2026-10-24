import { generateKeyPairSync, createPublicKey, randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Writes new files only. Never prints private material or overwrites an operator key.
try {
  const directory = resolve('.secrets');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 3072,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  const kid = randomBytes(12).toString('hex');
  const jwk = createPublicKey(privateKey).export({ format: 'jwk' });
  await writeFile(
    resolve(directory, 'auth-key.env'),
    `AUTH_JWT_KEY_ID=${kid}\nAUTH_JWT_PRIVATE_KEY='${privateKey.replaceAll('\n', '\\n')}'\n`,
    { flag: 'wx', mode: 0o600 },
  );
  await writeFile(
    resolve(directory, 'auth-public-jwks.json'),
    `${JSON.stringify({ keys: [{ ...jwk, kid, alg: 'RS256', use: 'sig' }] }, null, 2)}\n`,
    { flag: 'wx', mode: 0o600 },
  );
  console.info(
    'Chave criada em .secrets/auth-key.env; JWKS público em .secrets/auth-public-jwks.json. Copie os campos para o ambiente escolhido e proteja o acesso local.',
  );
} catch {
  console.error(
    'Não foi possível gerar os arquivos. Confira permissões e se já existem chaves; nenhum arquivo existente é substituído.',
  );
  process.exitCode = 1;
}
