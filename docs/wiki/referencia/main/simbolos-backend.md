# Inventário AST de símbolos — backend

**Fonte fixada:** `phasscode-platform@c302ec444266333756d9f35bc9c1dfd7a5e7c684`. **Método:** compilador TypeScript, coleta de classes, métodos, funções nomeadas, arrow functions declaradas, tipos, interfaces, enums e variáveis exportadas. Inclui arquivos de testes; não resolve chamadas dinâmicas nem callbacks anônimos.

**Total:** 237 arquivos TypeScript/JavaScript, 994 declarações identificadas.

## [apps/orbe-node/src/adapters/academic.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/academic.ts)

SHA-256: `b53024b1dbca02e804be8a4d59b97861a1a16e82f5d567055b79580af9e4eb7a` · Imports e reexports declarados: 5.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L7](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/academic.ts#L7) | `Coursework` | interface | Não |
| [L13](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/academic.ts#L13) | `Education` | interface | Não |
| [L52](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/academic.ts#L52) | `Course` | type | Não |
| [L53](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/academic.ts#L53) | `Track` | type | Não |
| [L54](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/academic.ts#L54) | `Skill` | interface | Sim |
| [L62](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/academic.ts#L62) | `AcademicEvidence` | interface | Sim |
| [L69](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/academic.ts#L69) | `loadAcademicEvidence` | function | Sim |
| [L96](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/academic.ts#L96) | `CompleteAcademicCourseListing` | interface | Sim |
| [L103](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/academic.ts#L103) | `requestedCompleteJavaCourses` | function | Sim |
| [L136](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/academic.ts#L136) | `enrichAcademicDocument` | function | Sim |

## [apps/orbe-node/src/adapters/fallback-llm.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/fallback-llm.ts)

SHA-256: `3fbf13cb88673f97361feaff3e4febd303db4f6ea6e8c4cf89564c1bd47a9e9f` · Imports e reexports declarados: 13.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L22](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/fallback-llm.ts#L22) | `EnabledFallback` | type | Não |
| [L23](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/fallback-llm.ts#L23) | `LlmInvocationEvent` | interface | Sim |
| [L28](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/fallback-llm.ts#L28) | `FallbackDependencies` | interface | Não |
| [L41](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/fallback-llm.ts#L41) | `createFallbackInvocationFactory` | function | Sim |
| [L113](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/fallback-llm.ts#L113) | `createRedisFallbackInvocationFactory` | function | Sim |

## [apps/orbe-node/src/adapters/fallback-redis-identities.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/fallback-redis-identities.ts)

SHA-256: `9c5857ea1fc028161e6d0cb48e4e3df75ab33b2cfd256729c61a1ee793229b0c` · Imports e reexports declarados: 2.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L7](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/fallback-redis-identities.ts#L7) | `ProviderIdentity` | type | Não |
| [L14](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/fallback-redis-identities.ts#L14) | `resourceFingerprint` | arrow-function | Não |
| [L17](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/fallback-redis-identities.ts#L17) | `createFallbackRedisIdentities` | function | Sim |

## [apps/orbe-node/src/adapters/graph-reader-http.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/graph-reader-http.ts)

SHA-256: `8ca601f40eeeedfc482eb94c185a71668d0b7e6f38dcf969e92880ee727afc05` · Imports e reexports declarados: 2.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L33](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/graph-reader-http.ts#L33) | `GraphReaderHttpOptions` | interface | Sim |
| [L44](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/graph-reader-http.ts#L44) | `GraphReaderHttpRepository` | class | Sim |
| [L48](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/graph-reader-http.ts#L48) | `GraphReaderHttpRepository.constructor` | constructor | Não |
| [L54](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/graph-reader-http.ts#L54) | `GraphReaderHttpRepository.request` | method | Não |
| [L100](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/graph-reader-http.ts#L100) | `GraphReaderHttpRepository.findEvidence` | method | Não |
| [L140](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/graph-reader-http.ts#L140) | `GraphReaderHttpRepository.getSource` | method | Não |

## [apps/orbe-node/src/adapters/knowledge.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/knowledge.ts)

SHA-256: `3b7d87877378615646e3afa5b5667215515c810e04ae958110c2df7e291ee2bb` · Imports e reexports declarados: 9.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L67](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/knowledge.ts#L67) | `isCareerOverview` | function | Não |
| [L76](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/knowledge.ts#L76) | `isTechnologyProjectQuestion` | function | Não |
| [L94](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/knowledge.ts#L94) | `competencyEvidenceIds` | function | Sim |
| [L128](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/knowledge.ts#L128) | `JsonKnowledgeRepository` | class | Sim |
| [L129](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/knowledge.ts#L129) | `JsonKnowledgeRepository.constructor` | constructor | Não |
| [L136](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/knowledge.ts#L136) | `JsonKnowledgeRepository.select` | method | Não |
| [L165](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/knowledge.ts#L165) | `JsonKnowledgeRepository.load` | method | Não |
| [L183](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/knowledge.ts#L183) | `JsonKnowledgeRepository.semanticContext` | method | Não |
| [L186](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/knowledge.ts#L186) | `JsonKnowledgeRepository.experienceDocuments` | method | Não |
| [L189](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/knowledge.ts#L189) | `JsonKnowledgeRepository.academicCourseListing` | method | Não |
| [L192](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/knowledge.ts#L192) | `JsonKnowledgeRepository.canonicalAcademicFacts` | method | Não |
| [L206](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/knowledge.ts#L206) | `JsonKnowledgeRepository.getDocument` | method | Não |
| [L209](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/knowledge.ts#L209) | `JsonKnowledgeRepository.search` | method | Não |

## [apps/orbe-node/src/adapters/langchain-provider.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/langchain-provider.ts)

SHA-256: `29980a984aa6979cebcfb0fd39be7354dc04c1e1aa0e55ff9fcd0746a0c20f6e` · Imports e reexports declarados: 17.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L53](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/langchain-provider.ts#L53) | `LangChainChatProvider` | class | Sim |
| [L57](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/langchain-provider.ts#L57) | `LangChainChatProvider.constructor` | constructor | Não |
| [L89](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/langchain-provider.ts#L89) | `LangChainChatProvider.generate` | method | Não |

## [apps/orbe-node/src/adapters/llm-invocation-controller.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/llm-invocation-controller.ts)

SHA-256: `cf91ccd887ae5678e27099b81ce2c8e06ac2d7b1d16e744cbc76234160af331b` · Imports e reexports declarados: 2.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L4](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/llm-invocation-controller.ts#L4) | `LlmCooldownStore` | interface | Sim |
| [L8](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/llm-invocation-controller.ts#L8) | `LlmInvocationCandidate` | interface | Sim |
| [L12](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/llm-invocation-controller.ts#L12) | `LlmInvocationOptions` | interface | Sim |
| [L19](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/llm-invocation-controller.ts#L19) | `LlmInvocationHooks` | interface | Sim |
| [L26](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/llm-invocation-controller.ts#L26) | `LlmInvocationResult` | interface | Sim |
| [L32](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/llm-invocation-controller.ts#L32) | `Failure` | type | Não |
| [L34](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/llm-invocation-controller.ts#L34) | `LlmCandidateDiagnostic` | interface | Sim |
| [L40](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/llm-invocation-controller.ts#L40) | `LlmInvocationDiagnostic` | interface | Sim |
| [L72](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/llm-invocation-controller.ts#L72) | `unavailable` | arrow-function | Não |
| [L80](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/llm-invocation-controller.ts#L80) | `field` | function | Não |
| [L87](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/llm-invocation-controller.ts#L87) | `className` | function | Não |
| [L97](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/llm-invocation-controller.ts#L97) | `classifyLlmInvocationFailure` | function | Sim |
| [L128](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/llm-invocation-controller.ts#L128) | `retryHeader` | function | Não |
| [L139](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/llm-invocation-controller.ts#L139) | `llmRetryAfterMs` | function | Sim |
| [L161](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/llm-invocation-controller.ts#L161) | `AttemptTimeout` | class | Não |
| [L162](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/llm-invocation-controller.ts#L162) | `invokeWithDeadline` | function | Não |
| [L196](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/llm-invocation-controller.ts#L196) | `LlmInvocationController` | class | Sim |
| [L202](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/llm-invocation-controller.ts#L202) | `LlmInvocationController.constructor` | constructor | Não |
| [L231](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/llm-invocation-controller.ts#L231) | `LlmInvocationController.createTurn` | method | Não |
| [L236](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/llm-invocation-controller.ts#L236) | `LlmInvocationTurn` | class | Sim |
| [L241](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/llm-invocation-controller.ts#L241) | `LlmInvocationTurn.constructor` | constructor | Não |
| [L245](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/llm-invocation-controller.ts#L245) | `LlmInvocationTurn.attempts` | method | Não |
| [L248](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/llm-invocation-controller.ts#L248) | `LlmInvocationTurn.fallbackUsed` | method | Não |
| [L251](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/llm-invocation-controller.ts#L251) | `LlmInvocationTurn.bounded` | method | Não |
| [L255](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/llm-invocation-controller.ts#L255) | `LlmInvocationTurn.remaining` | method | Não |
| [L261](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/llm-invocation-controller.ts#L261) | `LlmInvocationTurn.run` | method | Não |

## [apps/orbe-node/src/adapters/llm-model-factory.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/llm-model-factory.ts)

SHA-256: `954c53b5ce56c55aa40cf7aa850a8bc256143de57e8155f151dd81789775481e` · Imports e reexports declarados: 8.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L14](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/llm-model-factory.ts#L14) | `LLM_PROVIDER_METADATA_KEY` | exported-variable | Sim |
| [L15](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/llm-model-factory.ts#L15) | `LLM_FALLBACK_BASE_URLS` | exported-variable | Sim |
| [L23](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/llm-model-factory.ts#L23) | `BoundModelPort` | interface | Sim |
| [L27](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/llm-model-factory.ts#L27) | `FallbackModelFactoryConfig` | interface | Sim |
| [L38](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/llm-model-factory.ts#L38) | `RawCall` | type | Não |
| [L39](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/llm-model-factory.ts#L39) | `NormalizedCall` | interface | Não |
| [L45](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/llm-model-factory.ts#L45) | `invalidTranscript` | arrow-function | Não |
| [L52](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/llm-model-factory.ts#L52) | `isAssistant` | function | Não |
| [L58](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/llm-model-factory.ts#L58) | `callsFrom` | function | Não |
| [L107](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/llm-model-factory.ts#L107) | `signatureOf` | function | Não |
| [L114](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/llm-model-factory.ts#L114) | `replayFor` | function | Não |
| [L172](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/llm-model-factory.ts#L172) | `testEndpoint` | function | Não |
| [L186](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/llm-model-factory.ts#L186) | `createFallbackModelFactory` | function | Sim |

## [apps/orbe-node/src/adapters/memory-store.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/memory-store.ts)

SHA-256: `876bf60df5e3d40587ae6d43cbc6629228d0d03fc23bc983e52cea3a31af1fb0` · Imports e reexports declarados: 4.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L6](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/memory-store.ts#L6) | `Conversation` | interface | Não |
| [L11](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/memory-store.ts#L11) | `MemoryConversationStore` | class | Sim |
| [L14](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/memory-store.ts#L14) | `MemoryConversationStore.constructor` | constructor | Não |
| [L19](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/memory-store.ts#L19) | `MemoryConversationStore.runTurn` | method | Não |
| [L50](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/memory-store.ts#L50) | `MemoryConversationStore.ready` | method | Não |
| [L51](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/memory-store.ts#L51) | `MemoryConversationStore.close` | method | Não |

## [apps/orbe-node/src/adapters/mock-provider.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/mock-provider.ts)

SHA-256: `90afaf3a1c46ef28a6947faa748dab2961e451f1ed7691b1ef8c298c8b8031e4` · Imports e reexports declarados: 2.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L4](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/mock-provider.ts#L4) | `MockChatProvider` | class | Sim |
| [L6](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/mock-provider.ts#L6) | `MockChatProvider.generate` | method | Não |

## [apps/orbe-node/src/adapters/neo4j-driver-store.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/neo4j-driver-store.ts)

SHA-256: `fdc22a3e046a1ea228c6e0918619461bae67a42bf6eab933ed65a559c976c4f7` · Imports e reexports declarados: 3.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L13](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/neo4j-driver-store.ts#L13) | `Neo4jConnectionOptions` | interface | Sim |
| [L21](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/neo4j-driver-store.ts#L21) | `createNeo4jConnection` | function | Sim |
| [L36](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/neo4j-driver-store.ts#L36) | `GraphSeedResult` | interface | Sim |
| [L43](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/neo4j-driver-store.ts#L43) | `Neo4jGraphStore` | class | Sim |
| [L44](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/neo4j-driver-store.ts#L44) | `Neo4jGraphStore.constructor` | constructor | Não |
| [L49](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/neo4j-driver-store.ts#L49) | `Neo4jGraphStore.verifyConnectivity` | method | Não |
| [L53](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/neo4j-driver-store.ts#L53) | `Neo4jGraphStore.read` | method | Não |
| [L84](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/neo4j-driver-store.ts#L84) | `Neo4jGraphStore.seed` | method | Não |
| [L111](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/neo4j-driver-store.ts#L111) | `Neo4jGraphStore.count` | method | Não |
| [L139](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/neo4j-driver-store.ts#L139) | `Neo4jGraphStore.close` | method | Não |
| [L145](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/neo4j-driver-store.ts#L145) | `graphOrCanonical` | function | Sim |

## [apps/orbe-node/src/adapters/neo4j-graph-queries.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/neo4j-graph-queries.ts)

SHA-256: `38633d99d9946108518bb292b0e28284e208ac4944585df270fdf82798a2f0e7` · Imports e reexports declarados: 2.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L16](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/neo4j-graph-queries.ts#L16) | `graphConstraintCypher` | exported-variable | Sim |
| [L19](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/neo4j-graph-queries.ts#L19) | `graphNodesCypher` | exported-variable | Sim |
| [L25](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/neo4j-graph-queries.ts#L25) | `graphRelationsCypher` | exported-variable | Sim |
| [L34](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/neo4j-graph-queries.ts#L34) | `graphPruneRelationsCypher` | exported-variable | Sim |
| [L36](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/neo4j-graph-queries.ts#L36) | `graphPruneNodesCypher` | exported-variable | Sim |
| [L43](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/neo4j-graph-queries.ts#L43) | `CypherOperation` | interface | Sim |
| [L48](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/neo4j-graph-queries.ts#L48) | `Neo4jGraphSeedPlan` | interface | Sim |
| [L56](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/neo4j-graph-queries.ts#L56) | `planNeo4jGraphSeed` | function | Sim |
| [L90](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/neo4j-graph-queries.ts#L90) | `GraphReadExecutor` | interface | Sim |
| [L95](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/neo4j-graph-queries.ts#L95) | `graphFindEvidenceCypher` | exported-variable | Sim |
| [L106](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/neo4j-graph-queries.ts#L106) | `graphGetSourceCypher` | exported-variable | Sim |
| [L111](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/neo4j-graph-queries.ts#L111) | `evidenceRow` | arrow-function | Não |
| [L123](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/neo4j-graph-queries.ts#L123) | `Neo4jEvidenceRepository` | class | Sim |
| [L124](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/neo4j-graph-queries.ts#L124) | `Neo4jEvidenceRepository.constructor` | constructor | Não |
| [L126](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/neo4j-graph-queries.ts#L126) | `Neo4jEvidenceRepository.findEvidence` | method | Não |
| [L158](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/neo4j-graph-queries.ts#L158) | `Neo4jEvidenceRepository.getSource` | method | Não |

## [apps/orbe-node/src/adapters/postgres-store.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/postgres-store.ts)

SHA-256: `148c54ac6e21783b3d0b3ac03557f5742e21e70ceedaa5a4f8f8b880506d35cd` · Imports e reexports declarados: 6.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L11](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/postgres-store.ts#L11) | `PostgresConversationStore` | class | Sim |
| [L12](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/postgres-store.ts#L12) | `PostgresConversationStore.constructor` | constructor | Não |
| [L18](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/postgres-store.ts#L18) | `PostgresConversationStore.runTurn` | method | Não |
| [L141](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/postgres-store.ts#L141) | `PostgresConversationStore.withdrawReport` | method | Não |
| [L164](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/postgres-store.ts#L164) | `PostgresConversationStore.ready` | method | Não |
| [L171](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/postgres-store.ts#L171) | `PostgresConversationStore.close` | method | Não |

## [apps/orbe-node/src/adapters/ppks-evidence-graph.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/ppks-evidence-graph.ts)

SHA-256: `3ce8fde9e379927cf287a308e3e9d709185a608995247774fe2f74cf522d001f` · Imports e reexports declarados: 5.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L53](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/ppks-evidence-graph.ts#L53) | `PpksRecord` | type | Não |
| [L54](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/ppks-evidence-graph.ts#L54) | `Node` | type | Não |
| [L55](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/ppks-evidence-graph.ts#L55) | `Relation` | type | Não |
| [L57](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/ppks-evidence-graph.ts#L57) | `skillId` | arrow-function | Não |
| [L66](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/ppks-evidence-graph.ts#L66) | `sourceId` | arrow-function | Não |
| [L68](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/ppks-evidence-graph.ts#L68) | `isGitHubEvidence` | function | Não |
| [L81](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/ppks-evidence-graph.ts#L81) | `sourceFromRecord` | function | Não |
| [L101](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/ppks-evidence-graph.ts#L101) | `readRecord` | function | Não |
| [L118](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/ppks-evidence-graph.ts#L118) | `projectPpksEvidenceGraph` | function | Sim |

## [apps/orbe-node/src/adapters/ppks.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/ppks.ts)

SHA-256: `c56e9f5b3aa8b42b4c2a2a289e26b24692a3b542092d7b52bcf03712bf88e5dc` · Imports e reexports declarados: 4.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L6](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/ppks.ts#L6) | `TechnicalCard` | interface | Sim |
| [L28](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/ppks.ts#L28) | `Index` | interface | Não |
| [L32](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/ppks.ts#L32) | `ExperienceCard` | interface | Sim |
| [L47](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/ppks.ts#L47) | `loadPpksExperienceCards` | function | Sim |
| [L67](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/ppks.ts#L67) | `enrichExperienceDocument` | function | Sim |
| [L99](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/ppks.ts#L99) | `loadPpksCards` | function | Sim |
| [L119](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/ppks.ts#L119) | `enrichProjectDocument` | function | Sim |

## [apps/orbe-node/src/adapters/redis-llm-budget.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/redis-llm-budget.ts)

SHA-256: `74c117089af727ccd464a711840f6b4bc62853f3661f16e83cbda11f216698b5` · Imports e reexports declarados: 2.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L4](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/redis-llm-budget.ts#L4) | `BudgetRedis` | interface | Não |
| [L43](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/redis-llm-budget.ts#L43) | `unavailable` | arrow-function | Não |
| [L50](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/redis-llm-budget.ts#L50) | `RedisLlmCallBudget` | class | Sim |
| [L51](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/redis-llm-budget.ts#L51) | `RedisLlmCallBudget.constructor` | constructor | Não |
| [L68](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/redis-llm-budget.ts#L68) | `RedisLlmCallBudget.reserve` | method | Não |

## [apps/orbe-node/src/adapters/redis-llm-cooldown.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/redis-llm-cooldown.ts)

SHA-256: `1032b25038c52cf892241d5820a73a98c5a2c2869ef6e93ab0195b42e2bb5892` · Imports e reexports declarados: 2.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L4](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/redis-llm-cooldown.ts#L4) | `CooldownRedis` | interface | Não |
| [L24](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/redis-llm-cooldown.ts#L24) | `unavailable` | arrow-function | Não |
| [L32](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/redis-llm-cooldown.ts#L32) | `RedisLlmCooldownStore` | class | Sim |
| [L33](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/redis-llm-cooldown.ts#L33) | `RedisLlmCooldownStore.constructor` | constructor | Não |
| [L45](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/redis-llm-cooldown.ts#L45) | `RedisLlmCooldownStore.key` | method | Não |
| [L49](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/redis-llm-cooldown.ts#L49) | `RedisLlmCooldownStore.eval` | method | Não |
| [L65](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/redis-llm-cooldown.ts#L65) | `RedisLlmCooldownStore.remainingMs` | method | Não |
| [L68](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/redis-llm-cooldown.ts#L68) | `RedisLlmCooldownStore.block` | method | Não |

## [apps/orbe-node/src/adapters/semantic-graph.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/semantic-graph.ts)

SHA-256: `fbfbe8f87ae978bacb197f44b7e727888e65bb531023c48ab8442a44ad27a616` · Imports e reexports declarados: 5.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L33](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/semantic-graph.ts#L33) | `Graph` | type | Não |
| [L34](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/semantic-graph.ts#L34) | `Node` | type | Não |
| [L37](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/semantic-graph.ts#L37) | `SemanticKnowledgeGraph` | class | Sim |
| [L38](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/semantic-graph.ts#L38) | `SemanticKnowledgeGraph.constructor` | constructor | Não |
| [L51](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/semantic-graph.ts#L51) | `SemanticKnowledgeGraph.load` | method | Não |
| [L59](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/semantic-graph.ts#L59) | `SemanticKnowledgeGraph.matches` | method | Não |
| [L69](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/semantic-graph.ts#L69) | `SemanticKnowledgeGraph.directSources` | method | Não |
| [L106](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/semantic-graph.ts#L106) | `SemanticKnowledgeGraph.evidenceIds` | method | Não |
| [L151](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/adapters/semantic-graph.ts#L151) | `SemanticKnowledgeGraph.describe` | method | Não |

## [apps/orbe-node/src/application/academic-response.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/academic-response.ts)

SHA-256: `1eb2846f600b12c0f8076500ddfd99973098533738d22f9bae8d9f04732e672f` · Imports e reexports declarados: 4.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L7](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/academic-response.ts#L7) | `buildCompleteAcademicResponse` | function | Sim |

## [apps/orbe-node/src/application/canonical-claims.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/canonical-claims.ts)

SHA-256: `3138500c5efd14070620c3eefd33037acbaa7e12e6d4b1af32335aa20879370a` · Imports e reexports declarados: 1.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L3](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/canonical-claims.ts#L3) | `CanonicalClaimsResult` | interface | Sim |
| [L14](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/canonical-claims.ts#L14) | `reconcileCanonicalAcademicClaims` | function | Sim |

## [apps/orbe-node/src/application/chat.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/chat.ts)

SHA-256: `8249735d8b0e8e32c210da1f74d834a287607faea198031712f598e4a99eff67` · Imports e reexports declarados: 22.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L62](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/chat.ts#L62) | `PROMPT_VERSION` | exported-variable | Sim |
| [L63](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/chat.ts#L63) | `ChatService` | class | Sim |
| [L64](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/chat.ts#L64) | `ChatService.constructor` | constructor | Não |
| [L77](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/chat.ts#L77) | `ChatService.execute` | method | Não |

## [apps/orbe-node/src/application/context.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/context.ts)

SHA-256: `35b896b49fc9adcc5b6ed5194d4f6df2453d982d3672d09d538590b2de862aff` · Imports e reexports declarados: 2.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L24](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/context.ts#L24) | `eligibleHistory` | function | Sim |

## [apps/orbe-node/src/application/evidence-packet.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/evidence-packet.ts)

SHA-256: `10954954c08c7101970e238dca7d2ba1867c95fda2803b1f1fbe59f5fd91e0a0` · Imports e reexports declarados: 2.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L9](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/evidence-packet.ts#L9) | `MIN_SOURCE_CONTENT` | exported-variable | Sim |
| [L10](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/evidence-packet.ts#L10) | `CORE_SOURCE_CONTENT` | exported-variable | Sim |
| [L12](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/evidence-packet.ts#L12) | `EvidencePacket` | interface | Sim |
| [L19](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/evidence-packet.ts#L19) | `buildEvidencePacket` | function | Sim |
| [L169](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/evidence-packet.ts#L169) | `EvidenceTraceStage` | type | Sim |
| [L173](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/evidence-packet.ts#L173) | `traceEvidence` | function | Sim |

## [apps/orbe-node/src/application/experience-context.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/experience-context.ts)

SHA-256: `9468c794a5a14ae36a323545c07190f21f2cc90fdd3c5ce916114f1395977f91` · Imports e reexports declarados: 4.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L6](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/experience-context.ts#L6) | `isExperienceDurationQuestion` | function | Sim |
| [L20](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/experience-context.ts#L20) | `isCareerDurationEllipsis` | function | Sim |
| [L33](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/experience-context.ts#L33) | `rewriteCareerDurationEllipsis` | function | Sim |
| [L52](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/experience-context.ts#L52) | `experienceContext` | function | Sim |
| [L120](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/experience-context.ts#L120) | `reconcileExperienceAttribution` | function | Sim |

## [apps/orbe-node/src/application/experience-response.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/experience-response.ts)

SHA-256: `9b97333ea85a2589ea7f83eb2d78c783803933e903b1374840035829bbed4311` · Imports e reexports declarados: 6.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L23](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/experience-response.ts#L23) | `monthLabel` | function | Não |
| [L32](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/experience-response.ts#L32) | `formatApproximateExperience` | function | Sim |
| [L42](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/experience-response.ts#L42) | `employerName` | function | Não |
| [L48](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/experience-response.ts#L48) | `describeEmployment` | function | Não |
| [L72](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/experience-response.ts#L72) | `isBroadProfessionalExperienceQuestion` | function | Sim |
| [L107](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/experience-response.ts#L107) | `buildVerifiedProfessionalOverviewResponse` | function | Sim |
| [L149](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/experience-response.ts#L149) | `buildVerifiedExperienceDurationResponse` | function | Sim |

## [apps/orbe-node/src/application/go-experience-response.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/go-experience-response.ts)

SHA-256: `4df5d19d00ba532d8a6a4e7875dc10136f083dc181b1ea1c42167e01a44e93ca` · Imports e reexports declarados: 3.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L10](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/go-experience-response.ts#L10) | `buildDirectGoExperienceResponse` | function | Sim |

## [apps/orbe-node/src/application/graph-active-answer.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-active-answer.ts)

SHA-256: `a3261349c14eb2b1796ec885cdc1c350e0bfc811293bdc1c152a0d54036d34c5` · Imports e reexports declarados: 8.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L17](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-active-answer.ts#L17) | `GraphActiveTurn` | interface | Sim |
| [L24](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-active-answer.ts#L24) | `GraphActivePort` | interface | Sim |
| [L29](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-active-answer.ts#L29) | `normalize` | arrow-function | Não |
| [L68](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-active-answer.ts#L68) | `isFocusedQuestion` | function | Não |
| [L92](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-active-answer.ts#L92) | `createGraphRagActive` | function | Sim |

## [apps/orbe-node/src/application/graph-generated-prose-audit.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-generated-prose-audit.ts)

SHA-256: `dccb0aaa3e617de9d80eb59fea1535bb6d793dcb4a14777965fab5ce965ea99e` · Imports e reexports declarados: 2.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L8](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-generated-prose-audit.ts#L8) | `ClaimAuditRule` | type | Não |
| [L10](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-generated-prose-audit.ts#L10) | `GeneratedClaimAudit` | interface | Sim |
| [L18](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-generated-prose-audit.ts#L18) | `normalize` | arrow-function | Não |
| [L26](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-generated-prose-audit.ts#L26) | `containsName` | arrow-function | Não |
| [L33](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-generated-prose-audit.ts#L33) | `containsProjectReference` | arrow-function | Não |
| [L38](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-generated-prose-audit.ts#L38) | `monthLabel` | arrow-function | Não |
| [L57](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-generated-prose-audit.ts#L57) | `monthsInEngagement` | arrow-function | Não |
| [L63](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-generated-prose-audit.ts#L63) | `publicSources` | function | Não |
| [L86](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-generated-prose-audit.ts#L86) | `auditGeneratedRecruiterProse` | function | Sim |

## [apps/orbe-node/src/application/graph-narrative-verifier.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-narrative-verifier.ts)

SHA-256: `96a616b426ab942863dc33aab4037edc4f1ad10da80cfec99c32a2f256b84572` · Imports e reexports declarados: 3.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L17](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-narrative-verifier.ts#L17) | `GroundedNarrativeSelection` | type | Sim |
| [L27](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-narrative-verifier.ts#L27) | `verifyAndRenderNarrativeSelection` | function | Sim |

## [apps/orbe-node/src/application/graph-professional-advocacy.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-professional-advocacy.ts)

SHA-256: `53bbf6b22a0b9bf4e61065893fb32e189fbc5359bb61d2e33a2ddd5f483ed829` · Imports e reexports declarados: 1.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L7](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-professional-advocacy.ts#L7) | `ProfessionalRenderOptions` | interface | Sim |
| [L31](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-professional-advocacy.ts#L31) | `supportingFacts` | function | Não |
| [L70](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-professional-advocacy.ts#L70) | `renderProfessionalAdvocacy` | function | Sim |

## [apps/orbe-node/src/application/graph-public-policy.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-public-policy.ts)

SHA-256: `dfb5951ec85823f65f4d76182b8eb956dbce654030e2fadffb49bf3487ddf16a` · Imports e reexports declarados: 1.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L16](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-public-policy.ts#L16) | `PublicGraphEvidenceGateway` | class | Sim |
| [L17](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-public-policy.ts#L17) | `PublicGraphEvidenceGateway.constructor` | constructor | Não |
| [L19](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-public-policy.ts#L19) | `PublicGraphEvidenceGateway.findEvidence` | method | Não |
| [L55](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-public-policy.ts#L55) | `PublicGraphEvidenceGateway.getSource` | method | Não |
| [L67](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-public-policy.ts#L67) | `assertPublicOrbeGraphIsolation` | function | Sim |

## [apps/orbe-node/src/application/graph-rag-shadow.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-rag-shadow.ts)

SHA-256: `c82d5f75739ec797ad7348157387859fac04d8ae003198917a11d6d5e789809e` · Imports e reexports declarados: 5.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L7](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-rag-shadow.ts#L7) | `graphShadowObservationSchema` | exported-variable | Sim |
| [L20](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-rag-shadow.ts#L20) | `GraphShadowObservation` | type | Sim |
| [L22](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-rag-shadow.ts#L22) | `GraphShadowPort` | interface | Sim |
| [L33](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-rag-shadow.ts#L33) | `createGraphRagShadow` | function | Sim |

## [apps/orbe-node/src/application/graph-reader-secret.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-reader-secret.ts)

SHA-256: `e857405aec843c16cb162e21014463be0cd701b48404f4fbe5156d4fde3f6c04` · Imports e reexports declarados: 1.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L14](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-reader-secret.ts#L14) | `loadDevGraphReaderToken` | function | Sim |

## [apps/orbe-node/src/application/graph-recruiter-preview.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-recruiter-preview.ts)

SHA-256: `960bca14d1cce1f693df947e3a4076de32354eeef2b739cde4f34e9a9a1f0eaa` · Imports e reexports declarados: 7.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L22](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-recruiter-preview.ts#L22) | `GraphRecruiterPreviewOptions` | interface | Sim |
| [L36](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-recruiter-preview.ts#L36) | `GraphRecruiterPreviewResult` | type | Sim |
| [L51](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-recruiter-preview.ts#L51) | `evaluateGraphRecruiterPreview` | function | Sim |

## [apps/orbe-node/src/application/graph-requirements.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-requirements.ts)

SHA-256: `05361add8cecf44ed344637f830bf8d72a222de4c0f1fb8bf5f38bc5cc8019e0` · Imports e reexports declarados: 2.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L14](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-requirements.ts#L14) | `RequirementSkill` | type | Sim |
| [L16](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-requirements.ts#L16) | `normalized` | arrow-function | Não |
| [L24](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-requirements.ts#L24) | `Pattern` | interface | Não |
| [L31](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-requirements.ts#L31) | `createCatalogRequirementIdentifier` | function | Sim |
| [L95](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-requirements.ts#L95) | `createSnapshotRequirementIdentifier` | function | Sim |

## [apps/orbe-node/src/application/graph-semantic-vacancy.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-semantic-vacancy.ts)

SHA-256: `68cfff917f1ae5ac807dbc02feef51896a645dcfea386b30cbaad79d658279b7` · Imports e reexports declarados: 4.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L21](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-semantic-vacancy.ts#L21) | `BudgetedSemanticVacancyOptions` | interface | Sim |
| [L56](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-semantic-vacancy.ts#L56) | `createBudgetedSemanticVacancyProposer` | function | Sim |

## [apps/orbe-node/src/application/graph-snapshot-diff.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-snapshot-diff.ts)

SHA-256: `c578a5e1e51b48940c36b4f049dc0313a1bc94ae65f69798d17ebdc90f25c973` · Imports e reexports declarados: 2.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L7](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-snapshot-diff.ts#L7) | `GraphNode` | type | Não |
| [L8](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-snapshot-diff.ts#L8) | `GraphRelation` | type | Não |
| [L9](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-snapshot-diff.ts#L9) | `Delta` | type | Não |
| [L11](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-snapshot-diff.ts#L11) | `GraphSnapshotDelta` | interface | Sim |
| [L21](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-snapshot-diff.ts#L21) | `GraphSnapshotDiff` | interface | Sim |
| [L34](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-snapshot-diff.ts#L34) | `normalizeNode` | function | Não |
| [L44](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-snapshot-diff.ts#L44) | `normalizeRelation` | function | Não |
| [L48](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-snapshot-diff.ts#L48) | `relationKey` | function | Não |
| [L52](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-snapshot-diff.ts#L52) | `entries` | function | Não |
| [L66](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-snapshot-diff.ts#L66) | `stableDigest` | function | Não |
| [L74](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-snapshot-diff.ts#L74) | `fieldsChanged` | function | Não |
| [L80](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-snapshot-diff.ts#L80) | `compare` | function | Não |
| [L112](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-snapshot-diff.ts#L112) | `diffGraphSnapshots` | function | Sim |

## [apps/orbe-node/src/application/graph-transfer-planner.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-transfer-planner.ts)

SHA-256: `d3cf6722b2a175b7d399f722fbeee9afb2d3d8052f8f0775572a8dc7c1265f89` · Imports e reexports declarados: 2.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L29](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-transfer-planner.ts#L29) | `CuratedSemanticRelations` | type | Sim |
| [L31](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-transfer-planner.ts#L31) | `skillKey` | arrow-function | Não |
| [L46](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-transfer-planner.ts#L46) | `deriveCuratedTransferableSkills` | function | Sim |

## [apps/orbe-node/src/application/graph-turn-llm-budget.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-turn-llm-budget.ts)

SHA-256: `8444a4bb131cc59ab7eba68dbb20e1a08159d36cd24ee57152b8cb1431db9b5f` · Imports e reexports declarados: 2.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L4](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-turn-llm-budget.ts#L4) | `GraphTurnLlmCallUsage` | interface | Sim |
| [L11](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-turn-llm-budget.ts#L11) | `SharedGraphTurnLlmBudget` | interface | Sim |
| [L32](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-turn-llm-budget.ts#L32) | `createSharedGraphTurnLlmBudget` | function | Sim |

## [apps/orbe-node/src/application/graph-vacancy-coverage.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-vacancy-coverage.ts)

SHA-256: `a00329ed9a1737e28fd8036dd1d1d5c6463fc8cdc6dee74dcb536c041d8da3ca` · Imports e reexports declarados: 4.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L12](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-vacancy-coverage.ts#L12) | `normalize` | arrow-function | Não |
| [L58](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-vacancy-coverage.ts#L58) | `VacancyCoverageSegment` | interface | Sim |
| [L67](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-vacancy-coverage.ts#L67) | `VacancyCoverageReport` | interface | Sim |
| [L80](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-vacancy-coverage.ts#L80) | `findProseRequirement` | function | Não |
| [L113](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-vacancy-coverage.ts#L113) | `plausibleUnparsedRequirement` | function | Não |
| [L119](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-vacancy-coverage.ts#L119) | `stripMarkup` | function | Não |
| [L132](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-vacancy-coverage.ts#L132) | `analyzeVacancyEvidenceCoverage` | function | Sim |
| [L228](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-vacancy-coverage.ts#L228) | `createCoverageAwareVacancyPlanner` | function | Sim |

## [apps/orbe-node/src/application/graph-vacancy-plan.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-vacancy-plan.ts)

SHA-256: `4d2aa653fed8fc8d297afb09fa16bc537b94cdf9dcdc7880b56426fa25eb9900` · Imports e reexports declarados: 3.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L17](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-vacancy-plan.ts#L17) | `VacancyItem` | type | Sim |
| [L18](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-vacancy-plan.ts#L18) | `VacancyRequirementPlan` | interface | Sim |
| [L23](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-vacancy-plan.ts#L23) | `normalized` | arrow-function | Não |
| [L39](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-vacancy-plan.ts#L39) | `createStructuredVacancyPlanner` | function | Sim |

## [apps/orbe-node/src/application/graph-vacancy-text.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-vacancy-text.ts)

SHA-256: `90c5137c27dfff151b9dabb2bfb9602c1d148ac1cd4eb8b87a00ab251aa597f1` · Imports e reexports declarados: 3.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L20](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-vacancy-text.ts#L20) | `VacancyEvidenceFragment` | type | Sim |
| [L21](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-vacancy-text.ts#L21) | `VacancyLabelProposal` | type | Sim |
| [L23](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-vacancy-text.ts#L23) | `EvidenceAnchoredVacancyOptions` | interface | Sim |
| [L34](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-vacancy-text.ts#L34) | `normalize` | arrow-function | Não |
| [L84](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-vacancy-text.ts#L84) | `splitRequirements` | function | Não |
| [L104](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-vacancy-text.ts#L104) | `extractVacancyEvidenceFragments` | function | Sim |
| [L187](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-vacancy-text.ts#L187) | `proposalCoversFragment` | function | Não |
| [L198](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-vacancy-text.ts#L198) | `defaultLabel` | function | Não |
| [L212](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/graph-vacancy-text.ts#L212) | `createEvidenceAnchoredVacancyPlanner` | function | Sim |

## [apps/orbe-node/src/application/grounded-recruiter-graph.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/grounded-recruiter-graph.ts)

SHA-256: `0f2d87b8bbddd6d735e0bcf727fe23d2f1400a0bbc75171176386754f5030fc1` · Imports e reexports declarados: 4.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L25](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/grounded-recruiter-graph.ts#L25) | `GroundedRecruiterGraphOptions` | interface | Sim |
| [L34](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/grounded-recruiter-graph.ts#L34) | `renderVerifiedMatches` | function | Não |
| [L44](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/grounded-recruiter-graph.ts#L44) | `hasCompletePublicProvenance` | function | Não |
| [L61](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/grounded-recruiter-graph.ts#L61) | `createGroundedRecruiterGraph` | function | Sim |

## [apps/orbe-node/src/application/professional-response-policy.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/professional-response-policy.ts)

SHA-256: `dd27945e24e826a398731371554ecf6fbc0516619d0d67c2f12196f00c985177` · Imports e reexports declarados: 1.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L7](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/professional-response-policy.ts#L7) | `professionalResponsePolicy` | function | Sim |

## [apps/orbe-node/src/application/public-evidence.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/public-evidence.ts)

SHA-256: `1c33021d108961e7a55e17b4d7b91d381078cab362f6536172539cd1dadc429d` · Imports e reexports declarados: 1.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L4](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/public-evidence.ts#L4) | `PublicEvidenceReader` | interface | Sim |
| [L14](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/public-evidence.ts#L14) | `htmlText` | function | Não |
| [L88](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/public-evidence.ts#L88) | `boundedPublicText` | function | Não |
| [L137](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/public-evidence.ts#L137) | `linkedInDescription` | function | Não |
| [L168](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/public-evidence.ts#L168) | `RestrictedPublicEvidenceReader` | class | Sim |
| [L169](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/public-evidence.ts#L169) | `RestrictedPublicEvidenceReader.constructor` | constructor | Não |
| [L171](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/public-evidence.ts#L171) | `RestrictedPublicEvidenceReader.read` | method | Não |

## [apps/orbe-node/src/application/recruiter-matrix.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/recruiter-matrix.ts)

SHA-256: `2935998c02ed139d04c39ecb4ca0debe214997fd1d1f89fd7068a10c24fcab64` · Imports e reexports declarados: 3.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L5](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/recruiter-matrix.ts#L5) | `Requirement` | interface | Não |
| [L43](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/recruiter-matrix.ts#L43) | `parseRequirements` | function | Não |
| [L68](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/recruiter-matrix.ts#L68) | `relevantCourse` | function | Não |
| [L80](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/recruiter-matrix.ts#L80) | `supports` | function | Não |
| [L100](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/recruiter-matrix.ts#L100) | `priority` | function | Não |
| [L113](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/recruiter-matrix.ts#L113) | `classification` | function | Não |
| [L122](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/recruiter-matrix.ts#L122) | `origin` | function | Não |
| [L138](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/recruiter-matrix.ts#L138) | `buildVerifiedRecruiterMatrix` | function | Sim |

## [apps/orbe-node/src/application/report-classification.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/report-classification.ts)

SHA-256: `4804780a564163f488f2cdda0ae9c81225d9671c9aa5123d3431b5cf40371f40` · Imports e reexports declarados: 0.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L5](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/report-classification.ts#L5) | `ORBE_TOPICS` | exported-variable | Sim |
| [L17](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/report-classification.ts#L17) | `ReportIntent` | type | Sim |
| [L18](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/report-classification.ts#L18) | `classifyInteraction` | function | Sim |

## [apps/orbe-node/src/application/semantic-planner-port.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/semantic-planner-port.ts)

SHA-256: `2f75f4fd0b112a3405da8d2830fd5c4bc3c57e2563c48668269551396d1e2078` · Imports e reexports declarados: 1.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L17](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/semantic-planner-port.ts#L17) | `semanticPlannerRequestSchema` | exported-variable | Sim |
| [L57](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/semantic-planner-port.ts#L57) | `semanticPlannerProposalSchema` | exported-variable | Sim |
| [L63](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/semantic-planner-port.ts#L63) | `SemanticPlannerRequest` | type | Sim |
| [L64](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/semantic-planner-port.ts#L64) | `SemanticPlannerProposal` | type | Sim |
| [L73](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/semantic-planner-port.ts#L73) | `SemanticPlannerPort` | interface | Sim |
| [L77](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/semantic-planner-port.ts#L77) | `reject` | function | Não |
| [L86](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/semantic-planner-port.ts#L86) | `validateSemanticPlannerProposal` | function | Sim |

## [apps/orbe-node/src/application/semantic-shadow-readiness.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/semantic-shadow-readiness.ts)

SHA-256: `6f378710a2ecbaa35eda9d0d9137ad5d96a26fbfeb3b538a92ad24326cd75be4` · Imports e reexports declarados: 1.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L21](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/semantic-shadow-readiness.ts#L21) | `SemanticShadowReadinessEvidence` | type | Sim |
| [L32](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/semantic-shadow-readiness.ts#L32) | `SemanticShadowReadiness` | interface | Sim |
| [L41](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/semantic-shadow-readiness.ts#L41) | `assessSemanticShadowReadiness` | function | Sim |
| [L58](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/semantic-shadow-readiness.ts#L58) | `currentF37ShadowReadiness` | exported-variable | Sim |

## [apps/orbe-node/src/application/sources.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/sources.ts)

SHA-256: `30b94b6c436e31f0445b929cfd35c071c2e7993514552c27a2d87b0b5ea806b1` · Imports e reexports declarados: 3.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L16](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/sources.ts#L16) | `distinctiveTerms` | function | Não |
| [L20](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/sources.ts#L20) | `validUrl` | function | Não |
| [L36](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/sources.ts#L36) | `explicitSubject` | function | Não |
| [L66](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/sources.ts#L66) | `documentSource` | function | Sim |
| [L86](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/sources.ts#L86) | `selectSources` | function | Sim |
| [L228](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/sources.ts#L228) | `removeInternalCitationIds` | function | Sim |
| [L245](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/sources.ts#L245) | `reconcileDocumentedClaims` | function | Sim |
| [L447](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/sources.ts#L447) | `completeRecruiterEvidence` | function | Sim |
| [L501](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/sources.ts#L501) | `auditRecruiterMatrix` | function | Sim |

## [apps/orbe-node/src/application/technology-follow-up.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/technology-follow-up.ts)

SHA-256: `b6a929a1a7208897281b98f6625bf276d6159a78d8c56c865795a3ae863cb407` · Imports e reexports declarados: 1.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L12](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/technology-follow-up.ts#L12) | `ellipticalTechnology` | function | Sim |
| [L52](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/application/technology-follow-up.ts#L52) | `rewriteEllipticalTechnologyQuestion` | function | Sim |

## [apps/orbe-node/src/auth/callback-error.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/callback-error.ts)

SHA-256: `c284866c2c0c10111f0885a36b569561a17fa8e2d6399117efde381021832dfe` · Imports e reexports declarados: 1.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L4](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/callback-error.ts#L4) | `AuthCallbackError` | class | Sim |
| [L5](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/callback-error.ts#L5) | `AuthCallbackError.constructor` | constructor | Não |

## [apps/orbe-node/src/auth/google.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/google.ts)

SHA-256: `03977219fc3b60a279cc07bab9104c60636c97577501638993d82aacea0c19aa` · Imports e reexports declarados: 5.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L7](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/google.ts#L7) | `GoogleIdentityProvider` | interface | Sim |
| [L11](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/google.ts#L11) | `GoogleOidc` | class | Sim |
| [L13](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/google.ts#L13) | `GoogleOidc.constructor` | constructor | Não |
| [L14](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/google.ts#L14) | `GoogleOidc.client` | method | Não |
| [L35](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/google.ts#L35) | `GoogleOidc.authorizationUrl` | method | Não |
| [L48](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/google.ts#L48) | `GoogleOidc.exchange` | method | Não |

## [apps/orbe-node/src/auth/jwt.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/jwt.ts)

SHA-256: `00907b7c7aab332a14e9b49c7cd93bb4f31892f42b1de13e4d6215ec0aa874d8` · Imports e reexports declarados: 5.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L16](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/jwt.ts#L16) | `AuthTokens` | class | Sim |
| [L17](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/jwt.ts#L17) | `AuthTokens.constructor` | constructor | Não |
| [L22](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/jwt.ts#L22) | `AuthTokens.create` | method | Não |
| [L76](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/jwt.ts#L76) | `AuthTokens.issue` | method | Não |
| [L92](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/jwt.ts#L92) | `AuthTokens.verify` | method | Não |

## [apps/orbe-node/src/auth/login-navigation.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/login-navigation.ts)

SHA-256: `9f3336dae4862d2b8fd64f925073d17fdc9461022e78a643dffed77a46e06ce1` · Imports e reexports declarados: 1.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L7](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/login-navigation.ts#L7) | `invalidReturn` | arrow-function | Não |
| [L10](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/login-navigation.ts#L10) | `validateReturnPath` | function | Não |
| [L32](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/login-navigation.ts#L32) | `resolveLoginReturnUrl` | function | Sim |
| [L47](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/login-navigation.ts#L47) | `encodeLoginBrowserCookie` | function | Sim |
| [L54](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/login-navigation.ts#L54) | `decodeLoginBrowserCookie` | function | Sim |
| [L88](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/login-navigation.ts#L88) | `loginErrorReturnUrl` | function | Sim |

## [apps/orbe-node/src/auth/postgres.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/postgres.ts)

SHA-256: `72c58128e8c577195ee69e75e557aa2b80aabb2141dd5320e03aed4fb3837435` · Imports e reexports declarados: 3.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L13](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/postgres.ts#L13) | `SessionRow` | interface | Não |
| [L30](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/postgres.ts#L30) | `mapSession` | arrow-function | Não |
| [L47](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/postgres.ts#L47) | `insertSession` | function | Não |
| [L67](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/postgres.ts#L67) | `lockSessionFamily` | function | Não |
| [L70](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/postgres.ts#L70) | `PgAuthStore` | class | Sim |
| [L71](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/postgres.ts#L71) | `PgAuthStore.constructor` | constructor | Não |
| [L72](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/postgres.ts#L72) | `PgAuthStore.saveTransaction` | method | Não |
| [L85](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/postgres.ts#L85) | `PgAuthStore.consumeTransaction` | method | Não |
| [L110](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/postgres.ts#L110) | `PgAuthStore.findOrCreateUser` | method | Não |
| [L185](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/postgres.ts#L185) | `PgAuthStore.insertSession` | method | Não |
| [L188](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/postgres.ts#L188) | `PgAuthStore.sessionByHash` | method | Não |
| [L194](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/postgres.ts#L194) | `PgAuthStore.sessionById` | method | Não |
| [L198](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/postgres.ts#L198) | `PgAuthStore.rotateSession` | method | Não |
| [L259](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/postgres.ts#L259) | `PgAuthStore.revokeFamily` | method | Não |

## [apps/orbe-node/src/auth/routes.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/routes.ts)

SHA-256: `0da8cc8e9a3dd802565e3312a08b72f85770a5bd5d8ad590aaddb08a2f953608` · Imports e reexports declarados: 5.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L7](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/routes.ts#L7) | `browserNavigation` | function | Não |
| [L18](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/routes.ts#L18) | `registerAuthRoutes` | function | Sim |

## [apps/orbe-node/src/auth/service.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/service.ts)

SHA-256: `77c6817bc90ac8ca8165c9dcc8b268556fd43e98cc9964ef0817a4889c9be314` · Imports e reexports declarados: 11.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L18](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/service.ts#L18) | `authHash` | arrow-function | Sim |
| [L19](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/service.ts#L19) | `secret` | arrow-function | Não |
| [L20](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/service.ts#L20) | `validSecret` | arrow-function | Não |
| [L22](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/service.ts#L22) | `unauthorized` | arrow-function | Não |
| [L23](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/service.ts#L23) | `adminOnly` | arrow-function | Não |
| [L25](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/service.ts#L25) | `AuthService` | class | Sim |
| [L26](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/service.ts#L26) | `AuthService.constructor` | constructor | Não |
| [L32](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/service.ts#L32) | `AuthService.create` | method | Não |
| [L42](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/service.ts#L42) | `AuthService.enabled` | method | Não |
| [L47](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/service.ts#L47) | `AuthService.cookieName` | method | Não |
| [L50](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/service.ts#L50) | `AuthService.loginCookieName` | method | Não |
| [L53](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/service.ts#L53) | `AuthService.cookieOptions` | method | Não |
| [L61](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/service.ts#L61) | `AuthService.safe` | method | Não |
| [L70](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/service.ts#L70) | `AuthService.origin` | method | Não |
| [L75](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/service.ts#L75) | `AuthService.csrf` | method | Não |
| [L87](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/service.ts#L87) | `AuthService.active` | method | Não |
| [L96](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/service.ts#L96) | `AuthService.approvedEmail` | method | Não |
| [L99](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/service.ts#L99) | `AuthService.approvedAdministrator` | method | Não |
| [L102](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/service.ts#L102) | `AuthService.requireAdministrator` | method | Não |
| [L105](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/service.ts#L105) | `AuthService.cookieSession` | method | Não |
| [L109](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/service.ts#L109) | `AuthService.bearerSession` | method | Não |
| [L120](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/service.ts#L120) | `AuthService.beginLogin` | method | Não |
| [L143](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/service.ts#L143) | `AuthService.completeLogin` | method | Não |
| [L206](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/service.ts#L206) | `AuthService.newSession` | method | Não |
| [L222](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/service.ts#L222) | `AuthService.session` | method | Não |
| [L240](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/service.ts#L240) | `AuthService.refresh` | method | Não |
| [L253](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/service.ts#L253) | `AuthService.logout` | method | Não |
| [L261](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/service.ts#L261) | `AuthService.requirePrincipal` | method | Não |
| [L290](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/service.ts#L290) | `AuthService.me` | method | Não |
| [L305](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/service.ts#L305) | `AuthService.issueAccessToken` | method | Não |
| [L314](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/service.ts#L314) | `AuthService.jwks` | method | Não |
| [L319](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/service.ts#L319) | `createAuthService` | exported-variable | Sim |

## [apps/orbe-node/src/auth/types.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/types.ts)

SHA-256: `498b95fc7de95b88d6175e1e8f79f363d1a1d346ca4079b0c090c18f75868503` · Imports e reexports declarados: 0.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L1](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/types.ts#L1) | `AuthUser` | interface | Sim |
| [L8](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/types.ts#L8) | `ExternalProfile` | interface | Sim |
| [L14](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/types.ts#L14) | `OAuthTransaction` | interface | Sim |
| [L21](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/types.ts#L21) | `NewAuthSession` | interface | Sim |
| [L30](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/types.ts#L30) | `AuthSession` | interface | Sim |
| [L34](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/types.ts#L34) | `AuthUserProvisioning` | interface | Sim |
| [L38](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/types.ts#L38) | `AuthStore` | interface | Sim |
| [L48](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/auth/types.ts#L48) | `Principal` | interface | Sim |

## [apps/orbe-node/src/domain/errors.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/errors.ts)

SHA-256: `cdf64df3f3b25ddacf303681424c5e3ba4d41506d1cc88cb0c24f080c24e23ac` · Imports e reexports declarados: 0.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L1](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/errors.ts#L1) | `AppError` | class | Sim |
| [L2](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/errors.ts#L2) | `AppError.constructor` | constructor | Não |
| [L12](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/errors.ts#L12) | `conversationNotFound` | arrow-function | Sim |

## [apps/orbe-node/src/domain/evidence-graph.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/evidence-graph.ts)

SHA-256: `ff859dd31f312bfab8f40a0ec9df7c8383a229f295797728b949c4d692ba93d8` · Imports e reexports declarados: 1.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L64](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/evidence-graph.ts#L64) | `evidenceSourceSchema` | exported-variable | Sim |
| [L85](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/evidence-graph.ts#L85) | `evidenceClaimSchema` | exported-variable | Sim |
| [L112](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/evidence-graph.ts#L112) | `vacancyRequirementSchema` | exported-variable | Sim |
| [L118](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/evidence-graph.ts#L118) | `evidenceNodeSchema` | exported-variable | Sim |
| [L131](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/evidence-graph.ts#L131) | `evidenceRelationSchema` | exported-variable | Sim |
| [L149](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/evidence-graph.ts#L149) | `evidenceGraphSnapshotSchema` | exported-variable | Sim |
| [L219](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/evidence-graph.ts#L219) | `EvidenceGraphSnapshot` | type | Sim |
| [L220](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/evidence-graph.ts#L220) | `EvidenceSource` | type | Sim |
| [L221](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/evidence-graph.ts#L221) | `EvidenceClaim` | type | Sim |
| [L222](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/evidence-graph.ts#L222) | `VacancyRequirement` | type | Sim |
| [L224](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/evidence-graph.ts#L224) | `EvidenceGraphMatch` | interface | Sim |
| [L234](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/evidence-graph.ts#L234) | `EvidenceGraphRepository` | interface | Sim |

## [apps/orbe-node/src/domain/experience.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/experience.ts)

SHA-256: `db07befa363d99203050fa96c20b63701d0e318ce6af28ce468fd576f62ddd76` · Imports e reexports declarados: 2.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L4](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/experience.ts#L4) | `ExperienceSummary` | interface | Sim |
| [L17](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/experience.ts#L17) | `monthIndex` | function | Não |
| [L23](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/experience.ts#L23) | `formatMonth` | function | Não |
| [L27](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/experience.ts#L27) | `confirmationMonth` | function | Não |
| [L43](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/experience.ts#L43) | `summarizeExperiencePeriods` | function | Sim |

## [apps/orbe-node/src/domain/llm-budget.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/llm-budget.ts)

SHA-256: `01db3a868dee524785a0f56c9b1a082e7b87477729e08a45ec4324ede7d05aa2` · Imports e reexports declarados: 0.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L1](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/llm-budget.ts#L1) | `LlmCallBudget` | interface | Sim |

## [apps/orbe-node/src/domain/llm-invocation.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/llm-invocation.ts)

SHA-256: `d33b8c0202a9a2f6abb7568bcc938923db560ec4d02c21fe91fc2b1740734a7c` · Imports e reexports declarados: 2.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L6](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/llm-invocation.ts#L6) | `LlmInvocationFactory` | type | Sim |

## [apps/orbe-node/src/domain/llm-limits.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/llm-limits.ts)

SHA-256: `ac55993f3847a9d94b45a3051de79e01f72e9a0753bc23bf7c500e56816d8452` · Imports e reexports declarados: 0.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L1](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/llm-limits.ts#L1) | `MAX_MODEL_CALLS_PER_TURN` | exported-variable | Sim |
| [L2](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/llm-limits.ts#L2) | `MAX_FALLBACK_ATTEMPTS_PER_TURN` | exported-variable | Sim |
| [L3](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/llm-limits.ts#L3) | `MAX_TOOL_CALLS_PER_ROUND` | exported-variable | Sim |
| [L4](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/llm-limits.ts#L4) | `MAX_TOOL_ROUNDS_PER_TURN` | exported-variable | Sim |

## [apps/orbe-node/src/domain/meeting-tools.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/meeting-tools.ts)

SHA-256: `528a0918f1880b8c8dae8fa5ebf2b9eda9420c063bd7f54072e46f420b506722` · Imports e reexports declarados: 2.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L9](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/meeting-tools.ts#L9) | `MeetingTools` | interface | Sim |

## [apps/orbe-node/src/domain/ports.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/ports.ts)

SHA-256: `7f1ead6f49a22776bdeb431b478cd0fda23ae2568e008f4eec06b101204dad9b` · Imports e reexports declarados: 2.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L8](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/ports.ts#L8) | `Message` | interface | Sim |
| [L12](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/ports.ts#L12) | `KnowledgeDocument` | interface | Sim |
| [L31](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/ports.ts#L31) | `AcademicCourseListing` | interface | Sim |
| [L44](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/ports.ts#L44) | `CanonicalAcademicFacts` | interface | Sim |
| [L59](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/ports.ts#L59) | `KnowledgeRepository` | interface | Sim |
| [L70](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/ports.ts#L70) | `GenerationInput` | interface | Sim |
| [L83](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/ports.ts#L83) | `GenerationResult` | interface | Sim |
| [L88](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/ports.ts#L88) | `ChatProvider` | interface | Sim |
| [L92](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/ports.ts#L92) | `TurnResult` | interface | Sim |
| [L96](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/ports.ts#L96) | `ConversationStore` | interface | Sim |

## [apps/orbe-node/src/domain/security.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/security.ts)

SHA-256: `4dd1e3435e13083843927b018434ffa29ab82b96bce23df8ba372886f7196dcf` · Imports e reexports declarados: 1.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L3](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/security.ts#L3) | `hashToken` | arrow-function | Sim |
| [L4](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/security.ts#L4) | `equalHashes` | function | Sim |
| [L9](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/security.ts#L9) | `normalize` | function | Sim |
| [L16](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/security.ts#L16) | `isInjection` | function | Sim |
| [L34](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/security.ts#L34) | `isProgrammingProfileQuestion` | function | Sim |
| [L53](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/security.ts#L53) | `isInScope` | function | Sim |
| [L71](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/security.ts#L71) | `scopeRefusal` | exported-variable | Sim |
| [L73](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/security.ts#L73) | `injectionRefusal` | exported-variable | Sim |
| [L75](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/security.ts#L75) | `unknownAnswer` | exported-variable | Sim |
| [L77](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/security.ts#L77) | `meetingUnavailable` | exported-variable | Sim |
| [L79](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/security.ts#L79) | `greetingAnswer` | exported-variable | Sim |
| [L81](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/security.ts#L81) | `simpleTestAnswer` | exported-variable | Sim |
| [L83](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/security.ts#L83) | `personalLifeAnswer` | exported-variable | Sim |
| [L86](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/security.ts#L86) | `isGreeting` | function | Sim |
| [L89](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/security.ts#L89) | `isSimpleTest` | function | Sim |
| [L95](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/security.ts#L95) | `isPersonalLifeQuestion` | function | Sim |
| [L101](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/security.ts#L101) | `isMeetingRequest` | function | Sim |
| [L106](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/security.ts#L106) | `isOffTopicTask` | function | Sim |
| [L111](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/domain/security.ts#L111) | `isContextualFollowUp` | function | Sim |

## [apps/orbe-node/src/graph-reader/app.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/graph-reader/app.ts)

SHA-256: `630b17215ab4c01f3c422441c931b59807d55fcdd42c4d560fa8dc846000665c` · Imports e reexports declarados: 6.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L19](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/graph-reader/app.ts#L19) | `fingerprint` | function | Não |
| [L23](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/graph-reader/app.ts#L23) | `InternalGraphReaderOptions` | interface | Sim |
| [L33](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/graph-reader/app.ts#L33) | `buildInternalGraphReader` | function | Sim |

## [apps/orbe-node/src/graph-reader/main.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/graph-reader/main.ts)

SHA-256: `04d6f2d3e8ac2e676a1a51ef4c5c5587aa5e6b53e4de00d61bc4d6aac7ad83ed` · Imports e reexports declarados: 4.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L7](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/graph-reader/main.ts#L7) | `main` | function | Não |

## [apps/orbe-node/src/http/app.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/http/app.ts)

SHA-256: `857ee99837dc32b85cf5ef8814db86668ab75e62acfd22fc37cfd6f269eddf20` · Imports e reexports declarados: 23.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L25](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/http/app.ts#L25) | `AppOptions` | interface | Sim |
| [L40](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/http/app.ts#L40) | `buildApp` | function | Sim |

## [apps/orbe-node/src/knowledge-matching.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/knowledge-matching.ts)

SHA-256: `488cbd168c1f11b1f1fab5dfeedbb8365d83bed541d1aa152b37d01e765b7a37` · Imports e reexports declarados: 1.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L41](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/knowledge-matching.ts#L41) | `knowledgeTerms` | function | Sim |
| [L54](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/knowledge-matching.ts#L54) | `knowledgePhrase` | function | Sim |
| [L115](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/knowledge-matching.ts#L115) | `mentionedTechnologies` | function | Sim |
| [L127](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/knowledge-matching.ts#L127) | `technologyMatches` | function | Sim |

## [apps/orbe-node/src/main.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/main.ts)

SHA-256: `3add95cabb808ee507e942ee30389ab2e91cca100e72aafa3edbdefd9e635ef4` · Imports e reexports declarados: 22.

*Nenhum símbolo das categorias enumeradas.*

## [apps/orbe-node/src/meetings/ports.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/ports.ts)

SHA-256: `6984383052d286fad9035bef5e1950029750cc252e16a9694911f4c31db51804` · Imports e reexports declarados: 1.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L3](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/ports.ts#L3) | `BusyInterval` | interface | Sim |
| [L7](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/ports.ts#L7) | `CalendarPort` | interface | Sim |
| [L27](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/ports.ts#L27) | `MeetingRecord` | interface | Sim |
| [L45](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/ports.ts#L45) | `ProposalRecord` | interface | Sim |
| [L57](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/ports.ts#L57) | `MeetingNotificationData` | type | Sim |
| [L58](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/ports.ts#L58) | `MeetingCursor` | interface | Sim |
| [L62](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/ports.ts#L62) | `CalendarLease` | interface | Sim |
| [L66](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/ports.ts#L66) | `MeetingStore` | interface | Sim |

## [apps/orbe-node/src/meetings/postgres-store.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/postgres-store.ts)

SHA-256: `6f8aba5a9cadc10ec29fd2d8ea9b1adbb0103f5a66f604f0e52b77f162347ae4` · Imports e reexports declarados: 5.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L13](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/postgres-store.ts#L13) | `Row` | type | Não |
| [L31](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/postgres-store.ts#L31) | `record` | arrow-function | Não |
| [L49](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/postgres-store.ts#L49) | `missing` | arrow-function | Não |
| [L51](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/postgres-store.ts#L51) | `state` | arrow-function | Não |
| [L53](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/postgres-store.ts#L53) | `idempotency` | arrow-function | Não |
| [L59](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/postgres-store.ts#L59) | `PostgresMeetingStore` | class | Sim |
| [L60](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/postgres-store.ts#L60) | `PostgresMeetingStore.constructor` | constructor | Não |
| [L61](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/postgres-store.ts#L61) | `PostgresMeetingStore.transaction` | method | Não |
| [L86](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/postgres-store.ts#L86) | `PostgresMeetingStore.outbox` | method | Não |
| [L92](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/postgres-store.ts#L92) | `PostgresMeetingStore.audit` | method | Não |
| [L104](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/postgres-store.ts#L104) | `PostgresMeetingStore.createProposal` | method | Não |
| [L122](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/postgres-store.ts#L122) | `PostgresMeetingStore.getProposal` | method | Não |
| [L143](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/postgres-store.ts#L143) | `PostgresMeetingStore.findIdempotent` | method | Não |
| [L153](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/postgres-store.ts#L153) | `PostgresMeetingStore.consumeProposal` | method | Não |
| [L228](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/postgres-store.ts#L228) | `PostgresMeetingStore.get` | method | Não |
| [L232](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/postgres-store.ts#L232) | `PostgresMeetingStore.getPrivate` | method | Não |
| [L239](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/postgres-store.ts#L239) | `PostgresMeetingStore.busy` | method | Não |
| [L246](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/postgres-store.ts#L246) | `PostgresMeetingStore.list` | method | Não |
| [L258](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/postgres-store.ts#L258) | `PostgresMeetingStore.approve` | method | Não |
| [L283](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/postgres-store.ts#L283) | `PostgresMeetingStore.transition` | method | Não |
| [L323](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/postgres-store.ts#L323) | `PostgresMeetingStore.claimCalendar` | method | Não |
| [L336](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/postgres-store.ts#L336) | `PostgresMeetingStore.calendarCreated` | method | Não |
| [L357](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/postgres-store.ts#L357) | `PostgresMeetingStore.calendarCreateStarted` | method | Não |
| [L364](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/postgres-store.ts#L364) | `PostgresMeetingStore.calendarCancelled` | method | Não |
| [L377](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/postgres-store.ts#L377) | `PostgresMeetingStore.calendarFailed` | method | Não |
| [L398](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/postgres-store.ts#L398) | `PostgresMeetingStore.exhaustCalendar` | method | Não |
| [L412](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/postgres-store.ts#L412) | `PostgresMeetingStore.retain` | method | Não |

## [apps/orbe-node/src/meetings/routes.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/routes.ts)

SHA-256: `59279197fcabe601191892f86cb8c1d58b15b098cc53137ff53a55abc7a4109f` · Imports e reexports declarados: 5.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L12](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/routes.ts#L12) | `MeetingAuth` | interface | Sim |
| [L18](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/routes.ts#L18) | `valid` | arrow-function | Não |
| [L25](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/routes.ts#L25) | `registerMeetingRoutes` | function | Sim |

## [apps/orbe-node/src/meetings/service.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/service.ts)

SHA-256: `860e3461ccfb7d43bec808d69754cd5d4f54ace98de22d5d967b3c902dba4073` · Imports e reexports declarados: 6.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L25](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/service.ts#L25) | `hashMeetingSecret` | arrow-function | Sim |
| [L27](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/service.ts#L27) | `unavailable` | arrow-function | Não |
| [L29](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/service.ts#L29) | `invalidSlot` | arrow-function | Não |
| [L36](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/service.ts#L36) | `MeetingService` | class | Sim |
| [L38](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/service.ts#L38) | `MeetingService.constructor` | constructor | Não |
| [L56](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/service.ts#L56) | `MeetingService.enabled` | method | Não |
| [L60](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/service.ts#L60) | `MeetingService.parts` | method | Não |
| [L70](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/service.ts#L70) | `MeetingService.validSlot` | method | Não |
| [L90](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/service.ts#L90) | `MeetingService.conflict` | method | Não |
| [L98](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/service.ts#L98) | `MeetingService.checkExternal` | method | Não |
| [L106](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/service.ts#L106) | `MeetingService.availability` | method | Não |
| [L153](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/service.ts#L153) | `MeetingService.prepareProposal` | method | Não |
| [L204](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/service.ts#L204) | `MeetingService.request` | method | Não |
| [L256](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/service.ts#L256) | `MeetingService.public` | method | Não |
| [L266](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/service.ts#L266) | `MeetingService.status` | method | Não |
| [L273](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/service.ts#L273) | `MeetingService.list` | method | Não |
| [L314](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/service.ts#L314) | `MeetingService.get` | method | Não |
| [L320](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/service.ts#L320) | `MeetingService.approve` | method | Não |
| [L332](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/service.ts#L332) | `MeetingService.reject` | method | Não |
| [L337](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/service.ts#L337) | `MeetingService.cancel` | method | Não |
| [L342](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/service.ts#L342) | `MeetingService.processCalendarCreate` | method | Não |
| [L414](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/service.ts#L414) | `MeetingService.processCalendarCancel` | method | Não |
| [L454](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/service.ts#L454) | `MeetingService.getNotification` | method | Não |
| [L457](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/service.ts#L457) | `MeetingService.processCalendarFailure` | method | Não |
| [L471](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/orbe-node/src/meetings/service.ts#L471) | `MeetingService.retain` | method | Não |

## [apps/report-node/src/main.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/report-node/src/main.ts)

SHA-256: `c3fa56c9125d17e892e420700655c99737ee541d40c94af35112252a1a4c3cce` · Imports e reexports declarados: 3.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L5](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/report-node/src/main.ts#L5) | `ReportConfig` | interface | Não |
| [L11](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/report-node/src/main.ts#L11) | `configFrom` | function | Não |
| [L27](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/report-node/src/main.ts#L27) | `notify` | function | Não |
| [L44](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/report-node/src/main.ts#L44) | `ReportKind` | type | Não |
| [L45](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/report-node/src/main.ts#L45) | `ClaimedRow` | interface | Não |
| [L57](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/report-node/src/main.ts#L57) | `tableFor` | function | Não |
| [L60](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/report-node/src/main.ts#L60) | `claim` | function | Não |
| [L114](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/report-node/src/main.ts#L114) | `mark` | function | Não |
| [L141](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/report-node/src/main.ts#L141) | `dailyText` | function | Não |
| [L169](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/report-node/src/main.ts#L169) | `deliverOne` | function | Não |
| [L206](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/report-node/src/main.ts#L206) | `run` | function | Não |

## [apps/report-node/src/report-format.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/report-node/src/report-format.ts)

SHA-256: `6cced27e3bd888e885bfeef0b558af582987ea8e76daa9b4beb5ff58f43d3438` · Imports e reexports declarados: 0.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L1](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/report-node/src/report-format.ts#L1) | `ConversationReportSummary` | interface | Sim |
| [L16](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/report-node/src/report-format.ts#L16) | `safeList` | arrow-function | Não |
| [L22](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/report-node/src/report-format.ts#L22) | `formatConversationReport` | function | Sim |
| [L34](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/report-node/src/report-format.ts#L34) | `formatDailyReport` | function | Sim |

## [apps/worker-node/src/main.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/worker-node/src/main.ts)

SHA-256: `ed89ede86a6a62a87a433063ea57e9cc115c281f813005b5516d194f88d03b09` · Imports e reexports declarados: 13.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L16](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/worker-node/src/main.ts#L16) | `ShutdownResult` | type | Sim |
| [L17](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/worker-node/src/main.ts#L17) | `WorkerProcessPhase` | type | Sim |
| [L24](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/worker-node/src/main.ts#L24) | `ShutdownFailure` | type | Sim |
| [L30](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/worker-node/src/main.ts#L30) | `WorkerProcessStatus` | interface | Sim |
| [L47](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/worker-node/src/main.ts#L47) | `startWorkerProcess` | function | Sim |

## [apps/worker-node/src/outbox.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/worker-node/src/outbox.ts)

SHA-256: `286ccb4803ad22e7e6fd58cf29a270d73a30d67bf8d460fdec93ffa82ec8515d` · Imports e reexports declarados: 4.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L6](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/worker-node/src/outbox.ts#L6) | `NotificationMeeting` | interface | Sim |
| [L17](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/worker-node/src/outbox.ts#L17) | `MeetingJobs` | interface | Sim |
| [L23](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/worker-node/src/outbox.ts#L23) | `OutboxQueue` | interface | Sim |
| [L30](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/worker-node/src/outbox.ts#L30) | `OutboxRow` | interface | Não |
| [L56](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/worker-node/src/outbox.ts#L56) | `OutboxProcessor` | class | Sim |
| [L57](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/worker-node/src/outbox.ts#L57) | `OutboxProcessor.constructor` | constructor | Não |
| [L65](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/worker-node/src/outbox.ts#L65) | `OutboxProcessor.dispatchDue` | method | Não |
| [L116](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/worker-node/src/outbox.ts#L116) | `OutboxProcessor.process` | method | Não |
| [L183](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/worker-node/src/outbox.ts#L183) | `OutboxProcessor.deliver` | method | Não |
| [L250](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/worker-node/src/outbox.ts#L250) | `OutboxProcessor.scheduleReminder` | method | Não |

## [apps/worker-node/src/runtime.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/worker-node/src/runtime.ts)

SHA-256: `f237588eb5f9cc3fd786f1f1c40be43dd239502ad78f1d1c4e6659f22ec44258` · Imports e reexports declarados: 6.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L8](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/worker-node/src/runtime.ts#L8) | `redisConnection` | function | Sim |
| [L23](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/worker-node/src/runtime.ts#L23) | `WorkerStartupError` | class | Sim |
| [L24](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/worker-node/src/runtime.ts#L24) | `WorkerStartupError.constructor` | constructor | Não |
| [L32](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/worker-node/src/runtime.ts#L32) | `WorkerStartupCancellation` | class | Não |
| [L33](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/worker-node/src/runtime.ts#L33) | `WorkerStartupCancellation.constructor` | constructor | Não |
| [L38](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/worker-node/src/runtime.ts#L38) | `WorkerStoppingError` | class | Sim |
| [L39](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/worker-node/src/runtime.ts#L39) | `WorkerStoppingError.constructor` | constructor | Não |
| [L44](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/apps/worker-node/src/runtime.ts#L44) | `startWorker` | function | Sim |

## [evaluation/evaluator.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/evaluation/evaluator.ts)

SHA-256: `1aa0bf08d2fb78574ba6827a013374eae4f3a105b6a521f59cd08c3b394053bc` · Imports e reexports declarados: 2.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L4](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/evaluation/evaluator.ts#L4) | `normalize` | arrow-function | Não |
| [L10](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/evaluation/evaluator.ts#L10) | `containsTerm` | function | Não |
| [L15](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/evaluation/evaluator.ts#L15) | `aggregateStatus` | function | Sim |
| [L22](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/evaluation/evaluator.ts#L22) | `redactText` | function | Sim |
| [L31](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/evaluation/evaluator.ts#L31) | `evaluateTurn` | function | Sim |

## [evaluation/graphrag-recruiter-offline.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/evaluation/graphrag-recruiter-offline.ts)

SHA-256: `38bbbac800f4b620d12d1e5cfeafd61579145e971c1aecaaead9037292d93719` · Imports e reexports declarados: 8.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L25](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/evaluation/graphrag-recruiter-offline.ts#L25) | `OfflineRecruiterMatrixReport` | type | Sim |
| [L68](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/evaluation/graphrag-recruiter-offline.ts#L68) | `createOfflineSnapshotEvidenceRepository` | function | Sim |
| [L113](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/evaluation/graphrag-recruiter-offline.ts#L113) | `evaluateOfflineRecruiterMatrix` | function | Sim |
| [L197](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/evaluation/graphrag-recruiter-offline.ts#L197) | `evaluateStoredOfflineRecruiterMatrix` | function | Sim |

## [evaluation/phase3.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/evaluation/phase3.ts)

SHA-256: `f7a14d84815e6c930891e8afa696611165afc1bd010b2f4a33f0965e931ab203` · Imports e reexports declarados: 5.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L7](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/evaluation/phase3.ts#L7) | `evaluatePhase3` | function | Sim |

## [evaluation/runner.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/evaluation/runner.ts)

SHA-256: `cd1fd35e698a47a856d48754ef6b20222426bece57dd0124fba49ac877093e69` · Imports e reexports declarados: 4.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L11](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/evaluation/runner.ts#L11) | `MAX_CALLS` | exported-variable | Sim |
| [L12](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/evaluation/runner.ts#L12) | `DEFAULT_MAX_CALLS` | exported-variable | Sim |
| [L13](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/evaluation/runner.ts#L13) | `DEFAULT_TIMEOUT_MS` | exported-variable | Sim |
| [L21](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/evaluation/runner.ts#L21) | `readPublicErrorCode` | function | Não |
| [L47](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/evaluation/runner.ts#L47) | `apiOrigin` | function | Sim |
| [L64](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/evaluation/runner.ts#L64) | `RunnerOptions` | interface | Sim |
| [L71](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/evaluation/runner.ts#L71) | `digest` | arrow-function | Não |
| [L73](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/evaluation/runner.ts#L73) | `runEvaluation` | function | Sim |
| [L240](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/evaluation/runner.ts#L240) | `fenced` | function | Não |
| [L246](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/evaluation/runner.ts#L246) | `renderMarkdown` | function | Sim |

## [evaluation/schema.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/evaluation/schema.ts)

SHA-256: `97e31fdfa324288c91ac1660a127f0dd541cea3ce8c773865e6928304f8f2644` · Imports e reexports declarados: 2.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L4](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/evaluation/schema.ts#L4) | `categorySchema` | exported-variable | Sim |
| [L12](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/evaluation/schema.ts#L12) | `conceptGroupSchema` | exported-variable | Sim |
| [L17](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/evaluation/schema.ts#L17) | `expectationSchema` | exported-variable | Sim |
| [L23](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/evaluation/schema.ts#L23) | `matrixSchema` | exported-variable | Sim |
| [L47](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/evaluation/schema.ts#L47) | `catalogSchema` | exported-variable | Sim |
| [L48](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/evaluation/schema.ts#L48) | `EvaluationMatrix` | type | Sim |
| [L49](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/evaluation/schema.ts#L49) | `EvaluationCase` | type | Sim |
| [L50](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/evaluation/schema.ts#L50) | `Expectation` | type | Sim |
| [L51](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/evaluation/schema.ts#L51) | `Category` | type | Sim |
| [L52](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/evaluation/schema.ts#L52) | `EvaluationStatus` | type | Sim |
| [L53](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/evaluation/schema.ts#L53) | `publicErrorCodeSchema` | exported-variable | Sim |
| [L77](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/evaluation/schema.ts#L77) | `PublicErrorCode` | type | Sim |
| [L78](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/evaluation/schema.ts#L78) | `Check` | interface | Sim |
| [L83](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/evaluation/schema.ts#L83) | `TurnAssessment` | interface | Sim |
| [L92](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/evaluation/schema.ts#L92) | `TurnReport` | interface | Sim |
| [L98](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/evaluation/schema.ts#L98) | `CaseReport` | interface | Sim |
| [L106](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/evaluation/schema.ts#L106) | `EvaluationReport` | interface | Sim |

## [evaluation/semantic-hybrid-coverage-report.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/evaluation/semantic-hybrid-coverage-report.ts)

SHA-256: `6fdb23c52f874e335d22f8ea9dc967f8ab71014ed0d84234953dea082ae8a8d9` · Imports e reexports declarados: 4.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L50](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/evaluation/semantic-hybrid-coverage-report.ts#L50) | `auditSemanticHybridCoverage` | function | Sim |
| [L144](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/evaluation/semantic-hybrid-coverage-report.ts#L144) | `auditStoredSemanticHybridCoverage` | function | Sim |

## [evaluation/semantic-hybrid-lexical-baseline.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/evaluation/semantic-hybrid-lexical-baseline.ts)

SHA-256: `4cd14aa1c5530c2caf6be11216bffa12ec5ec3a0caeef92b8b0fd48d00ee4a5f` · Imports e reexports declarados: 5.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L39](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/evaluation/semantic-hybrid-lexical-baseline.ts#L39) | `normalize` | arrow-function | Não |
| [L47](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/evaluation/semantic-hybrid-lexical-baseline.ts#L47) | `ratio` | arrow-function | Não |
| [L59](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/evaluation/semantic-hybrid-lexical-baseline.ts#L59) | `evaluateSemanticLexicalBaseline` | function | Sim |
| [L218](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/evaluation/semantic-hybrid-lexical-baseline.ts#L218) | `evaluateStoredSemanticLexicalBaseline` | function | Sim |

## [evaluation/semantic-skill-catalog.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/evaluation/semantic-skill-catalog.ts)

SHA-256: `671aa6130128c0d8149ad836e00e43fc9fdcbf651b7403ba19fb43dbb424b848` · Imports e reexports declarados: 2.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L9](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/evaluation/semantic-skill-catalog.ts#L9) | `semanticSkillCatalogSchema` | exported-variable | Sim |
| [L20](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/evaluation/semantic-skill-catalog.ts#L20) | `makeSemanticSkillCatalog` | function | Sim |

## [packages/contracts/src/auth.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/contracts/src/auth.ts)

SHA-256: `b19b5ff5f45f4319be0b3ac55d227352d4e95f3f887a237d36526529d9a80914` · Imports e reexports declarados: 2.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L4](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/contracts/src/auth.ts#L4) | `authUserSchema` | exported-variable | Sim |
| [L10](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/contracts/src/auth.ts#L10) | `authSessionSchema` | exported-variable | Sim |
| [L16](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/contracts/src/auth.ts#L16) | `AuthSessionResponse` | type | Sim |
| [L17](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/contracts/src/auth.ts#L17) | `authSecuritySchemes` | exported-variable | Sim |
| [L27](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/contracts/src/auth.ts#L27) | `authJwksSchema` | exported-variable | Sim |
| [L49](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/contracts/src/auth.ts#L49) | `authOpenApiPaths` | exported-variable | Sim |

## [packages/contracts/src/common.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/contracts/src/common.ts)

SHA-256: `ec4e9929fc35b30badf05edd9296817b366c3f13155880e6f0c470eed58a661c` · Imports e reexports declarados: 1.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L3](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/contracts/src/common.ts#L3) | `errorResponseSchema` | exported-variable | Sim |
| [L6](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/contracts/src/common.ts#L6) | `json` | arrow-function | Sim |
| [L9](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/contracts/src/common.ts#L9) | `standardErrors` | exported-variable | Sim |

## [packages/contracts/src/generate.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/contracts/src/generate.ts)

SHA-256: `fae5af790120e32e5ab8a31c7ddb81c4ae096ed96e73e8db4af86fed24255d9c` · Imports e reexports declarados: 3.

*Nenhum símbolo das categorias enumeradas.*

## [packages/contracts/src/index.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/contracts/src/index.ts)

SHA-256: `999528182a9c5d666cd16f09ea85cc7c0ef28b864cc7986decb89479cc39798d` · Imports e reexports declarados: 4.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L10](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/contracts/src/index.ts#L10) | `chatRequestSchema` | exported-variable | Sim |
| [L14](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/contracts/src/index.ts#L14) | `sourceSchema` | exported-variable | Sim |
| [L20](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/contracts/src/index.ts#L20) | `chatResponseSchema` | exported-variable | Sim |
| [L42](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/contracts/src/index.ts#L42) | `healthResponseSchema` | exported-variable | Sim |
| [L43](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/contracts/src/index.ts#L43) | `readyResponseSchema` | exported-variable | Sim |
| [L48](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/contracts/src/index.ts#L48) | `ChatRequest` | type | Sim |
| [L49](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/contracts/src/index.ts#L49) | `ChatResponse` | type | Sim |
| [L50](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/contracts/src/index.ts#L50) | `Source` | type | Sim |
| [L51](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/contracts/src/index.ts#L51) | `ProviderName` | type | Sim |
| [L53](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/contracts/src/index.ts#L53) | `openApiDocument` | exported-variable | Sim |

## [packages/contracts/src/meetings.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/contracts/src/meetings.ts)

SHA-256: `5fa30df919a4d0732d9b4865f80b100f677747f8ebb7786f33dca0db62591e40` · Imports e reexports declarados: 2.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L4](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/contracts/src/meetings.ts#L4) | `meetingStatusSchema` | exported-variable | Sim |
| [L13](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/contracts/src/meetings.ts#L13) | `meetingProposalInputSchema` | exported-variable | Sim |
| [L19](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/contracts/src/meetings.ts#L19) | `meetingSummarySchema` | exported-variable | Sim |
| [L23](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/contracts/src/meetings.ts#L23) | `meetingProposalResponseSchema` | exported-variable | Sim |
| [L31](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/contracts/src/meetings.ts#L31) | `meetingRequestInputSchema` | exported-variable | Sim |
| [L37](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/contracts/src/meetings.ts#L37) | `meetingStatusResponseSchema` | exported-variable | Sim |
| [L45](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/contracts/src/meetings.ts#L45) | `meetingRequestResponseSchema` | exported-variable | Sim |
| [L48](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/contracts/src/meetings.ts#L48) | `meetingAvailabilityQuerySchema` | exported-variable | Sim |
| [L49](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/contracts/src/meetings.ts#L49) | `meetingAvailabilityResponseSchema` | exported-variable | Sim |
| [L55](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/contracts/src/meetings.ts#L55) | `meetingAdminItemSchema` | exported-variable | Sim |
| [L63](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/contracts/src/meetings.ts#L63) | `meetingAdminListQuerySchema` | exported-variable | Sim |
| [L68](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/contracts/src/meetings.ts#L68) | `meetingAdminListResponseSchema` | exported-variable | Sim |
| [L72](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/contracts/src/meetings.ts#L72) | `MeetingProposalInput` | type | Sim |
| [L73](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/contracts/src/meetings.ts#L73) | `MeetingProposalResponse` | type | Sim |
| [L74](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/contracts/src/meetings.ts#L74) | `MeetingRequestInput` | type | Sim |
| [L75](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/contracts/src/meetings.ts#L75) | `MeetingStatus` | type | Sim |
| [L76](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/contracts/src/meetings.ts#L76) | `MeetingStatusResponse` | type | Sim |
| [L77](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/contracts/src/meetings.ts#L77) | `MeetingRequestResponse` | type | Sim |
| [L78](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/contracts/src/meetings.ts#L78) | `MeetingAdminItem` | type | Sim |
| [L79](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/contracts/src/meetings.ts#L79) | `MeetingAdminListQuery` | type | Sim |
| [L82](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/contracts/src/meetings.ts#L82) | `body` | arrow-function | Não |
| [L83](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/contracts/src/meetings.ts#L83) | `meetingOpenApiPaths` | function | Sim |

## [packages/database/src/admin-role.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/database/src/admin-role.ts)

SHA-256: `2f7b4a7e7c3b0a732e00e16fa3d4c9e01cb15fac6e7a31cace97c1d9f078d629` · Imports e reexports declarados: 3.

*Nenhum símbolo das categorias enumeradas.*

## [packages/database/src/migrate.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/database/src/migrate.ts)

SHA-256: `d16b86a9e9f5bd4a396fc4ea5ac37b5432b2aff1794bf4f740283421e2e94b21` · Imports e reexports declarados: 2.

*Nenhum símbolo das categorias enumeradas.*

## [packages/database/src/migrations.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/database/src/migrations.ts)

SHA-256: `edb74e07b192eb520c97509592a893b4b68e5dc761ab768917a7365c48c6f644` · Imports e reexports declarados: 4.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L6](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/database/src/migrations.ts#L6) | `migrate` | function | Sim |

## [packages/database/src/pool.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/database/src/pool.ts)

SHA-256: `6f197a00a01bb6a3774c2125b66a7855107317fed5378f93a2f008096bbce1ad` · Imports e reexports declarados: 1.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L3](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/database/src/pool.ts#L3) | `createPool` | function | Sim |

## [packages/database/src/privacy-retention.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/database/src/privacy-retention.ts)

SHA-256: `bf0f3ac9aa5460dddb734e7a4c2809db1d5bc43c73043c7aae810f61d3df4558` · Imports e reexports declarados: 2.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L4](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/database/src/privacy-retention.ts#L4) | `retainPrivateData` | function | Sim |

## [packages/database/src/retention.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/database/src/retention.ts)

SHA-256: `d13e32aa2dee077dacb52802419d5918870f821ec46b765080be4cf8e33d9a36` · Imports e reexports declarados: 3.

*Nenhum símbolo das categorias enumeradas.*

## [packages/integrations/src/calendar.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/integrations/src/calendar.ts)

SHA-256: `533cdf251bac9bc236d94b1014e8ffc066966accc9fb7e9f2abf5b69f4b60762` · Imports e reexports declarados: 4.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L6](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/integrations/src/calendar.ts#L6) | `BusyInterval` | interface | Sim |
| [L10](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/integrations/src/calendar.ts#L10) | `CalendarEventInput` | interface | Sim |
| [L20](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/integrations/src/calendar.ts#L20) | `CalendarPort` | interface | Sim |
| [L31](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/integrations/src/calendar.ts#L31) | `googleEventId` | function | Sim |
| [L35](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/integrations/src/calendar.ts#L35) | `unavailable` | arrow-function | Não |
| [L37](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/integrations/src/calendar.ts#L37) | `mismatch` | arrow-function | Não |
| [L39](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/integrations/src/calendar.ts#L39) | `reconciliationPending` | arrow-function | Não |
| [L54](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/integrations/src/calendar.ts#L54) | `boundedJson` | function | Não |
| [L74](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/integrations/src/calendar.ts#L74) | `GoogleCalendarAdapter` | class | Sim |
| [L76](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/integrations/src/calendar.ts#L76) | `GoogleCalendarAdapter.constructor` | constructor | Não |
| [L85](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/integrations/src/calendar.ts#L85) | `GoogleCalendarAdapter.request` | method | Não |
| [L112](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/integrations/src/calendar.ts#L112) | `GoogleCalendarAdapter.eventPath` | method | Não |
| [L115](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/integrations/src/calendar.ts#L115) | `GoogleCalendarAdapter.freeBusy` | method | Não |
| [L156](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/integrations/src/calendar.ts#L156) | `GoogleCalendarAdapter.verify` | method | Não |
| [L172](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/integrations/src/calendar.ts#L172) | `GoogleCalendarAdapter.ensureEvent` | method | Não |
| [L205](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/integrations/src/calendar.ts#L205) | `GoogleCalendarAdapter.cancelEvent` | method | Não |
| [L250](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/integrations/src/calendar.ts#L250) | `FakeCalendarAdapter` | class | Sim |
| [L254](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/integrations/src/calendar.ts#L254) | `FakeCalendarAdapter.freeBusy` | method | Não |
| [L259](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/integrations/src/calendar.ts#L259) | `FakeCalendarAdapter.ensureEvent` | method | Não |
| [L282](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/integrations/src/calendar.ts#L282) | `FakeCalendarAdapter.cancelEvent` | method | Não |
| [L298](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/integrations/src/calendar.ts#L298) | `createCalendar` | function | Sim |

## [packages/integrations/src/index.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/integrations/src/index.ts)

SHA-256: `df6c2417baa50047b18bb6c54b61edb1152d660415b34fcbcee8ed3e6b1b54be` · Imports e reexports declarados: 2.

*Nenhum símbolo das categorias enumeradas.*

## [packages/integrations/src/notifications.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/integrations/src/notifications.ts)

SHA-256: `2cedd100bc34b801ea419ca934827341fef6995a410301ecb08d918a8dc99411` · Imports e reexports declarados: 2.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L4](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/integrations/src/notifications.ts#L4) | `NotificationChannel` | type | Sim |
| [L5](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/integrations/src/notifications.ts#L5) | `NotificationMessage` | interface | Sim |
| [L11](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/integrations/src/notifications.ts#L11) | `NotificationSender` | interface | Sim |
| [L15](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/integrations/src/notifications.ts#L15) | `NotificationError` | class | Sim |
| [L17](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/integrations/src/notifications.ts#L17) | `NotificationError.constructor` | constructor | Não |
| [L21](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/integrations/src/notifications.ts#L21) | `SmtpNotificationSender` | class | Sim |
| [L23](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/integrations/src/notifications.ts#L23) | `SmtpNotificationSender.constructor` | constructor | Não |
| [L35](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/integrations/src/notifications.ts#L35) | `SmtpNotificationSender.send` | method | Não |
| [L57](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/integrations/src/notifications.ts#L57) | `TelegramNotificationSender` | class | Sim |
| [L59](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/integrations/src/notifications.ts#L59) | `TelegramNotificationSender.constructor` | constructor | Não |
| [L66](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/integrations/src/notifications.ts#L66) | `TelegramNotificationSender.send` | method | Não |
| [L91](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/integrations/src/notifications.ts#L91) | `FakeNotificationSender` | class | Sim |
| [L94](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/integrations/src/notifications.ts#L94) | `FakeNotificationSender.constructor` | constructor | Não |
| [L95](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/integrations/src/notifications.ts#L95) | `FakeNotificationSender.send` | method | Não |
| [L99](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/integrations/src/notifications.ts#L99) | `createNotificationSenders` | function | Sim |

## [packages/shared-config/src/auth.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/shared-config/src/auth.ts)

SHA-256: `ada2cde171d7a43d1b67a6d5571c99685d6ca273fef41fe3b4524ab21829ae8f` · Imports e reexports declarados: 1.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L22](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/shared-config/src/auth.ts#L22) | `EnabledAuthConfig` | type | Sim |
| [L28](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/shared-config/src/auth.ts#L28) | `AuthConfig` | type | Sim |
| [L30](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/shared-config/src/auth.ts#L30) | `loadAuthConfig` | function | Sim |

## [packages/shared-config/src/calendar.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/shared-config/src/calendar.ts)

SHA-256: `47441db21467f21c9325e010b9195d431dd7b90528e2ba9ed7ca8327800232ae` · Imports e reexports declarados: 1.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L13](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/shared-config/src/calendar.ts#L13) | `CalendarConfig` | type | Sim |
| [L14](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/shared-config/src/calendar.ts#L14) | `loadCalendarConfig` | function | Sim |

## [packages/shared-config/src/index.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/shared-config/src/index.ts)

SHA-256: `f50ebf961a569f455b7ebea3f75fe5f6e7e4aaedb6bc3c8a88aadd56f3ef5d6f` · Imports e reexports declarados: 6.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L21](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/shared-config/src/index.ts#L21) | `assertLlmPrivacyEnvironment` | function | Sim |
| [L80](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/shared-config/src/index.ts#L80) | `Config` | type | Sim |
| [L90](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/shared-config/src/index.ts#L90) | `loadConfig` | function | Sim |

## [packages/shared-config/src/llm-fallback.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/shared-config/src/llm-fallback.ts)

SHA-256: `c1d58f868035ae047ef3e2ebb0eab313dcce5e868753c9625df4fc6e6b160b62` · Imports e reexports declarados: 1.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L3](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/shared-config/src/llm-fallback.ts#L3) | `LLM_FALLBACK_PROVIDER_IDS` | exported-variable | Sim |
| [L4](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/shared-config/src/llm-fallback.ts#L4) | `LlmFallbackProviderId` | type | Sim |
| [L5](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/shared-config/src/llm-fallback.ts#L5) | `LLM_FALLBACK_REQUIRED_FIELDS` | exported-variable | Sim |
| [L6](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/shared-config/src/llm-fallback.ts#L6) | `LLM_FALLBACK_PROVIDER_FIELDS` | exported-variable | Sim |
| [L7](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/shared-config/src/llm-fallback.ts#L7) | `LlmFallbackProviderConfig` | interface | Sim |
| [L15](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/shared-config/src/llm-fallback.ts#L15) | `LlmFallbackConfig` | type | Sim |
| [L25](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/shared-config/src/llm-fallback.ts#L25) | `LLM_FALLBACK_ENV_NAMES` | exported-variable | Sim |
| [L36](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/shared-config/src/llm-fallback.ts#L36) | `optional` | arrow-function | Não |
| [L38](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/shared-config/src/llm-fallback.ts#L38) | `number` | arrow-function | Não |
| [L41](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/shared-config/src/llm-fallback.ts#L41) | `loadLlmFallbackConfig` | function | Sim |

## [packages/shared-config/src/meetings.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/shared-config/src/meetings.ts)

SHA-256: `16f4ac5c7d2875d0c1ef54b1160931c25a041fd92b2023389bc44529d87eb792` · Imports e reexports declarados: 1.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L3](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/shared-config/src/meetings.ts#L3) | `MeetingConfig` | interface | Sim |
| [L46](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/shared-config/src/meetings.ts#L46) | `loadMeetingConfig` | function | Sim |

## [packages/shared-config/src/worker.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/shared-config/src/worker.ts)

SHA-256: `8154f659dae49c074fc7c9f976095867c96a0ad9f5b43344c337b50c57842b88` · Imports e reexports declarados: 1.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L25](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/shared-config/src/worker.ts#L25) | `WorkerConfig` | type | Sim |
| [L26](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/packages/shared-config/src/worker.ts#L26) | `loadWorkerConfig` | function | Sim |

## [scripts/audit-semantic-hybrid-coverage.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/audit-semantic-hybrid-coverage.ts)

SHA-256: `7e0e75521e760148d76b056a6a70f1be15922825ce522342ec0065e8a3c71b0b` · Imports e reexports declarados: 1.

*Nenhum símbolo das categorias enumeradas.*

## [scripts/auth-keygen.mjs](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/auth-keygen.mjs)

SHA-256: `c902e91b2a494d7c4063cd9fef3e182fc0ea22e57752565697e0306b2c0ce990` · Imports e reexports declarados: 3.

*Nenhum símbolo das categorias enumeradas.*

## [scripts/b2-e2e.d.mts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/b2-e2e.d.mts)

SHA-256: `773bc299c629475a4d8433e8c9ce0ea0bb028a482da68ecbd82ab60018c7bdd9` · Imports e reexports declarados: 0.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L1](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/b2-e2e.d.mts#L1) | `DockerInvocation` | interface | Sim |
| [L7](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/b2-e2e.d.mts#L7) | `DockerExecutor` | type | Sim |
| [L8](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/b2-e2e.d.mts#L8) | `SnapshotMetadata` | interface | Sim |
| [L14](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/b2-e2e.d.mts#L14) | `IntegratedOptions` | interface | Sim |
| [L24](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/b2-e2e.d.mts#L24) | `parseArguments` | function | Sim |
| [L25](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/b2-e2e.d.mts#L25) | `isLocalEndpoint` | function | Sim |
| [L26](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/b2-e2e.d.mts#L26) | `dockerEnvironment` | function | Sim |
| [L27](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/b2-e2e.d.mts#L27) | `snapshotPathAllowed` | function | Sim |
| [L28](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/b2-e2e.d.mts#L28) | `runIntegratedE2e` | function | Sim |

## [scripts/b2-e2e.mjs](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/b2-e2e.mjs)

SHA-256: `d3a5a5761836f5d23203e9de7033664299a7a3be54acf1bffd413526ddc58fed` · Imports e reexports declarados: 9.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L61](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/b2-e2e.mjs#L61) | `validateTestFilter` | function | Não |
| [L73](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/b2-e2e.mjs#L73) | `validateFrontendSuites` | function | Não |
| [L84](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/b2-e2e.mjs#L84) | `parseArguments` | function | Sim |
| [L138](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/b2-e2e.mjs#L138) | `isLocalEndpoint` | function | Sim |
| [L148](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/b2-e2e.mjs#L148) | `dockerEnvironment` | function | Sim |
| [L176](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/b2-e2e.mjs#L176) | `snapshotPathAllowed` | function | Sim |
| [L201](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/b2-e2e.mjs#L201) | `within` | function | Não |
| [L205](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/b2-e2e.mjs#L205) | `git` | function | Não |
| [L214](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/b2-e2e.mjs#L214) | `snapshot` | function | Não |
| [L277](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/b2-e2e.mjs#L277) | `executeDocker` | function | Não |
| [L305](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/b2-e2e.mjs#L305) | `runIntegratedE2e` | function | Sim |

## [scripts/b2-runtime.mjs](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/b2-runtime.mjs)

SHA-256: `3555a61854f5bc64469f87214626de8e915623c41ad66d8289e8aab7970255db` · Imports e reexports declarados: 7.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L22](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/b2-runtime.mjs#L22) | `stop` | arrow-function | Não |
| [L43](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/b2-runtime.mjs#L43) | `launch` | function | Não |
| [L63](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/b2-runtime.mjs#L63) | `terminate` | function | Não |
| [L79](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/b2-runtime.mjs#L79) | `waitFor` | function | Não |
| [L119](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/b2-runtime.mjs#L119) | `command` | function | Não |
| [L144](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/b2-runtime.mjs#L144) | `frontendSuite` | function | Não |
| [L195](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/b2-runtime.mjs#L195) | `scanMainBuild` | function | Não |

## [scripts/evaluate-graphrag-recruiter-offline.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/evaluate-graphrag-recruiter-offline.ts)

SHA-256: `256a98f31780996ecac9529e489e4600eba5f3532529817f8b102afa8f5e717e` · Imports e reexports declarados: 1.

*Nenhum símbolo das categorias enumeradas.*

## [scripts/evaluate-orbe-phase3.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/evaluate-orbe-phase3.ts)

SHA-256: `994d64e7b764267fe8a8edbcd953a57aa39b39bae586a03e10ed98975af18c85` · Imports e reexports declarados: 14.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L16](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/evaluate-orbe-phase3.ts#L16) | `main` | function | Não |

## [scripts/evaluate-orbe.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/evaluate-orbe.ts)

SHA-256: `fbb0fc56b1e7691d420806a157ac7416faa5fec93dcff3cf4ec22456c9d7a043` · Imports e reexports declarados: 5.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L19](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/evaluate-orbe.ts#L19) | `main` | function | Não |

## [scripts/evaluate-semantic-lexical.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/evaluate-semantic-lexical.ts)

SHA-256: `b649f2fa7768c106a9c60401f55ff2cca486d6a80dbac1e62540c1da80865b66` · Imports e reexports declarados: 3.

*Nenhum símbolo das categorias enumeradas.*

## [scripts/export-semantic-skill-catalog.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/export-semantic-skill-catalog.ts)

SHA-256: `0d72912c763bc5f47e0691bc183fe490e50057184f67ca957a47333e997e42d0` · Imports e reexports declarados: 2.

*Nenhum símbolo das categorias enumeradas.*

## [scripts/phase3-docker-smoke.d.mts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/phase3-docker-smoke.d.mts)

SHA-256: `fdcebe2d40ec2e02175dd272627ea8c0d88a7713a4d05063d0e5f8e7d7969b0d` · Imports e reexports declarados: 0.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L1](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/phase3-docker-smoke.d.mts#L1) | `DockerInvocation` | interface | Sim |
| [L7](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/phase3-docker-smoke.d.mts#L7) | `DockerExecutor` | type | Sim |
| [L8](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/phase3-docker-smoke.d.mts#L8) | `parseImage` | function | Sim |
| [L9](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/phase3-docker-smoke.d.mts#L9) | `qualifyImage` | function | Sim |

## [scripts/phase3-docker-smoke.mjs](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/phase3-docker-smoke.mjs)

SHA-256: `dd1a67b4dd6539494bbb8c9c121b6f289c24bdb3a05d41eb231988822d05a56e` · Imports e reexports declarados: 8.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L13](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/phase3-docker-smoke.mjs#L13) | `parseImage` | function | Sim |
| [L24](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/phase3-docker-smoke.mjs#L24) | `inheritedDockerEnvironment` | arrow-function | Não |
| [L53](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/phase3-docker-smoke.mjs#L53) | `executeDocker` | function | Não |
| [L70](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/phase3-docker-smoke.mjs#L70) | `isLocalEndpoint` | function | Não |
| [L80](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/phase3-docker-smoke.mjs#L80) | `qualifyImage` | function | Sim |

## [scripts/phase3-preflight.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/phase3-preflight.ts)

SHA-256: `8df02e8b0d8b35ef2a2c45f56dfa9f53136459fb896e71b7de774f7c81cdd425` · Imports e reexports declarados: 9.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L16](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/phase3-preflight.ts#L16) | `Module` | type | Não |
| [L17](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/phase3-preflight.ts#L17) | `Target` | type | Não |
| [L18](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/phase3-preflight.ts#L18) | `Severity` | type | Não |
| [L19](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/phase3-preflight.ts#L19) | `PreflightIssue` | interface | Sim |
| [L25](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/phase3-preflight.ts#L25) | `PreflightReport` | interface | Sim |
| [L41](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/phase3-preflight.ts#L41) | `ComposeEnvironment` | type | Sim |
| [L141](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/phase3-preflight.ts#L141) | `present` | arrow-function | Não |
| [L144](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/phase3-preflight.ts#L144) | `readRepositoryComposeEnvironment` | function | Sim |
| [L164](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/phase3-preflight.ts#L164) | `inspectPhase3Environment` | function | Sim |
| [L404](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/phase3-preflight.ts#L404) | `runPhase3Preflight` | function | Sim |

## [scripts/phase3-runtime-smoke.mjs](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/phase3-runtime-smoke.mjs)

SHA-256: `1becf4bd0a3aef5bdc00854959d43ed958aa13dbfc11f670858ced0790c56a38` · Imports e reexports declarados: 4.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L17](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/phase3-runtime-smoke.mjs#L17) | `call` | arrow-function | Não |
| [L24](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/phase3-runtime-smoke.mjs#L24) | `post` | arrow-function | Não |
| [L30](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/phase3-runtime-smoke.mjs#L30) | `assertLegacy` | arrow-function | Não |

## [scripts/ppks-graph-diff.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/ppks-graph-diff.ts)

SHA-256: `f4cc8a27a1f83088ec841c96e696b98cea0f16f5cd9edb319e281555193d1a58` · Imports e reexports declarados: 3.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L6](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/ppks-graph-diff.ts#L6) | `main` | function | Não |

## [scripts/ppks.mjs](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/ppks.mjs)

SHA-256: `ef77ea7464aa97e0ece0df31848033bb3701ae1e2e34d511cc1d0fa97bad8c6c` · Imports e reexports declarados: 4.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L8](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/ppks.mjs#L8) | `json` | arrow-function | Não |
| [L12](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/ppks.mjs#L12) | `loadCollection` | function | Não |
| [L63](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/ppks.mjs#L63) | `validateAcademicCatalog` | function | Não |
| [L128](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/ppks.mjs#L128) | `validateSemanticRelations` | function | Não |
| [L148](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/ppks.mjs#L148) | `buildIndex` | function | Não |
| [L179](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/ppks.mjs#L179) | `main` | function | Não |

## [scripts/release-pair-gate.mjs](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/release-pair-gate.mjs)

SHA-256: `ddd4cde8275cfbd1ded85ca5100f94a37a2750d75f288d38d214f61f562c6dd5` · Imports e reexports declarados: 2.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L14](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/release-pair-gate.mjs#L14) | `validateReleasePair` | function | Sim |

## [scripts/seed-neo4j.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/seed-neo4j.ts)

SHA-256: `a72f8d653560319b5db39675b16cbe5d156c2069cb2976d174c24d155cb6fdcd` · Imports e reexports declarados: 3.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L6](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/seed-neo4j.ts#L6) | `main` | function | Não |

## [scripts/smoke.mjs](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/scripts/smoke.mjs)

SHA-256: `5a0a8691df569d07b31726c0e041dd2dfb587080fa001dbe48881a7d8735608e` · Imports e reexports declarados: 5.

*Nenhum símbolo das categorias enumeradas.*

## [tests/admin-meetings-security.integration.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/admin-meetings-security.integration.test.ts)

SHA-256: `7263d22be683f78ea332e6f5efa9b6e65e8809ed1783ea5472528a094bceaae0` · Imports e reexports declarados: 17.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L36](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/admin-meetings-security.integration.test.ts#L36) | `Operation` | type | Não |
| [L39](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/admin-meetings-security.integration.test.ts#L39) | `ApiDocument` | type | Não |
| [L124](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/admin-meetings-security.integration.test.ts#L124) | `assertResponseSchema` | function | Não |
| [L142](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/admin-meetings-security.integration.test.ts#L142) | `fixture` | function | Não |
| [L202](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/admin-meetings-security.integration.test.ts#L202) | `Fixture` | type | Não |
| [L204](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/admin-meetings-security.integration.test.ts#L204) | `snapshot` | function | Não |
| [L222](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/admin-meetings-security.integration.test.ts#L222) | `Denial` | type | Não |

## [tests/auth-fixtures.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/auth-fixtures.ts)

SHA-256: `3131be24b5a95298f137e5cab78d2c7faf402f54d96349a500efbb7db1009ded` · Imports e reexports declarados: 11.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L21](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/auth-fixtures.ts#L21) | `MemoryAuthStore` | class | Sim |
| [L27](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/auth-fixtures.ts#L27) | `MemoryAuthStore.saveTransaction` | method | Não |
| [L30](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/auth-fixtures.ts#L30) | `MemoryAuthStore.consumeTransaction` | method | Não |
| [L41](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/auth-fixtures.ts#L41) | `MemoryAuthStore.findOrCreateUser` | method | Não |
| [L72](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/auth-fixtures.ts#L72) | `MemoryAuthStore.insertSession` | method | Não |
| [L75](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/auth-fixtures.ts#L75) | `MemoryAuthStore.sessionByHash` | method | Não |
| [L78](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/auth-fixtures.ts#L78) | `MemoryAuthStore.sessionById` | method | Não |
| [L81](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/auth-fixtures.ts#L81) | `MemoryAuthStore.rotateSession` | method | Não |
| [L95](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/auth-fixtures.ts#L95) | `MemoryAuthStore.revokeFamily` | method | Não |
| [L101](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/auth-fixtures.ts#L101) | `fakeGoogle` | function | Sim |
| [L219](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/auth-fixtures.ts#L219) | `FakeGoogle` | type | Sim |
| [L220](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/auth-fixtures.ts#L220) | `authConfig` | function | Sim |
| [L238](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/auth-fixtures.ts#L238) | `authApp` | function | Sim |
| [L264](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/auth-fixtures.ts#L264) | `cookieValue` | function | Sim |
| [L268](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/auth-fixtures.ts#L268) | `login` | function | Sim |

## [tests/auth-login-callback.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/auth-login-callback.test.ts)

SHA-256: `f6f8b98a18ec5572679bcd07a2e6ab76ce3542bea55f2adc0d4fb87d8ee41f4b` · Imports e reexports declarados: 3.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L23](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/auth-login-callback.test.ts#L23) | `setup` | function | Não |
| [L30](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/auth-login-callback.test.ts#L30) | `Context` | type | Não |
| [L31](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/auth-login-callback.test.ts#L31) | `begin` | function | Não |

## [tests/auth-login-navigation.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/auth-login-navigation.test.ts)

SHA-256: `f10e6d7060dac32e4d91473c3ddba34eda322503b9a7a92524a7c44c1995ed48` · Imports e reexports declarados: 2.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L11](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/auth-login-navigation.test.ts#L11) | `cookieWith` | arrow-function | Não |

## [tests/auth-provisioning.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/auth-provisioning.test.ts)

SHA-256: `11c18c8138366cc691771be7d89df25b56132e6d4a3583a9671bcaadbe71257d` · Imports e reexports declarados: 4.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L14](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/auth-provisioning.test.ts#L14) | `provisioningClient` | function | Não |

## [tests/auth.browser.integration.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/auth.browser.integration.test.ts)

SHA-256: `93229ee9780ee0e7daf22c76859c97f5a740a631d0fd38fbf79deb1e83072e41` · Imports e reexports declarados: 4.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L21](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/auth.browser.integration.test.ts#L21) | `SessionState` | interface | Não |
| [L26](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/auth.browser.integration.test.ts#L26) | `browserFetch` | function | Não |

## [tests/auth.integration.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/auth.integration.test.ts)

SHA-256: `a2b9099c759e951951a04127610812089b43677ceb864b70ec3898bc3fe2ba46` · Imports e reexports declarados: 10.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L23](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/auth.integration.test.ts#L23) | `TrackingStore` | class | Não |
| [L24](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/auth.integration.test.ts#L24) | `TrackingStore.findOrCreateUser` | method | Não |
| [L29](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/auth.integration.test.ts#L29) | `TrackingStore.saveTransaction` | method | Não |
| [L58](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/auth.integration.test.ts#L58) | `profile` | arrow-function | Não |
| [L64](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/auth.integration.test.ts#L64) | `newSession` | arrow-function | Não |
| [L202](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/auth.integration.test.ts#L202) | `waitForBlockedQuery` | function | Não |

## [tests/auth.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/auth.test.ts)

SHA-256: `3d8f2ebac425a39621c314b66c743861884411eae42344d1020658a67c8eff28` · Imports e reexports declarados: 7.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L26](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/auth.test.ts#L26) | `setup` | function | Não |
| [L33](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/auth.test.ts#L33) | `request` | arrow-function | Não |

## [tests/b2-harness.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/b2-harness.test.ts)

SHA-256: `7bf746bdbfa29a3526afc9c9acd7d92215dc9c6d4ad5d3ebc8ea059a4a712692` · Imports e reexports declarados: 6.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L21](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/b2-harness.test.ts#L21) | `inputs` | function | Não |
| [L36](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/b2-harness.test.ts#L36) | `fakeDocker` | function | Não |

## [tests/b2-oidc.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/b2-oidc.test.ts)

SHA-256: `5c6a996ca599042afe49c23320e615fd1eecc54d136fdbbf6312fabc1ecb15fb` · Imports e reexports declarados: 7.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L16](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/b2-oidc.test.ts#L16) | `secret` | arrow-function | Não |
| [L17](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/b2-oidc.test.ts#L17) | `hash` | arrow-function | Não |
| [L53](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/b2-oidc.test.ts#L53) | `plan` | function | Não |
| [L63](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/b2-oidc.test.ts#L63) | `authorize` | function | Não |
| [L81](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/b2-oidc.test.ts#L81) | `tokenForm` | function | Não |
| [L92](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/b2-oidc.test.ts#L92) | `token` | function | Não |

## [tests/browser-proxy.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/browser-proxy.test.ts)

SHA-256: `4b81190f0ec666c50b1887f6549f9bec9ca82370036656b48d0958c9a8c40fcb` · Imports e reexports declarados: 4.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L9](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/browser-proxy.test.ts#L9) | `syntheticCorsServer` | function | Não |
| [L43](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/browser-proxy.test.ts#L43) | `listen` | function | Não |
| [L65](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/browser-proxy.test.ts#L65) | `viaProxy` | function | Não |

## [tests/browser/fixtures.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/browser/fixtures.ts)

SHA-256: `8ae1f83ba97b7fd13a2485a8e538a3b1791c54a9858b788c382570b512b853ed` · Imports e reexports declarados: 11.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L13](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/browser/fixtures.ts#L13) | `listen` | function | Não |
| [L22](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/browser/fixtures.ts#L22) | `close` | function | Não |
| [L28](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/browser/fixtures.ts#L28) | `freePort` | function | Não |
| [L42](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/browser/fixtures.ts#L42) | `ObservedRequest` | interface | Sim |
| [L47](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/browser/fixtures.ts#L47) | `browserFixture` | function | Sim |
| [L181](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/browser/fixtures.ts#L181) | `BrowserFixture` | type | Sim |
| [L183](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/browser/fixtures.ts#L183) | `launchLocalBrowser` | function | Sim |

## [tests/browser/local-proxy.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/browser/local-proxy.ts)

SHA-256: `ee8f2320910a525ee21d4565f6aa09c14ef4b2d16618bfaf1ff884d78c273f39` · Imports e reexports declarados: 1.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L8](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/browser/local-proxy.ts#L8) | `LocalDestination` | interface | Não |
| [L16](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/browser/local-proxy.ts#L16) | `hasForbiddenUrlCharacters` | arrow-function | Não |
| [L33](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/browser/local-proxy.ts#L33) | `endToEndHeaders` | function | Não |
| [L42](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/browser/local-proxy.ts#L42) | `createLocalProxy` | function | Sim |

## [tests/calendar-notifications.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/calendar-notifications.test.ts)

SHA-256: `250ba8ce1f0e69619a1ccbfcca4a64324b49f05e35a2d2cf8bdcb421a474c2f0` · Imports e reexports declarados: 7.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L35](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/calendar-notifications.test.ts#L35) | `event` | arrow-function | Não |
| [L42](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/calendar-notifications.test.ts#L42) | `fakeServer` | function | Não |

## [tests/chat-compatibility.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/chat-compatibility.test.ts)

SHA-256: `e23a3823f052f4914156413868dac3e4018b1ac605c3877089d93668f0fe360d` · Imports e reexports declarados: 14.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L29](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/chat-compatibility.test.ts#L29) | `setup` | function | Não |

## [tests/context.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/context.test.ts)

SHA-256: `ff58dd11ed49a8ef8fdc60e136480264ae2bbc94b29733428ceae6c76131cc38` · Imports e reexports declarados: 7.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L15](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/context.test.ts#L15) | `setup` | function | Não |

## [tests/domain.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/domain.test.ts)

SHA-256: `7c9725ad9aeecd3f0d7a7073845170652951641f3d0ce310aa994fe04679ef61` · Imports e reexports declarados: 7.

*Nenhum símbolo das categorias enumeradas.*

## [tests/e2e/local-oidc.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/e2e/local-oidc.ts)

SHA-256: `7ded64495204ba145b0399c50564535ab3cea205214315b9f305f7577c589b76` · Imports e reexports declarados: 3.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L6](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/e2e/local-oidc.ts#L6) | `OIDC_PLAN_COOKIE` | exported-variable | Sim |
| [L7](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/e2e/local-oidc.ts#L7) | `OIDC_CONTROL_HEADER` | exported-variable | Sim |
| [L8](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/e2e/local-oidc.ts#L8) | `localOidcScenarios` | exported-variable | Sim |
| [L23](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/e2e/local-oidc.ts#L23) | `LocalOidcScenario` | type | Sim |
| [L24](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/e2e/local-oidc.ts#L24) | `LocalOidcOptions` | interface | Sim |
| [L35](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/e2e/local-oidc.ts#L35) | `AuthorizationPlan` | interface | Não |
| [L40](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/e2e/local-oidc.ts#L40) | `AuthorizationGrant` | interface | Não |
| [L47](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/e2e/local-oidc.ts#L47) | `LocalOidcStats` | interface | Sim |
| [L60](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/e2e/local-oidc.ts#L60) | `hash` | arrow-function | Não |
| [L61](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/e2e/local-oidc.ts#L61) | `secret` | arrow-function | Não |
| [L62](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/e2e/local-oidc.ts#L62) | `validProof` | arrow-function | Não |
| [L64](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/e2e/local-oidc.ts#L64) | `knownScenario` | arrow-function | Não |
| [L66](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/e2e/local-oidc.ts#L66) | `sameSecret` | function | Não |
| [L72](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/e2e/local-oidc.ts#L72) | `send` | function | Não |
| [L77](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/e2e/local-oidc.ts#L77) | `readBody` | function | Não |
| [L88](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/e2e/local-oidc.ts#L88) | `single` | arrow-function | Não |
| [L92](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/e2e/local-oidc.ts#L92) | `startLocalOidcProvider` | function | Sim |

## [tests/e2e/runtime.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/e2e/runtime.ts)

SHA-256: `901abe1d002cbe5ef00a5de9e1f0a5c20a66eb3ab9d12c592c0f28e4095fae20` · Imports e reexports declarados: 18.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L43](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/e2e/runtime.ts#L43) | `Gate` | interface | Não |
| [L55](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/e2e/runtime.ts#L55) | `Observation` | interface | Não |
| [L137](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/e2e/runtime.ts#L137) | `listen` | function | Não |
| [L143](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/e2e/runtime.ts#L143) | `json` | function | Não |
| [L147](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/e2e/runtime.ts#L147) | `body` | function | Não |
| [L158](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/e2e/runtime.ts#L158) | `pickGate` | function | Não |
| [L243](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/e2e/runtime.ts#L243) | `snapshot` | function | Não |
| [L402](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/e2e/runtime.ts#L402) | `stop` | function | Não |

## [tests/evaluation-context.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/evaluation-context.test.ts)

SHA-256: `8ae9355ce8764f1b52b6800592035f86c4630b41926e2925c7f16e94fe107c8d` · Imports e reexports declarados: 8.

*Nenhum símbolo das categorias enumeradas.*

## [tests/evaluation.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/evaluation.test.ts)

SHA-256: `a0bf88f957845d935568c5435508da48d4ea23cb95ddb09777373aafb379c46d` · Imports e reexports declarados: 7.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L17](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/evaluation.test.ts#L17) | `response` | arrow-function | Não |
| [L34](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/evaluation.test.ts#L34) | `matrix` | arrow-function | Não |
| [L49](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/evaluation.test.ts#L49) | `publicInputs` | function | Não |

## [tests/evidence-graph-contract.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/evidence-graph-contract.test.ts)

SHA-256: `5f3876ad76a39e56db2214a1d3422d853ff6a1b1d474de006fc5c3b37325ec17` · Imports e reexports declarados: 2.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L37](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/evidence-graph-contract.test.ts#L37) | `graph` | arrow-function | Não |

## [tests/evidence-packet.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/evidence-packet.test.ts)

SHA-256: `de7c3488b1b21b363a671f92322702964a38cc86aa752c09cc18d8f07abc6369` · Imports e reexports declarados: 9.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L17](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/evidence-packet.test.ts#L17) | `doc` | arrow-function | Não |

## [tests/experience-periods.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/experience-periods.test.ts)

SHA-256: `0167067604c70962e02d83a035dd2c3bf304cb14cfd5982a47601eca391ca6da` · Imports e reexports declarados: 4.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L7](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/experience-periods.test.ts#L7) | `document` | arrow-function | Não |
| [L20](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/experience-periods.test.ts#L20) | `software` | arrow-function | Não |

## [tests/frontend-phase3-client.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/frontend-phase3-client.test.ts)

SHA-256: `7f138f63ba8288e45a779f2f9890319de68c1f4bbbc46524fab66e11d1001261` · Imports e reexports declarados: 3.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L6](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/frontend-phase3-client.test.ts#L6) | `session` | arrow-function | Não |

## [tests/graph-generated-prose-audit.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/graph-generated-prose-audit.test.ts)

SHA-256: `95f73fe527d069cf407a585ccdfef6880af610de4e4d16fe58cf34f74544e7b7` · Imports e reexports declarados: 4.

*Nenhum símbolo das categorias enumeradas.*

## [tests/graph-narrative-verifier.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/graph-narrative-verifier.test.ts)

SHA-256: `d213d1370dd0029f5dc7984e8cc8deb71cf16a25907f759e102f9d411b4e07f4` · Imports e reexports declarados: 3.

*Nenhum símbolo das categorias enumeradas.*

## [tests/graph-professional-advocacy.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/graph-professional-advocacy.test.ts)

SHA-256: `e04f1cbc3710d1e037c4176a1acf3fee60f720776c6bd87820851fafbf38bdfc` · Imports e reexports declarados: 4.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L12](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/graph-professional-advocacy.test.ts#L12) | `req` | arrow-function | Não |
| [L35](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/graph-professional-advocacy.test.ts#L35) | `claim` | arrow-function | Não |
| [L50](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/graph-professional-advocacy.test.ts#L50) | `match` | arrow-function | Não |
| [L63](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/graph-professional-advocacy.test.ts#L63) | `repository` | arrow-function | Não |

## [tests/graph-public-policy.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/graph-public-policy.test.ts)

SHA-256: `ac4dfdb16e640c4f74003e6530dbaa653f9bd0df1f1766f735c67021e8d2fe7f` · Imports e reexports declarados: 3.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L33](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/graph-public-policy.test.ts#L33) | `requirement` | arrow-function | Não |
| [L39](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/graph-public-policy.test.ts#L39) | `claim` | arrow-function | Não |
| [L49](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/graph-public-policy.test.ts#L49) | `upstream` | arrow-function | Não |

## [tests/graph-reader-http-client.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/graph-reader-http-client.test.ts)

SHA-256: `c2553593a0653f734abdcb434704a708d657ced1420f06b7254adb8b1a3cca30` · Imports e reexports declarados: 5.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L64](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/graph-reader-http-client.test.ts#L64) | `testTransport` | function | Não |

## [tests/graph-reader-http.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/graph-reader-http.test.ts)

SHA-256: `fd324d66152852f24ffa1ed49834fa9209ec39695b9879403081fb3fb111b5b0` · Imports e reexports declarados: 3.

*Nenhum símbolo das categorias enumeradas.*

## [tests/graph-recruiter-preview.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/graph-recruiter-preview.test.ts)

SHA-256: `7afa15a030201619a2e871b41172c58a49142713b3cc171ff47bd110b5b58c6e` · Imports e reexports declarados: 4.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L28](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/graph-recruiter-preview.test.ts#L28) | `matching` | arrow-function | Não |
| [L45](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/graph-recruiter-preview.test.ts#L45) | `reader` | arrow-function | Não |

## [tests/graph-semantic-vacancy.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/graph-semantic-vacancy.test.ts)

SHA-256: `69630204190ddd6cbd2d8905af865fcbd8b508e24ef37f0cfda991a06ab720e2` · Imports e reexports declarados: 10.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L29](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/graph-semantic-vacancy.test.ts#L29) | `normalise` | arrow-function | Não |
| [L44](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/graph-semantic-vacancy.test.ts#L44) | `modelFactory` | function | Não |
| [L61](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/graph-semantic-vacancy.test.ts#L61) | `options` | arrow-function | Não |

## [tests/graph-snapshot-diff.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/graph-snapshot-diff.test.ts)

SHA-256: `59160713507e71272c0b65fa2f3a21fa4c9875399dfe56870e74f529f8056023` · Imports e reexports declarados: 4.

*Nenhum símbolo das categorias enumeradas.*

## [tests/graph-turn-llm-budget.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/graph-turn-llm-budget.test.ts)

SHA-256: `27119dee36563a2a9d3635b9ecd83233f173a09cbded30dbbaa3613710e9f0b3` · Imports e reexports declarados: 7.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L14](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/graph-turn-llm-budget.test.ts#L14) | `stub` | function | Não |
| [L44](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/graph-turn-llm-budget.test.ts#L44) | `answer` | arrow-function | Não |

## [tests/graph-vacancy-coverage.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/graph-vacancy-coverage.test.ts)

SHA-256: `cba1ebed1fcba6e499c7c472f456c1ba6b2285f9c51bff068ca86f306368f917` · Imports e reexports declarados: 4.

*Nenhum símbolo das categorias enumeradas.*

## [tests/graph-vacancy-text.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/graph-vacancy-text.test.ts)

SHA-256: `ebd15c9b5a0ad89d70965477190f304152d36174b87811487cfc2a3518ff7ab2` · Imports e reexports declarados: 4.

*Nenhum símbolo das categorias enumeradas.*

## [tests/graph-vacancy-transfer.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/graph-vacancy-transfer.test.ts)

SHA-256: `ee161400a302413f47acc4ff83881f343269698aa80093fb885ec56dbe942670` · Imports e reexports declarados: 7.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L35](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/graph-vacancy-transfer.test.ts#L35) | `repo` | arrow-function | Não |

## [tests/graphrag-active-http.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/graphrag-active-http.test.ts)

SHA-256: `1bfedd7d5941f5afc13936f2dfbbfb519cae416817ef064f9c9f24f5f93ba7fb` · Imports e reexports declarados: 11.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L25](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/graphrag-active-http.test.ts#L25) | `config` | arrow-function | Não |
| [L35](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/graphrag-active-http.test.ts#L35) | `app` | function | Não |
| [L41](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/graphrag-active-http.test.ts#L41) | `ask` | function | Não |
| [L60](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/graphrag-active-http.test.ts#L60) | `sampleMatch` | arrow-function | Não |
| [L77](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/graphrag-active-http.test.ts#L77) | `repository` | arrow-function | Não |

## [tests/graphrag-recruiter-offline.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/graphrag-recruiter-offline.test.ts)

SHA-256: `d446c446d3ada17130474ab8ba9a8fd24ce829b4b49333b0c029d41e0444761e` · Imports e reexports declarados: 7.

*Nenhum símbolo das categorias enumeradas.*

## [tests/graphrag-shadow-http.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/graphrag-shadow-http.test.ts)

SHA-256: `08601d29bab00c7fb9c655b4b0a6530ebc6ce2f1163725db8b7e91deacf64668` · Imports e reexports declarados: 9.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L19](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/graphrag-shadow-http.test.ts#L19) | `config` | arrow-function | Não |
| [L29](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/graphrag-shadow-http.test.ts#L29) | `shadow` | arrow-function | Não |
| [L37](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/graphrag-shadow-http.test.ts#L37) | `mount` | function | Não |
| [L43](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/graphrag-shadow-http.test.ts#L43) | `post` | function | Não |

## [tests/graphrag-shadow-reader-network.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/graphrag-shadow-reader-network.test.ts)

SHA-256: `a7d4e2683e2ca28c774d7a81934f2d8133df32969b6aa546575459a81f2030fe` · Imports e reexports declarados: 10.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L72](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/graphrag-shadow-reader-network.test.ts#L72) | `config` | arrow-function | Não |

## [tests/graphrag-shadow-secret.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/graphrag-shadow-secret.test.ts)

SHA-256: `6b6285d30a20ed41c2648ae22c386a1b68f6a92c450d187047e9cb74d9971d05` · Imports e reexports declarados: 4.

*Nenhum símbolo das categorias enumeradas.*

## [tests/grounded-recruiter-graph.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/grounded-recruiter-graph.test.ts)

SHA-256: `cecf52626343ceb8a45aaf728ee9591d1f3b1c6d58c6813fb03e106a45d00d18` · Imports e reexports declarados: 3.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L23](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/grounded-recruiter-graph.test.ts#L23) | `req` | arrow-function | Não |
| [L29](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/grounded-recruiter-graph.test.ts#L29) | `claim` | arrow-function | Não |

## [tests/helpers.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/helpers.ts)

SHA-256: `17e7767c4bca6e32c22f5f6e21e7b94137afa4e7b7c61ca8843784af2c0479a2` · Imports e reexports declarados: 5.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L7](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/helpers.ts#L7) | `testApp` | function | Sim |

## [tests/http-socket.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/http-socket.test.ts)

SHA-256: `93d0a381fe505a38a37edb4e9ba7826e977e8e8395b2a29ec63aca6a181e79b4` · Imports e reexports declarados: 4.

*Nenhum símbolo das categorias enumeradas.*

## [tests/http.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/http.test.ts)

SHA-256: `c22fc32ba9960cad1363fa959e3cc9d7642f8a7c535a67ad98e72d916998f963` · Imports e reexports declarados: 12.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L18](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/http.test.ts#L18) | `setup` | arrow-function | Não |
| [L23](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/http.test.ts#L23) | `post` | arrow-function | Não |

## [tests/infrastructure.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/infrastructure.test.ts)

SHA-256: `be8d1882a13fb1234ab2c28c4b79dac2acf0c1e5d9bd79c1007a64a0a23e7584` · Imports e reexports declarados: 7.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L46](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/infrastructure.test.ts#L46) | `shellPath` | arrow-function | Não |
| [L53](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/infrastructure.test.ts#L53) | `ComposeConfig` | interface | Não |
| [L68](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/infrastructure.test.ts#L68) | `render` | function | Não |
| [L297](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/infrastructure.test.ts#L297) | `deployment` | function | Não |
| [L335](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/infrastructure.test.ts#L335) | `rememberReleasedSnapshot` | function | Não |
| [L357](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/infrastructure.test.ts#L357) | `seedOfflineDevMetadata` | function | Não |
| [L374](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/infrastructure.test.ts#L374) | `releasedFixture` | function | Não |
| [L391](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/infrastructure.test.ts#L391) | `operationalCompose` | function | Não |

## [tests/knowledge-relevance.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/knowledge-relevance.test.ts)

SHA-256: `446040999f04019ee43ce2e221ee77d3a7e307f23a09073c66326efda4abd36e` · Imports e reexports declarados: 8.

*Nenhum símbolo das categorias enumeradas.*

## [tests/llm-adapter.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/llm-adapter.test.ts)

SHA-256: `13d90a9dc9b4bc7df4f6d5a2459373883fd30dc6e5776cbf73ce242cc75c214e` · Imports e reexports declarados: 12.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L15](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/llm-adapter.test.ts#L15) | `loadConfig` | arrow-function | Não |
| [L30](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/llm-adapter.test.ts#L30) | `llmServer` | function | Não |
| [L51](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/llm-adapter.test.ts#L51) | `messageCharacters` | arrow-function | Não |
| [L67](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/llm-adapter.test.ts#L67) | `document` | arrow-function | Não |
| [L74](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/llm-adapter.test.ts#L74) | `completion` | arrow-function | Não |
| [L82](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/llm-adapter.test.ts#L82) | `responseObject` | arrow-function | Não |

## [tests/llm-budget.integration.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/llm-budget.integration.test.ts)

SHA-256: `e16ab7484734bc3f388c84058ea7af363f3d84dcc5983ca86a6e7cc170486e09` · Imports e reexports declarados: 10.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L22](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/llm-budget.integration.test.ts#L22) | `key` | arrow-function | Não |

## [tests/llm-budget.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/llm-budget.test.ts)

SHA-256: `85bca2aceeaebff9980024ce3b5822c9e9c3008bb2888ea24d5b2630c0829774` · Imports e reexports declarados: 3.

*Nenhum símbolo das categorias enumeradas.*

## [tests/llm-cooldown.integration.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/llm-cooldown.integration.test.ts)

SHA-256: `7b461d64df8228d7c0704486a92acf37e12e7c59449009ba19aec95aa84b07ae` · Imports e reexports declarados: 4.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L19](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/llm-cooldown.integration.test.ts#L19) | `fixture` | function | Não |

## [tests/llm-fallback-config.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/llm-fallback-config.test.ts)

SHA-256: `98cb01f8346641c4f76d8afcb8033f27684e69b966729ad3e0c9b64fecc146a0` · Imports e reexports declarados: 6.

*Nenhum símbolo das categorias enumeradas.*

## [tests/llm-fallback-diagnostics.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/llm-fallback-diagnostics.test.ts)

SHA-256: `bb1804d3101d1f00c04e9662a10bfe6c5e6e69c10dd1bdb056c61d14a61ea6ed` · Imports e reexports declarados: 8.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L13](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/llm-fallback-diagnostics.test.ts#L13) | `harness` | function | Não |

## [tests/llm-fallback-identities.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/llm-fallback-identities.test.ts)

SHA-256: `aa75c719f5e449e4e4c6857665b99eb294e3cb95612083f23cf0aeba07d6ce57` · Imports e reexports declarados: 6.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L21](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/llm-fallback-identities.test.ts#L21) | `identity` | arrow-function | Não |
| [L107](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/llm-fallback-identities.test.ts#L107) | `sharedRedis` | function | Não |
| [L127](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/llm-fallback-identities.test.ts#L127) | `replicaConfig` | function | Não |
| [L140](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/llm-fallback-identities.test.ts#L140) | `signal` | arrow-function | Não |

## [tests/llm-fallback.integration.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/llm-fallback.integration.test.ts)

SHA-256: `bec1420c34250f78228e6089a0f713d13adf1ccda0976287985055b6ddef63f5` · Imports e reexports declarados: 12.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L49](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/llm-fallback.integration.test.ts#L49) | `endpoint` | function | Não |
| [L82](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/llm-fallback.integration.test.ts#L82) | `configFor` | function | Não |
| [L103](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/llm-fallback.integration.test.ts#L103) | `factories` | function | Não |
| [L147](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/llm-fallback.integration.test.ts#L147) | `messages` | arrow-function | Não |
| [L148](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/llm-fallback.integration.test.ts#L148) | `signal` | arrow-function | Não |

## [tests/llm-fallback.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/llm-fallback.test.ts)

SHA-256: `547ef5447ebc8eefa79dbe76d6b63cb3b24c14d8d9b840fc29372d785f825ed1` · Imports e reexports declarados: 19.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L39](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/llm-fallback.test.ts#L39) | `completion` | arrow-function | Não |
| [L47](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/llm-fallback.test.ts#L47) | `toolResponse` | arrow-function | Não |
| [L55](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/llm-fallback.test.ts#L55) | `endpoint` | function | Não |
| [L69](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/llm-fallback.test.ts#L69) | `allowBudget` | arrow-function | Não |
| [L70](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/llm-fallback.test.ts#L70) | `memoryCooldown` | function | Não |
| [L79](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/llm-fallback.test.ts#L79) | `configFor` | function | Não |
| [L102](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/llm-fallback.test.ts#L102) | `generation` | arrow-function | Não |
| [L108](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/llm-fallback.test.ts#L108) | `setup` | function | Não |

## [tests/llm-invocation-controller.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/llm-invocation-controller.test.ts)

SHA-256: `11884243a8e58fea47d66342e67da051ec32974e03f1743468af7352e502eb81` · Imports e reexports declarados: 6.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L13](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/llm-invocation-controller.test.ts#L13) | `MemoryCooldown` | class | Não |
| [L16](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/llm-invocation-controller.test.ts#L16) | `MemoryCooldown.remainingMs` | method | Não |
| [L19](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/llm-invocation-controller.test.ts#L19) | `MemoryCooldown.block` | method | Não |
| [L33](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/llm-invocation-controller.test.ts#L33) | `httpProviders` | function | Não |
| [L66](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/llm-invocation-controller.test.ts#L66) | `setup` | function | Não |

## [tests/llm-meetings.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/llm-meetings.test.ts)

SHA-256: `4badc503a4ba314425bb5fe2752df09ccb8b5be914fb8b78b899ecc68dc648b1` · Imports e reexports declarados: 11.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L20](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/llm-meetings.test.ts#L20) | `provider` | function | Não |
| [L92](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/llm-meetings.test.ts#L92) | `meetingTools` | function | Não |

## [tests/llm-model-factory.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/llm-model-factory.test.ts)

SHA-256: `82243321a35e3951de67d3f457e71bc9f990ac4790c18afff1271ca23d8f8c70` · Imports e reexports declarados: 8.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L26](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/llm-model-factory.test.ts#L26) | `WireCall` | interface | Não |
| [L32](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/llm-model-factory.test.ts#L32) | `WireMessage` | interface | Não |
| [L38](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/llm-model-factory.test.ts#L38) | `WireRequest` | interface | Não |
| [L62](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/llm-model-factory.test.ts#L62) | `transcript` | arrow-function | Não |
| [L66](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/llm-model-factory.test.ts#L66) | `completion` | arrow-function | Não |
| [L74](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/llm-model-factory.test.ts#L74) | `final` | arrow-function | Não |
| [L76](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/llm-model-factory.test.ts#L76) | `call` | function | Não |
| [L84](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/llm-model-factory.test.ts#L84) | `candidates` | arrow-function | Não |
| [L91](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/llm-model-factory.test.ts#L91) | `transport` | function | Não |
| [L122](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/llm-model-factory.test.ts#L122) | `requireModel` | function | Não |
| [L130](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/llm-model-factory.test.ts#L130) | `options` | arrow-function | Não |

## [tests/llm-privacy.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/llm-privacy.test.ts)

SHA-256: `ae3c7b5f6e4e665b2b73d434d8e4146fdae8c6f08606e09fb2ac36c5ea1e902c` · Imports e reexports declarados: 3.

*Nenhum símbolo das categorias enumeradas.*

## [tests/meetings-contract.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/meetings-contract.test.ts)

SHA-256: `6bd2df85f42d8b1cc46264430f932c1cf67519bd3384e398a92db80b3d06a5d1` · Imports e reexports declarados: 2.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L4](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/meetings-contract.test.ts#L4) | `Operation` | type | Não |

## [tests/meetings-store-errors.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/meetings-store-errors.test.ts)

SHA-256: `cc13d335ac2ff493c2530a65caacc7042fecb04d5d5e3148b20cd23d935e27b7` · Imports e reexports declarados: 4.

*Nenhum símbolo das categorias enumeradas.*

## [tests/meetings.integration.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/meetings.integration.test.ts)

SHA-256: `0c71ed1781e0275d6bc0fb818bfd38b9a8a6f9320290c24577e54e0222749fa3` · Imports e reexports declarados: 10.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L21](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/meetings.integration.test.ts#L21) | `make` | arrow-function | Não |
| [L23](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/meetings.integration.test.ts#L23) | `request` | function | Não |

## [tests/meetings.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/meetings.test.ts)

SHA-256: `f52795f5e5f8da0936aa7ca4951d351e8dd7e86ef885b5147753cd98857c7344` · Imports e reexports declarados: 9.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L21](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/meetings.test.ts#L21) | `setup` | function | Não |

## [tests/neo4j-driver-store.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/neo4j-driver-store.test.ts)

SHA-256: `9484126c3daa27e54c75671b701fe2da00f15b465364250f9ac8c93b11b5ffc0` · Imports e reexports declarados: 5.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L11](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/neo4j-driver-store.test.ts#L11) | `FakeTransaction` | type | Não |
| [L13](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/neo4j-driver-store.test.ts#L13) | `fake` | arrow-function | Não |

## [tests/neo4j-graph-queries.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/neo4j-graph-queries.test.ts)

SHA-256: `d145adba9850ff3ad341d3fc2e1b87cd0fda5e387a91943ef19ef55308da0311` · Imports e reexports declarados: 5.

*Nenhum símbolo das categorias enumeradas.*

## [tests/neo4j.integration.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/neo4j.integration.test.ts)

SHA-256: `de5e5021b1bb43880f09602ec706b61ab60ddf19fe74b673c6590c3764a22417` · Imports e reexports declarados: 5.

*Nenhum símbolo das categorias enumeradas.*

## [tests/orbe-academic-completeness.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/orbe-academic-completeness.test.ts)

SHA-256: `f09e7c0fc70b51c2a1820369621fedd51cc0f4a36d35af14a319561646d020d5` · Imports e reexports declarados: 7.

*Nenhum símbolo das categorias enumeradas.*

## [tests/orbe-canonical-claims.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/orbe-canonical-claims.test.ts)

SHA-256: `827404c220c427f242a0570e102294c80a1820b9f11c92c09fc6119821cc46c8` · Imports e reexports declarados: 6.

*Nenhum símbolo das categorias enumeradas.*

## [tests/orbe-context-regression.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/orbe-context-regression.test.ts)

SHA-256: `31c93d75ddfc22754287df666484c1d91bba7eb74f594167ffa3fae89c15095d` · Imports e reexports declarados: 9.

*Nenhum símbolo das categorias enumeradas.*

## [tests/orbe-go-transfer.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/orbe-go-transfer.test.ts)

SHA-256: `b295083f2b82bfb0d074279de67f6ad09dcee63da638a26d9293cf6f2d6acc64` · Imports e reexports declarados: 7.

*Nenhum símbolo das categorias enumeradas.*

## [tests/orbe-natural-language-matrix.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/orbe-natural-language-matrix.test.ts)

SHA-256: `1601ab720a944ff0614a7692dc414f78ab84a3ee66b01acfa98d7a3b6c101cee` · Imports e reexports declarados: 3.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L5](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/orbe-natural-language-matrix.test.ts#L5) | `load` | arrow-function | Não |

## [tests/orbe-presentation-policy.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/orbe-presentation-policy.test.ts)

SHA-256: `a06ef49d3677a7dd04a6cf07a944a82e35ffae49a2de4140089db69ee1a33ce0` · Imports e reexports declarados: 9.

*Nenhum símbolo das categorias enumeradas.*

## [tests/orbe-professional-duration.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/orbe-professional-duration.test.ts)

SHA-256: `f1b8286b2c18f27a03e482d85336a664b53d566a2d0a99e23a2c0e4c43585627` · Imports e reexports declarados: 10.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L33](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/orbe-professional-duration.test.ts#L33) | `readEmployment` | arrow-function | Não |

## [tests/orbe-professional.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/orbe-professional.test.ts)

SHA-256: `0e5cbdf40e6180fccea15f5e616ad3e1ff3ddc0e88aaa64bffacd5a18235bcc3` · Imports e reexports declarados: 8.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L11](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/orbe-professional.test.ts#L11) | `setup` | function | Não |

## [tests/orbe-recruiter-scenarios.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/orbe-recruiter-scenarios.test.ts)

SHA-256: `e1b14e24f0006ee40f6c71a2c0046d853be093f249188a1dcce9010ec294ccd4` · Imports e reexports declarados: 9.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L12](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/orbe-recruiter-scenarios.test.ts#L12) | `createService` | function | Não |

## [tests/orbe-reports.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/orbe-reports.test.ts)

SHA-256: `cd80e55930896e17038ac6becf02f0fa589af9cc211dbfe78164574b51e46920` · Imports e reexports declarados: 3.

*Nenhum símbolo das categorias enumeradas.*

## [tests/orbe-social-policy.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/orbe-social-policy.test.ts)

SHA-256: `40ef36f0ac5b6ae0cb6fd4e70ead1c5adfad5c5848bf13654ad3f94100399813` · Imports e reexports declarados: 4.

*Nenhum símbolo das categorias enumeradas.*

## [tests/outbox-shutdown.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/outbox-shutdown.test.ts)

SHA-256: `53a1938d63d1c48d08ba904417e94aa378b95a914e239184d40b26d5962d0e2e` · Imports e reexports declarados: 5.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L23](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/outbox-shutdown.test.ts#L23) | `Result` | interface | Não |
| [L27](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/outbox-shutdown.test.ts#L27) | `deferred` | function | Não |
| [L36](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/outbox-shutdown.test.ts#L36) | `changed` | arrow-function | Não |
| [L38](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/outbox-shutdown.test.ts#L38) | `fixture` | function | Não |
| [L113](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/outbox-shutdown.test.ts#L113) | `observe` | function | Não |

## [tests/phase3-config.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/phase3-config.test.ts)

SHA-256: `1a0ee154aa0f81857642bd33f54a5e60851f6edf9e53c8a904f2ed0373e249a0` · Imports e reexports declarados: 3.

*Nenhum símbolo das categorias enumeradas.*

## [tests/phase3-docker-smoke.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/phase3-docker-smoke.test.ts)

SHA-256: `86a5ad0a599d6c68d878134dcd97623b09902c6f8640625be8435ef6478886ce` · Imports e reexports declarados: 4.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L8](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/phase3-docker-smoke.test.ts#L8) | `fakeDocker` | function | Não |

## [tests/phase3-evaluation.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/phase3-evaluation.test.ts)

SHA-256: `86d01156f0c8638375ead8e5ebd60a17f1bd058cb9e88db635ad12f5de1fa263` · Imports e reexports declarados: 6.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L8](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/phase3-evaluation.test.ts#L8) | `evaluate` | function | Não |

## [tests/phase3-flow.integration.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/phase3-flow.integration.test.ts)

SHA-256: `48a76dd2190ea3bfcb5bcf8387e68dd5965efd4f880f135dc100d44401438fc5` · Imports e reexports declarados: 15.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L23](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/phase3-flow.integration.test.ts#L23) | `RecordingSender` | class | Não |
| [L25](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/phase3-flow.integration.test.ts#L25) | `RecordingSender.send` | method | Não |
| [L31](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/phase3-flow.integration.test.ts#L31) | `eventually` | function | Não |

## [tests/phase3-preflight.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/phase3-preflight.test.ts)

SHA-256: `e0e9616640c2e8b21b678b0540562f82a12632c21b4137f464d886a174563159` · Imports e reexports declarados: 4.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L10](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/phase3-preflight.test.ts#L10) | `environment` | arrow-function | Não |

## [tests/postgres-admission.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/postgres-admission.test.ts)

SHA-256: `844f4115d60a6ad3239829efda339eb8a6a81b03e4d321b5fd67b68b14298092` · Imports e reexports declarados: 5.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L7](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/postgres-admission.test.ts#L7) | `input` | arrow-function | Não |
| [L8](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/postgres-admission.test.ts#L8) | `turn` | arrow-function | Não |
| [L20](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/postgres-admission.test.ts#L20) | `fakePool` | function | Não |
| [L37](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/postgres-admission.test.ts#L37) | `gate` | function | Não |

## [tests/postgres.integration.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/postgres.integration.test.ts)

SHA-256: `2b0d091e85d2b341fbc33e7c62cb48b800d11e2f242918e5949b66100a97c6e0` · Imports e reexports declarados: 12.

*Nenhum símbolo das categorias enumeradas.*

## [tests/ppks-academic.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/ppks-academic.test.ts)

SHA-256: `d811b49e29ecd4126aaed8cd3acf4633c4a4f14121b5270abe44e8daa93af37e` · Imports e reexports declarados: 6.

*Nenhum símbolo das categorias enumeradas.*

## [tests/ppks-evidence-graph.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/ppks-evidence-graph.test.ts)

SHA-256: `d016007af9eaacd589cc06bc8f4136b1a91c6ddbb7d51fc263a71d40ec5a58ed` · Imports e reexports declarados: 3.

*Nenhum símbolo das categorias enumeradas.*

## [tests/ppks-functional-v13.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/ppks-functional-v13.test.ts)

SHA-256: `f3a29f3e2cd482cc98b3ede6ac37b8c0b6486c32fd6804a4750ac77c1dd5d271` · Imports e reexports declarados: 3.

*Nenhum símbolo das categorias enumeradas.*

## [tests/ppks.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/ppks.test.ts)

SHA-256: `60ff998061d9fbe6be3389f88564353d843cb9d62a136a5e91daf4ab6742d29f` · Imports e reexports declarados: 4.

*Nenhum símbolo das categorias enumeradas.*

## [tests/public-evidence.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/public-evidence.test.ts)

SHA-256: `fe4de0c6401a919674fa597b5978be82294a683c85fb019ee759fd50526e2cdd` · Imports e reexports declarados: 6.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L10](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/public-evidence.test.ts#L10) | `htmlResponse` | function | Não |

## [tests/public-orbe.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/public-orbe.test.ts)

SHA-256: `373f0903d27c888af68f585439848a2b6422c8d4897e5772face0c315447cc99` · Imports e reexports declarados: 3.

*Nenhum símbolo das categorias enumeradas.*

## [tests/recruiter-intent-followups.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/recruiter-intent-followups.test.ts)

SHA-256: `c8863c17e034e216f5f9645071a40f61a552264d7fa8ee54691bc47093022b00` · Imports e reexports declarados: 7.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L22](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/recruiter-intent-followups.test.ts#L22) | `fakeProvider` | function | Não |
| [L37](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/recruiter-intent-followups.test.ts#L37) | `open` | function | Não |
| [L43](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/recruiter-intent-followups.test.ts#L43) | `ask` | function | Não |

## [tests/recruiter-matrix.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/recruiter-matrix.test.ts)

SHA-256: `8f6b844b7b706a82ddddd05d845ebaa539e9f7ce9d4e6add8349c617049fe51a` · Imports e reexports declarados: 6.

*Nenhum símbolo das categorias enumeradas.*

## [tests/reports.integration.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/reports.integration.test.ts)

SHA-256: `5bdb7d11dd81609a65deda09dc55ad67a35dc1bbc931c250b4d718bd111088e3` · Imports e reexports declarados: 10.

*Nenhum símbolo das categorias enumeradas.*

## [tests/runtime-lifecycle.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/runtime-lifecycle.test.ts)

SHA-256: `b4eb8e3ea54b4153846d4df0e94e4b46dd996d4e33d3fbc177574ca791524ffa` · Imports e reexports declarados: 5.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L40](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/runtime-lifecycle.test.ts#L40) | `deferred` | function | Não |
| [L49](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/runtime-lifecycle.test.ts#L49) | `until` | function | Não |
| [L56](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/runtime-lifecycle.test.ts#L56) | `flush` | function | Não |
| [L87](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/runtime-lifecycle.test.ts#L87) | `fakeQueue` | function | Não |
| [L99](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/runtime-lifecycle.test.ts#L99) | `fakeWorker` | function | Não |
| [L116](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/runtime-lifecycle.test.ts#L116) | `start` | arrow-function | Não |
| [L121](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/runtime-lifecycle.test.ts#L121) | `acquiredJob` | function | Não |

## [tests/semantic-graph.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/semantic-graph.test.ts)

SHA-256: `926c05fa4b29c532e0a13b8d2073698685ceb55ca3f43f4f1dfe3df16687ab1d` · Imports e reexports declarados: 4.

*Nenhum símbolo das categorias enumeradas.*

## [tests/semantic-hybrid-corpus.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/semantic-hybrid-corpus.test.ts)

SHA-256: `815bdd01cfa436eb06558cb828acfeba6d343f396f4f4241397cd1efe2397aef` · Imports e reexports declarados: 3.

*Nenhum símbolo das categorias enumeradas.*

## [tests/semantic-hybrid-coverage-report.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/semantic-hybrid-coverage-report.test.ts)

SHA-256: `830053fb4db8fdae9cf0cdd0d4b3f5a91e3b7ca7f090b0dda7f6c71813555974` · Imports e reexports declarados: 3.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L8](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/semantic-hybrid-coverage-report.test.ts#L8) | `fixtures` | function | Não |

## [tests/semantic-hybrid-lexical-baseline.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/semantic-hybrid-lexical-baseline.test.ts)

SHA-256: `02f2b70363a586404341fe72f4a891c3315675834a623cb3a46965d7b6892264` · Imports e reexports declarados: 3.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L19](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/semantic-hybrid-lexical-baseline.test.ts#L19) | `fixture` | function | Não |

## [tests/semantic-planner-port.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/semantic-planner-port.test.ts)

SHA-256: `4f6bd5665d1ef78c45cb3bd5836c282fc1d1475d83df5e6beabee28080302450` · Imports e reexports declarados: 2.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L21](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/semantic-planner-port.test.ts#L21) | `validProposal` | function | Não |

## [tests/semantic-shadow-readiness.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/semantic-shadow-readiness.test.ts)

SHA-256: `e90b6171796514d71e0fa358214a2df745477bd0c39d343d593402b82a3162fb` · Imports e reexports declarados: 2.

*Nenhum símbolo das categorias enumeradas.*

## [tests/semantic-skill-catalog.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/semantic-skill-catalog.test.ts)

SHA-256: `6b6199d0d7f1c6af5adbf4152c49c8da7d06a9f6f68973211385a63c000e7501` · Imports e reexports declarados: 4.

*Nenhum símbolo das categorias enumeradas.*

## [tests/worker-bullmq.integration.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/worker-bullmq.integration.test.ts)

SHA-256: `423975817fcc739f3a8ea7da0a6b5577d3a60cebb54d366e8a07b0d14afaf328` · Imports e reexports declarados: 10.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L10](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/worker-bullmq.integration.test.ts#L10) | `Payload` | type | Não |
| [L116](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/worker-bullmq.integration.test.ts#L116) | `record` | function | Não |
| [L121](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/worker-bullmq.integration.test.ts#L121) | `dockerRead` | function | Não |
| [L152](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/worker-bullmq.integration.test.ts#L152) | `requireOwnedRedis` | function | Não |
| [L272](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/worker-bullmq.integration.test.ts#L272) | `deferred` | function | Não |
| [L280](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/worker-bullmq.integration.test.ts#L280) | `until` | function | Não |
| [L287](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/worker-bullmq.integration.test.ts#L287) | `connection` | function | Não |
| [L290](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/worker-bullmq.integration.test.ts#L290) | `controlQueue` | function | Não |
| [L295](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/worker-bullmq.integration.test.ts#L295) | `runtime` | function | Não |
| [L308](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/worker-bullmq.integration.test.ts#L308) | `workerAt` | function | Não |
| [L313](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/worker-bullmq.integration.test.ts#L313) | `watch` | function | Não |

## [tests/worker-main.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/worker-main.test.ts)

SHA-256: `59cc4fc4f7c615023c5c29c9901a8d03cc994fd48d0a1ef089d5a260e6244a31` · Imports e reexports declarados: 5.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L102](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/worker-main.test.ts#L102) | `deferred` | function | Não |
| [L111](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/worker-main.test.ts#L111) | `flush` | function | Não |
| [L114](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/worker-main.test.ts#L114) | `signal` | function | Não |
| [L121](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/worker-main.test.ts#L121) | `start` | function | Não |
| [L126](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/worker-main.test.ts#L126) | `startupSignal` | function | Não |
| [L129](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/worker-main.test.ts#L129) | `assertSanitizedLogs` | function | Não |

## [tests/worker.integration.test.ts](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/worker.integration.test.ts)

SHA-256: `bde318ec53caebd858801de92ad1fda8ef20d7f7548cd1c1176fd7c74f2d002d` · Imports e reexports declarados: 9.

| Linha | Nome | Tipo | Exportado |
| ---: | --- | --- | --- |
| [L81](https://github.com/SladeSouzaSantos/phasscode-platform/blob/c302ec444266333756d9f35bc9c1dfd7a5e7c684/tests/worker.integration.test.ts#L81) | `seed` | function | Não |

