import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash, generateKeyPairSync, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, rmdir, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const imagePattern = /^[A-Za-z0-9][A-Za-z0-9._/:@-]{0,299}$/;
export function parseImage(args) {
  if (
    args.length !== 2 ||
    args[0] !== '--image' ||
    typeof args[1] !== 'string' ||
    !imagePattern.test(args[1])
  )
    throw new Error('Usage: node scripts/phase3-docker-smoke.mjs --image LOCAL_CANDIDATE_IMAGE');
  return args[1];
}

const inheritedDockerEnvironment = () =>
  Object.fromEntries(
    [
      'PATH',
      'SystemRoot',
      'ComSpec',
      'PATHEXT',
      'TEMP',
      'TMP',
      'HOME',
      'USERPROFILE',
      // Docker Desktop locates its Compose plugin through Windows system paths.
      // Keep these non-secret paths while continuing to omit application credentials.
      'ProgramFiles',
      'ProgramFiles(x86)',
      'ProgramW6432',
      'ProgramData',
      'ALLUSERSPROFILE',
      'APPDATA',
      'LOCALAPPDATA',
      'DOCKER_HOST',
      'DOCKER_CONTEXT',
      'DOCKER_CONFIG',
      'DOCKER_TLS_VERIFY',
      'DOCKER_CERT_PATH',
      'XDG_RUNTIME_DIR',
    ].flatMap((name) => (process.env[name] === undefined ? [] : [[name, process.env[name]]])),
  );

async function executeDocker(args, { env, phase, timeout = 180000, signal }) {
  try {
    const result = await exec('docker', args, {
      cwd: root,
      env,
      timeout,
      maxBuffer: 1048576,
      windowsHide: true,
      signal,
    });
    return result.stdout.trim();
  } catch {
    // Never dump a third-party exception: interpolated configuration contains the synthetic key.
    throw new Error(`Phase 3 image qualification failed during ${phase}; command output withheld.`);
  }
}

function isLocalEndpoint(endpoint) {
  if (endpoint.startsWith('unix://') || endpoint.startsWith('npipe://')) return true;
  try {
    const url = new URL(endpoint);
    return url.protocol === 'tcp:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

export async function qualifyImage(image, { docker = executeDocker, signal } = {}) {
  assert.ok(
    typeof image === 'string' && imagePattern.test(image),
    'Select one explicit local candidate image.',
  );
  const project = `phasscode-p3-smoke-${randomUUID()}`;
  const env = inheritedDockerEnvironment();
  const run = (args, phase) => docker(args, { env, phase, ...(signal ? { signal } : {}) });
  const endpoint =
    (env.DOCKER_CONTEXT
      ? await run(
          ['context', 'inspect', env.DOCKER_CONTEXT, '--format', '{{.Endpoints.docker.Host}}'],
          'local daemon check',
        )
      : env.DOCKER_HOST) ||
    (await run(
      ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'],
      'local daemon check',
    ));
  assert.ok(isLocalEndpoint(endpoint), 'Qualification is restricted to a local Docker daemon.');
  const [imageId, os] = (
    await run(['image', 'inspect', '--format', '{{.Id}}|{{.Os}}', image], 'candidate image lookup')
  ).split('|');
  assert.match(
    imageId,
    /^sha256:[a-f0-9]{64}$/,
    'The selected candidate must already exist locally.',
  );
  assert.equal(os, 'linux', 'Qualification requires a Linux container image.');
  // Refuse even an improbable name collision before allowing project-scoped cleanup.
  for (const resource of ['container', 'network', 'volume']) {
    const args = [resource, 'ls'];
    if (resource === 'container') args.push('--all');
    args.push('--filter', `label=com.docker.compose.project=${project}`, '--quiet');
    assert.equal(
      await run(args, 'fresh project check'),
      '',
      'The generated project must be unused.',
    );
  }

  const directory = await mkdtemp(join(tmpdir(), 'phasscode-p3-smoke-'));
  const emptyEnvironment = join(directory, 'empty.env');
  await writeFile(emptyEnvironment, '', { mode: 0o600 });
  const privateKey = generateKeyPairSync('rsa', {
    modulusLength: 3072,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  }).privateKey;
  const migrations = join(root, 'infrastructure', 'postgres', 'migrations');
  const checksums = Object.fromEntries(
    await Promise.all(
      (await readdir(migrations))
        .filter((name) => /^\d+_[a-z_]+\.sql$/.test(name))
        .sort()
        .map(async (name) => [
          name,
          createHash('sha256')
            .update(await readFile(join(migrations, name)))
            .digest('hex'),
        ]),
    ),
  );
  env.PHASSCODE_TEST_IMAGE = imageId;
  env.PHASSCODE_TEST_PRIVATE_KEY = privateKey.replaceAll('\n', '\\n');
  env.PHASSCODE_TEST_EXPECTED_MIGRATIONS = JSON.stringify(checksums);
  const compose = [
    'compose',
    '--project-name',
    project,
    '--env-file',
    emptyEnvironment,
    '--file',
    join(root, 'compose.phase3-test.yaml'),
  ];
  let failure;
  let cleanupFailed = false;
  try {
    await run([...compose, 'config', '--quiet'], 'isolated Compose validation');
    await run(
      [...compose, 'up', '-d', '--no-build', '--wait', 'api', 'worker'],
      'separate API/worker startup',
    );
    for (const service of ['api', 'worker']) {
      const id = await run([...compose, 'ps', '--quiet', service], `${service} container lookup`);
      assert.ok(id && !id.includes('\n'), `Exactly one ${service} container is required.`);
      assert.equal(
        await run(['inspect', '--format', '{{.Image}}', id], `${service} candidate verification`),
        imageId,
        `${service} must use the exact candidate image ID selected before startup.`,
      );
    }
    await run([...compose, 'run', '--rm', '--no-deps', 'smoke'], 'enabled runtime smoke');
    await run(
      [...compose, 'up', '-d', '--no-build', '--wait', 'api', 'worker'],
      'final readiness and heartbeat',
    );
  } catch (error) {
    failure = error;
  }
  try {
    // The random project was checked empty; this never targets the normal checkout project.
    await docker([...compose, 'down', '--volumes', '--remove-orphans', '--timeout', '45'], {
      env,
      phase: 'own disposable project cleanup',
    });
  } catch (error) {
    cleanupFailed = true;
    failure ??= error;
  } finally {
    delete env.PHASSCODE_TEST_PRIVATE_KEY;
    await unlink(emptyEnvironment);
    await rmdir(directory);
  }
  if (failure)
    throw new Error(
      `${failure instanceof Error ? failure.message : 'Image qualification failed.'} Disposable project: ${project}.${cleanupFailed ? ' Cleanup also failed; inspect only this project before retrying.' : ''}`,
    );
  return { imageId, project };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    const result = await qualifyImage(parseImage(process.argv.slice(2)), {
      signal: controller.signal,
    });
    console.info(
      `PASS Phase 3 image qualification: ${result.imageId}; disposable project cleaned.`,
    );
    console.info(
      'Local fakes only: real OIDC, Calendar, delivery, TLS and frontend remain unverified.',
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Phase 3 image qualification failed.');
    process.exitCode = 1;
  } finally {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
  }
}
