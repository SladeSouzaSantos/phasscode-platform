import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

// Black box: processo compilado, socket HTTP real, nenhum provider pago.
const socket = createServer();
socket.listen(0, '127.0.0.1');
await once(socket, 'listening');
const port = socket.address().port;
await new Promise((resolve) => socket.close(resolve));
const child = spawn(process.execPath, ['dist/apps/orbe-node/src/main.js'], {
  env: {
    ...process.env,
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    PORT: String(port),
    PERSISTENCE: 'memory',
    REDIS_URL: '',
    LLM_PROVIDER: 'mock',
    LLM_FALLBACK_ENABLED: 'false',
    LOG_LEVEL: 'silent',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let stderr = '';
child.stderr.on('data', (data) => {
  stderr += data.toString();
});
child.stdout.resume();
const exit = once(child, 'exit');
try {
  const base = `http://127.0.0.1:${port}`;
  let started = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (child.exitCode !== null) throw new Error(`Processo encerrou antes de iniciar: ${stderr}`);
    try {
      const response = await fetch(`${base}/health`);
      if (response.ok) {
        started = true;
        break;
      }
    } catch {
      /* Aguarda bind do HTTP. */
    }
    await delay(100);
  }
  assert.ok(started, 'Inicialização excedeu seis segundos.');
  assert.equal((await fetch(`${base}/ready`)).status, 200);
  const first = await fetch(`${base}/api/v1/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Quais projetos usam React?' }),
  });
  assert.equal(first.status, 200);
  const body = await first.json();
  assert.equal(body.meta.simulated, true);
  assert.ok(body.answer.includes('React'));
  const next = await fetch(`${base}/api/v1/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Conversation-Token': body.conversationToken },
    body: JSON.stringify({ conversationId: body.conversationId, message: 'E o frontend?' }),
  });
  assert.equal(next.status, 200);
  assert.equal((await next.json()).conversationToken, undefined);
  console.info('Smoke OK: processo compilado, health, readiness e dois turnos via HTTP real.');
} finally {
  child.kill('SIGTERM');
  await exit;
}
