export interface DockerInvocation {
  env: NodeJS.ProcessEnv;
  phase: string;
  timeout?: number;
  signal?: AbortSignal;
}
export type DockerExecutor = (args: string[], options: DockerInvocation) => Promise<string>;
export function parseImage(args: string[]): string;
export function qualifyImage(
  image: string,
  options?: { docker?: DockerExecutor; signal?: AbortSignal },
): Promise<{ imageId: string; project: string }>;
