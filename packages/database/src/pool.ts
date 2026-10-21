import pg from 'pg';

export function createPool(connectionString: string): pg.Pool {
  const pool = new pg.Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 10000,
    statement_timeout: 10000,
  });
  // Não imprimir detalhes do driver: podem incluir endereço, usuário e consultas.
  pool.on('error', () => {
    console.error('PostgreSQL: conexão ociosa indisponível.');
  });
  return pool;
}
