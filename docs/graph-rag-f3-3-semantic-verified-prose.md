# F3.3 — Interpretação semântica, verificação factual e narrativa para recrutadores

## Ativação

O padrão continua ORBE_GRAPHRAG_MODE=off. Active fica restrito ao overlay
compose.graphrag.active.dev.yaml no projeto phasscode-platform-dev, com
aprovação explícita, token HTTP privado do Graph Reader e sem credencial
Bolt/Neo4j na API. A entrega de código não executa deploy ou merge em main.

## 1. Interpretação de vagas

O fluxo Active reconhece requisitos em seções sinalizadas e em frases
identificadas pelo analisador conservador analyzeVacancyEvidenceCoverage.
Uma frase com possível exigência não interpretada bloqueia a cobertura total
e retorna ao PPKS; requisitos desconhecidos e alternativas também não são
descartados. A descrição da tecnologia usada pela empresa não configura
automaticamente um requisito nem uma qualificação do candidato.

Quando existe requisito desconhecido mas a frase foi extraída completamente,
um normalizador semântico **opcional** pode propor somente um trecho literal
da evidência da vaga. O modelo não pode inventar tecnologia, mudar
obrigatoriedade, remover fragmentos ou reduzir um composto inseparável.
Propostas inválidas, falha e timeout mantêm o plano determinístico conservador.
A chamada semântica compartilha o limite lógico do turno e a mesma reserva
física por provedor do LlmInvocationFactory canônico; não há cliente
paralelo nem isenção de quota.

## 2. Auditoria factual de prosa gerativa

O arquivo graph-generated-prose-audit.ts audita apenas a prosa
gerativa canônica quando o GraphRAG Active está explicitamente ativo.
São verificados conflitos identificáveis de (a) duração numérica atribuída
a um vínculo específico; (b) afirmação de experiência profissional numa
tecnologia sustentada apenas por estudo/projeto; (c) graduação anunciada
como concluída quando o status não é concluído e existe fonte pública
completa. Uma correção precisa de claim com TODAS as fontes públicas e URLs
HTTPS. Não se usa outra chamada LLM para validar.

O evento orbe_graphrag_claim_audit registra somente contagem, IDs de regras
e traceId aleatório. Não registra prompts, respostas, URLs ou segredos.
Registros acadêmicos privados não são convertidos em fontes públicas.

Limitação: a auditoria é propositalmente restrita a padrões de alto risco,
não é um verificador semântico universal de toda frase. Correções acadêmicas
adicionais continuam com o reconciliador canônico. Outros casos exigem
matriz de regressão e revisão humana na F3.4/#31.

## 3. Apresentação para recrutadores

O renderizador agora usa nomes de empresas, funções e projetos dos nós
curados do PPKS, em vez de IDs técnicos na resposta. As fontes HTTPS e seus
IDs permanecem no array estruturado sources. Em vagas, os cabeçalhos
identificam Requisito obrigatório e Diferencial. O texto preserva a diferença
entre emprego, atuação mista, projeto profissional, projeto autoral e estudo.

Evidências catalog_only sem URL HTTPS não são promovidas a resposta
GraphRAG verificável. Melhorar a cobertura desses projetos sem inventar
fontes está registrado em F3.6/#33.

## Aceite

Após CI green da nova revisão, homologar separadamente no MiniMac DEV,
alinhando API e Reader ao novo digest imutável, sem tocar main/produção,
volumes, Redis ou quotas:

- Java/Flutter, prioridades obrigatórias/desejáveis e vaga em prosa;
- Go, alternativas, negações e cláusulas não interpretadas devem abster-se
  de compor resposta incompleta e usar PPKS;
- 2–3 turnos preservando contextualização sem inventar experiência;
- fontes públicas completas, sem IDs internos no texto;
- logs saneados para verified_graph/canonical_ppks e auditoria factual
  quando existir incompatibilidade coberta;
- comportamento correto em outage, recovery e rollback Active/OFF.

A CI ou o piloto antigo em 08e0f260 não comprovam a nova revisão em DEV.
Manter F3.3/#30 aberta até a homologação. Benchmark de qualidade e
métricas p50/p95 estão na F3.4/#31; políticas de segurança e falhas de
provedores na F3.5/#32.
