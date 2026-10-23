import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createPool } from './pool.js';

// Operator-only CLI; never invoked by login or exposed as an HTTP endpoint.
const [action, userId, ...extra] = process.argv.slice(2);
if (
  !['grant', 'revoke'].includes(action ?? '') ||
  !z.uuid().safeParse(userId).success ||
  extra.length ||
  !process.env.DATABASE_URL
) {
  console.error(
    'Uso: npm run auth:admin -- grant|revoke <UUID>. Configure DATABASE_URL para o ambiente correto.',
  );
  process.exitCode = 1;
} else {
  const pool = createPool(process.env.DATABASE_URL);
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const user = await client.query(
        'SELECT id FROM auth_users WHERE id=$1 AND disabled_at IS NULL FOR UPDATE',
        [userId],
      );
      if (!user.rowCount) throw new Error('Usuário inexistente ou desabilitado.');
      const change =
        action === 'grant'
          ? await client.query(
              "INSERT INTO auth_user_roles(user_id,role) VALUES($1,'admin') ON CONFLICT DO NOTHING",
              [userId],
            )
          : await client.query("DELETE FROM auth_user_roles WHERE user_id=$1 AND role='admin'", [
              userId,
            ]);
      if (change.rowCount)
        await client.query(
          "INSERT INTO auth_role_audit(id,user_id,action,role) VALUES($1,$2,$3,'admin')",
          [randomUUID(), userId, action],
        );
      await client.query('COMMIT');
      console.info(
        change.rowCount
          ? 'Papel administrativo atualizado e auditado.'
          : 'O papel já estava no estado solicitado.',
      );
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  } catch {
    console.error(
      'Falha ao atualizar papel. Confira UUID, banco e migrations do ambiente escolhido.',
    );
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
