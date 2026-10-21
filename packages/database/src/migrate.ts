import { createPool } from './pool.js';
import { migrate } from './migrations.js';

if (!process.env.DATABASE_URL) throw new Error('Configure DATABASE_URL antes das migrations.');
const pool = createPool(process.env.DATABASE_URL);
try {
  await migrate(pool);
  console.info('Migrations aplicadas.');
} catch {
  console.error('Falha nas migrations. Verifique conectividade, permissões e checksums.');
  process.exitCode = 1;
} finally {
  await pool.end();
}
