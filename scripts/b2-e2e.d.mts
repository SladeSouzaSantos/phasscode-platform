export interface DockerInvocation {
  env: NodeJS.ProcessEnv;
  phase: string;
  timeout?: number;
  signal?: AbortSignal;
}
export type DockerExecutor = (args: string[], options: DockerInvocation) => Promise<string>;
export interface SnapshotMetadata {
  branch: string;
  head: string;
  files: number;
  snapshotSha256: string;
}
export interface IntegratedOptions {
  frontend: string;
  artifacts?: string;
  regression?: boolean;
  regressionOnly?: boolean;
  frontendOnly?: boolean;
  grep?: string;
  frontendGrep?: string;
  frontendSuites?: Array<'default' | 'f1' | 'f2' | 'phase3' | 'orbe'>;
}
export function parseArguments(args: string[]): IntegratedOptions;
export function isLocalEndpoint(endpoint: string): boolean;
export function dockerEnvironment(environment?: NodeJS.ProcessEnv): NodeJS.ProcessEnv;
export function snapshotPathAllowed(name: string, kind: 'backend' | 'frontend'): boolean;
export function runIntegratedE2e(
  options: IntegratedOptions,
  dependencies?: {
    docker?: DockerExecutor;
    prepareSnapshot?: (
      directory: string,
      checkout: string,
      kind: 'backend' | 'frontend',
    ) => Promise<SnapshotMetadata>;
    signal?: AbortSignal;
  },
): Promise<{ project: string; imageId: string; artifactDirectory: string }>;
