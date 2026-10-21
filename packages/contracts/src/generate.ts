import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { openApiDocument } from './index.js';

const target = resolve('packages/contracts/openapi.json');
const document = `${JSON.stringify(openApiDocument, null, 2)}\n`;
if (process.argv.includes('--check')) {
  if ((await readFile(target, 'utf8')) !== document) {
    throw new Error('Contrato desatualizado. Execute npm run contracts:generate.');
  }
} else {
  await writeFile(target, document);
}
