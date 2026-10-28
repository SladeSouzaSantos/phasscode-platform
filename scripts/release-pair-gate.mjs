// R1/R2: fail-closed *input* gate for an immutable DEV release candidate.
// This is not CI evidence. The release jobs must run ALL checks against these
// two exact SHAs, then qualify the precise image digest, before remote apply.
// Only repository owners can configure the required repository Actions vars.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const SHA = /^[a-f0-9]{40}$/;
const REPOS = Object.freeze({
  backend: 'SladeSouzaSantos/phasscode-platform',
  frontend: 'SladeSouzaSantos/web-portfolio-v2',
});

export function validateReleasePair(role, env) {
  const reason = (code) => ({ ok: false, code });
  if (!Object.hasOwn(REPOS, role)) return reason('ROLE_INVALID');
  if (!env || typeof env !== 'object') return reason('INPUT_INVALID');
  if (env.GITHUB_EVENT_NAME !== 'push' && env.GITHUB_EVENT_NAME !== 'workflow_dispatch')
    return reason('EVENT_UNAPPROVED');
  if (env.GITHUB_REF !== 'refs/heads/dev') return reason('DEV_ONLY');
  if (env.GITHUB_REPOSITORY !== REPOS[role]) return reason('REPOSITORY_MISMATCH');
  const backendSha = env.PHASSCODE_RELEASE_BACKEND_SHA;
  const frontendSha = env.PHASSCODE_RELEASE_FRONTEND_SHA;
  if (
    typeof backendSha !== 'string' ||
    !SHA.test(backendSha) ||
    typeof frontendSha !== 'string' ||
    !SHA.test(frontendSha)
  )
    return reason('PAIR_PINS_MISSING_OR_INVALID');
  const selfSha = role === 'backend' ? backendSha : frontendSha;
  if (env.GITHUB_SHA !== selfSha) return reason('CURRENT_SHA_NOT_APPROVED');
  if (backendSha === frontendSha) return reason('CROSS_REPO_SHA_COLLISION');
  return { ok: true, code: 'PINNED_PAIR_ACCEPTED' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const outcome = validateReleasePair(process.argv[2], process.env);
  // A passing tuple authorizes only *tests*, not deployment.
  process.stdout.write(outcome.code + '\n');
  if (!outcome.ok) process.exitCode = 2;
}
