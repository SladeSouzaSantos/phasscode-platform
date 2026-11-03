import { readFile } from 'node:fs/promises';

const READER_SECRET_PATH = '/run/secrets/graph_reader_token';
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43,128}$/;

/**
 * Load only the dedicated Docker secret for the unprivileged HTTP graph
 * reader. This is called ONLY by the explicitly approved DEV shadow mode,
 * never by the canonical/production path or the Neo4j maintenance process.
 *
 * A test may inject an in-memory secret reader. There is no configurable
 * arbitrary filesystem path and no raw bearer token environment variable.
 */
export async function loadDevGraphReaderToken(
  env: NodeJS.ProcessEnv,
  readSecret: (path: string) => Promise<string> = (path) => readFile(path, 'utf8'),
): Promise<string> {
  if (
    env.ORBE_GRAPHRAG_MODE !== 'shadow' ||
    env.ORBE_GRAPHRAG_STAGE !== 'dev' ||
    env.ORBE_GRAPHRAG_DEV_APPROVED !== 'true'
  ) {
    throw new Error('GRAPH_READER_DEV_SHADOW_ONLY');
  }
  if (env.ORBE_GRAPH_READER_TOKEN !== undefined) {
    throw new Error('GRAPH_READER_PLAINTEXT_ENV_FORBIDDEN');
  }
  if (env.ORBE_GRAPH_READER_TOKEN_FILE !== READER_SECRET_PATH) {
    throw new Error('GRAPH_READER_SECRET_FILE_REQUIRED');
  }

  let raw: string;
  try {
    raw = await readSecret(READER_SECRET_PATH);
  } catch {
    throw new Error('GRAPH_READER_SECRET_UNAVAILABLE');
  }
  const token = raw.trim();
  if (!TOKEN_FORMAT.test(token)) throw new Error('GRAPH_READER_SECRET_INVALID');
  return token;
}
