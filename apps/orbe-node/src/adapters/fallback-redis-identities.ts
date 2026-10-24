import { createHash } from 'node:crypto';
import type {
  LlmFallbackProviderConfig,
  LlmFallbackProviderId,
} from '../../../../packages/shared-config/src/llm-fallback.js';

type ProviderIdentity = Pick<LlmFallbackProviderConfig, 'id' | 'apiKey' | 'model'>;

// These are deterministic Redis resource identifiers, never password verifiers or
// authentication tokens. Fast hashing avoids putting API credentials in key names;
// it does not make weak credentials resistant to guessing or grant access to Redis.
// Preserve this existing 128-bit fingerprint and serialization: changing either
// would create fresh quota/cooldown state and split replicas during a rollout.
const resourceFingerprint = (value: string): string =>
  createHash('sha256').update(value).digest('hex').slice(0, 32);

export function createFallbackRedisIdentities(
  globalBudgetKey: string,
  providers: readonly ProviderIdentity[],
): {
  cooldownKeyPrefix: string;
  providers: ReadonlyMap<LlmFallbackProviderId, { quotaKey: string; cooldownId: string }>;
} {
  const namespace = `phasscode:llm:fb:${resourceFingerprint(globalBudgetKey)}`;
  return {
    cooldownKeyPrefix: `${namespace}:cool`,
    providers: new Map(
      providers.map(({ id, apiKey, model }) => [
        id,
        {
          // A model change must not renew the same provider credential's quota.
          quotaKey: `${namespace}:quota:${id}:${resourceFingerprint(apiKey)}`,
          // Availability is specific to the provider + credential + model route.
          cooldownId: `${id}-${resourceFingerprint(JSON.stringify([id, apiKey, model]))}`,
        },
      ]),
    ),
  };
}
