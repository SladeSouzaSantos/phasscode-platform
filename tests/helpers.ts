import { loadConfig } from '../packages/shared-config/src/index.js';
import { buildApp, type AppOptions } from '../apps/orbe-node/src/http/app.js';
import { JsonKnowledgeRepository } from '../apps/orbe-node/src/adapters/knowledge.js';
import { MemoryConversationStore } from '../apps/orbe-node/src/adapters/memory-store.js';
import { MockChatProvider } from '../apps/orbe-node/src/adapters/mock-provider.js';

export async function testApp(overrides: Partial<AppOptions> = {}) {
  return buildApp({
    config: loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent', RATE_LIMIT_MAX: '100' }),
    store: new MemoryConversationStore(),
    provider: new MockChatProvider(),
    knowledge: await JsonKnowledgeRepository.load(),
    ...overrides,
  });
}
