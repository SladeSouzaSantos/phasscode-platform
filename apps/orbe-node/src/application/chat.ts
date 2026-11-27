import { randomBytes, randomUUID } from 'node:crypto';
import {
  chatResponseSchema,
  type ChatRequest,
  type ChatResponse,
} from '../../../../packages/contracts/src/index.js';
import type { Config } from '../../../../packages/shared-config/src/index.js';
import type {
  ChatProvider,
  GenerationResult,
  ConversationStore,
  KnowledgeRepository,
  Message,
} from '../domain/ports.js';
import { AppError, conversationNotFound } from '../domain/errors.js';
import {
  hashToken,
  injectionRefusal,
  isInjection,
  isInScope,
  scopeRefusal,
  unknownAnswer,
  meetingUnavailable,
  greetingAnswer,
  isGreeting,
  isMeetingRequest,
  isOffTopicTask,
  isSimpleTest,
  simpleTestAnswer,
  isPersonalLifeQuestion,
  personalLifeAnswer,
} from '../domain/security.js';
import {
  calculateExperience,
  summarizeProfessionalExperience,
} from './tools/calculate-experience.tool.js';
import { createOrbeGraph } from './workflows/orbe-graph.js';
import type { PublicEvidenceReader } from './public-evidence.js';
import { graphShadowObservationSchema, type GraphShadowPort } from './graph-rag-shadow.js';
import type { GraphActivePort } from './graph-active-answer.js';
import { createSharedGraphTurnLlmBudget } from './graph-turn-llm-budget.js';
import type { LlmInvocationFactory } from '../domain/llm-invocation.js';
import { mentionedTechnologies } from '../knowledge-matching.js';
import { buildEvidencePacket, traceEvidence } from './evidence-packet.js';
import { evaluateJobMatch } from './tools/evaluate-job-match.tool.js';
import { getAcademicBackground } from './tools/academic-background.tool.js';
import { buildDirectGoExperienceResponse } from './go-experience-response.js';
import { reconcileCanonicalAcademicClaims } from './canonical-claims.js';
import { documentSource } from './sources.js';

export const PROMPT_VERSION = 'orbe-v4';
export class ChatService {
  private readonly turnGraph: ReturnType<typeof createOrbeGraph>;

  constructor(
    private readonly store: ConversationStore,
    private readonly provider: ChatProvider,
    private readonly knowledge: KnowledgeRepository,
    private readonly config: Config,
    private readonly meetingsEnabled = false,
    private readonly now: () => Date = () => new Date(),
    private readonly evidenceReader?: PublicEvidenceReader,
    private readonly graphShadow?: GraphShadowPort,
    private readonly graphActive?: GraphActivePort,
    private readonly graphModelFactory?: LlmInvocationFactory,
  ) {
    this.turnGraph = createOrbeGraph(knowledge);
  }

  async execute(
    request: ChatRequest,
    token?: string,
    options: { meetingActions?: boolean; analyticsConsent?: boolean } = {},
  ): Promise<ChatResponse> {
    const meetingActions = this.meetingsEnabled && options.meetingActions === true;
    const isNew = request.conversationId === undefined;
    if (!isNew && (!token || !/^[A-Za-z0-9_-]{43}$/.test(token))) throw conversationNotFound();
    const conversationId = request.conversationId ?? randomUUID();
    const conversationToken = isNew ? randomBytes(32).toString('base64url') : token!;
    return this.store.runTurn(
      {
        id: conversationId,
        tokenHash: hashToken(conversationToken),
        isNew,
        ...(options.analyticsConsent ? { analyticsConsent: true } : {}),
      },
      async (history) => {
        const { context, intent, experienceDocuments, retrieved: initialEvidence } =
          await this.turnGraph.invoke({ message: request.message, history });
        const { eligible, previous, technologyFollowUp, followUp, query } = context;
        const { normalizedQuery, completeCourseCatalog } = intent;
        const { durationQuestion, broadProfessionalOverview } = intent;
        let retrieved = initialEvidence;
        const evidenceTraceId = randomUUID();
        const meetingTurn =
          meetingActions &&
          (isMeetingRequest(request.message) ||
            (/\b(?:\d{4}-\d{2}-\d{2}|[\w.+-]+@[\w.-]+\.[a-z]{2,})\b/i.test(request.message) &&
              Boolean(previous && isMeetingRequest(previous.content))));
        // External pages are untrusted data, never instructions. Restrict retrieval to
        // public LinkedIn job postings and known public GitHub project READMEs.
        if (
          this.evidenceReader &&
          !isInjection(request.message) &&
          !isOffTopicTask(request.message)
        ) {
          const evidence = await this.evidenceReader.read(request.message, retrieved);
          if (evidence.length) {
            const replacements = new Map(evidence.map((doc) => [doc.id, doc]));
            retrieved = [
              ...evidence.filter((doc) => doc.id === 'external-vacancy'),
              ...retrieved.map((doc) => replacements.get(doc.id) ?? doc),
            ];
          }
        }
        if (meetingTurn)
          retrieved.unshift({
            type: 'platform',
            id: 'meeting-policy',
            title: 'Regras de agendamento em execução',
            keywords: ['reunião', 'agendamento'],
            content:
              'Consulte horários somente com get_meeting_availability. prepare_meeting_request prepara dados para o formulário de confirmação do visitante. Não cria solicitação nem reserva horário. Somente após confirmação HTTP há pedido PENDING; administração aprova e Calendar confirma. Nunca diga que uma proposta já foi registrada ou aprovada.',
          });
        traceEvidence('retrieved', retrieved, 'initial', evidenceTraceId);
        const verifiedMatrix = evaluateJobMatch(query, retrieved);
        // A source-complete, transparent duration answer must not discard
        // professional programming performed in mixed engineering/software roles.
        // Compute independently of LLM context truncation, using the canonical
        // structured employment records only (never external page content).
        const verifiedDuration =
          durationQuestion && experienceDocuments.length
            ? calculateExperience(query, experienceDocuments, this.now())
            : undefined;
        const verifiedOverview =
          broadProfessionalOverview && experienceDocuments.length
            ? summarizeProfessionalExperience(query, experienceDocuments, this.now())
            : undefined;
        const verifiedGo = buildDirectGoExperienceResponse(
          technologyFollowUp ? query : request.message,
          this.knowledge,
        );
        const verifiedAcademic = getAcademicBackground(this.knowledge, query, retrieved);
        // Opt-in DEV-only graph generation: preserve all canonical safety,
        // academic, duration, matrix and conversation-specific fast paths.
        // On abstention or reader outage, the existing PPKS path runs once.
        let graphAnswer: GenerationResult | undefined;
        // One logical limit shared across optional semantic normalization and
        // canonical model/tool rounds. Physical Redis quota stays unchanged.
        const graphTurnBudget =
          this.graphActive && this.graphModelFactory
            ? createSharedGraphTurnLlmBudget(this.graphModelFactory)
            : undefined;
        if (
          this.graphActive &&
          !meetingTurn &&
          !isInjection(request.message) &&
          !isOffTopicTask(request.message) &&
          !isGreeting(request.message) &&
          !isSimpleTest(request.message) &&
          !isPersonalLifeQuestion(request.message) &&
          !isMeetingRequest(request.message) &&
          !verifiedDuration &&
          !verifiedOverview &&
          !verifiedGo &&
          !verifiedAcademic &&
          !verifiedMatrix &&
          isInScope(
            request.message,
            retrieved.flatMap((doc) => doc.keywords),
          )
        ) {
          const started = performance.now();
          try {
            graphAnswer = await this.graphActive.answer(query, {
              ...(graphTurnBudget ? { semanticFactory: graphTurnBudget.semanticFactory } : {}),
              maxContextChars: Math.min(1_000_000, Math.max(2_000, this.config.CHAT_CONTEXT_CHARS)),
            });
          } catch {
            // A private reader/graph error is never reflected to visitors.
          }
          console.info(
            JSON.stringify({
              event: 'orbe_graphrag_active',
              ...(graphTurnBudget ? { semanticCalls: graphTurnBudget.usage().semanticCalls } : {}),
              traceId: evidenceTraceId,
              mode: graphAnswer ? 'verified_graph' : 'canonical_ppks',
              durationMs: Math.min(60_000, Math.max(0, Math.round(performance.now() - started))),
            }),
          );
        }
        let result: GenerationResult;
        let llmGenerated = false;
        if (isInjection(request.message)) result = { answer: injectionRefusal, sources: [] };
        else if (isGreeting(request.message)) result = { answer: greetingAnswer, sources: [] };
        else if (isSimpleTest(request.message)) result = { answer: simpleTestAnswer, sources: [] };
        else if (isOffTopicTask(request.message)) result = { answer: scopeRefusal, sources: [] };
        else if (isPersonalLifeQuestion(request.message))
          result = { answer: personalLifeAnswer, sources: [] };
        else if (verifiedDuration) result = verifiedDuration;
        else if (verifiedOverview) result = verifiedOverview;
        else if (verifiedGo) result = verifiedGo;
        else if (isMeetingRequest(request.message) && !meetingActions)
          result = {
            answer: meetingUnavailable,
            sources: this.knowledge
              .search('phasscode-platform')
              .filter((doc) => doc.id === 'phasscode-platform')
              .map(({ type, id, title, url }) => ({ type, id, title, ...(url ? { url } : {}) })),
          };
        else if (
          !isInScope(
            request.message,
            retrieved.flatMap((doc) => doc.keywords),
          ) &&
          !meetingTurn &&
          !followUp
        )
          result = { answer: scopeRefusal, sources: [] };
        else if (retrieved.length === 0) result = { answer: unknownAnswer, sources: [] };
        else if (verifiedAcademic) {
          // Exact enumeration: don't let a model count nine canonical courses
          // as eight or replace courses with degree coursework.
          result = verifiedAcademic;
        } else if (verifiedMatrix) {
          // Structured comparison: deterministic evidence, no additional LLM
          // calls or output-token truncation. Every requested row is present.
          result = {
            answer: verifiedMatrix.answer,
            sources: verifiedMatrix.sourceDocuments.slice(0, 10).map(documentSource),
          };
        } else if (graphAnswer) {
          result = graphAnswer;
        } else {
          const bounded: Message[] = [];
          // Reserva fixa para prompt, metadados JSON e protocolo das ferramentas.
          const dataBudget = Math.max(
            0,
            this.config.CHAT_CONTEXT_CHARS - 3000 - request.message.length,
          );
          const historyBudget = Math.floor(dataBudget / (completeCourseCatalog ? 6 : 2));
          let chars = 0;
          for (let index = eligible.length - 2; index >= 0; index -= 2) {
            const pair = eligible.slice(index, index + 2);
            const pairChars = pair.reduce((sum, message) => sum + message.content.length, 0);
            if (
              bounded.length + 2 > this.config.CHAT_HISTORY_MESSAGES ||
              chars + pairChars > historyBudget
            )
              break;
            chars += pairChars;
            bounded.unshift(...pair);
          }
          // Maintain coverage across distinct requirements. An overflowing early
          // record may never consume the entire budget and hide React/MySQL later.
          // Vacancy requirements are not limited to five documents. Preserve the
          // entire requirement-aware retrieval set; the packet/provider enforce
          // the actual context budget and fail closed if it cannot fit.
          const vacancy =
            /\b(?:vaga|recrutad\w*|experienc\w*|profission\w*|trabalh\w*|candidat\w*|qualific\w*|contrat\w*)\b/.test(
              normalizedQuery,
            );
          // Comparison follow-ups may not say "vaga", but still require
          // professional evidence, private-code-safe summaries and courses
          // together. The actual context budget, not a five-record cap, bounds them.
          const multiSourceComparison =
            mentionedTechnologies(query).has('sql-server') &&
            /\b(?:cursos?|mysql|firebase|angular|compar|reexamin|evidenc)\b/.test(normalizedQuery);
          const selected = completeCourseCatalog
            ? retrieved.slice(0, 7)
            : vacancy || multiSourceComparison
              ? retrieved
              : retrieved.slice(0, 5);
          // Unused history headroom belongs to evidence, not an artificial gap.
          // Actual retained history is already bounded above by historyBudget.
          const contentBudget = Math.max(0, dataBudget - chars);
          const packet = completeCourseCatalog
            ? selected
            : buildEvidencePacket(selected, contentBudget, mentionedTechnologies(query))?.documents;
          const documents = packet ?? [];
          traceEvidence('chat_bounded', documents, 'context_budget', evidenceTraceId);
          if (documents.length === 0)
            throw new AppError(
              'LLM_CONTEXT_LIMIT',
              502,
              'Limite de contexto do assistente atingido. Envie uma mensagem mais curta.',
            );
          const controller = new AbortController();
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            result = await Promise.race([
              this.provider.generate({
                message: technologyFollowUp ? query : request.message,
                history: bounded,
                documents,
                evidenceTraceId,
                signal: controller.signal,
                meetingActions,
                asOf: this.now(),
                ...(graphTurnBudget
                  ? { invocationFactoryOverride: graphTurnBudget.answerFactory }
                  : {}),
                ...(experienceDocuments.length
                  ? { experienceIds: experienceDocuments.map((doc) => doc.id) }
                  : {}),
              }),
              new Promise<never>((_, reject) => {
                timer = setTimeout(() => {
                  reject(
                    new AppError(
                      'LLM_TIMEOUT',
                      504,
                      'O assistente demorou para responder. Tente novamente.',
                    ),
                  );
                  // Escolhe o erro 504 antes de o listener de abort do transporte poder
                  // rejeitar a geração e transformá-lo incorretamente em LLM_UNAVAILABLE.
                  controller.abort();
                }, this.config.LLM_TIMEOUT_MS);
              }),
            ]);
            llmGenerated = true;
          } catch (error) {
            if (error instanceof AppError) throw error;
            throw new AppError(
              'LLM_UNAVAILABLE',
              502,
              'O provedor de IA está indisponível. Tente novamente.',
            );
          } finally {
            if (timer) clearTimeout(timer);
          }
        }
        // Bound, source-scoped audit of high-risk model prose. Never promote
        // a study into employment, a pending degree into a completed one, or
        // a duration to a single employer without public evidence.
        if (llmGenerated && this.graphActive?.auditGenerated && !result.actions?.length) {
          const audit = this.graphActive.auditGenerated(result.answer);
          if (audit.corrected) {
            result = {
              ...result,
              answer: audit.answer,
              sources: [
                ...new Map(
                  [...audit.sources, ...result.sources].map((source) => [source.id, source]),
                ).values(),
              ].slice(0, 10),
            };
            console.info(
              JSON.stringify({
                event: 'orbe_graphrag_claim_audit',
                traceId: evidenceTraceId,
                corrected: audit.corrected,
                rules: audit.rules,
              }),
            );
          }
        }
        // The model can invent incidental academic details even when the
        // structured course and recruiter routes are already correct. Reconcile
        // only unambiguous, documented academic claims before saving the turn.
        if (!verifiedGo && !verifiedAcademic && !verifiedMatrix && !result.actions?.length) {
          const canonical = reconcileCanonicalAcademicClaims(
            result.answer,
            this.knowledge.canonicalAcademicFacts?.(),
            request.message,
          );
          if (canonical.rules.length) {
            const canonicalSources = canonical.sourceIds
              .map((id) => this.knowledge.getDocument?.(id))
              .filter((doc): doc is NonNullable<typeof doc> => doc !== undefined)
              .map(documentSource);
            result = {
              ...result,
              answer: canonical.answer,
              sources: [
                ...new Map(
                  [...canonicalSources, ...result.sources].map((source) => [source.id, source]),
                ).values(),
              ].slice(0, 10),
            };
            console.info(
              JSON.stringify({
                event: 'orbe_canonical_claims',
                traceId: evidenceTraceId,
                rules: canonical.rules,
                sourceIds: canonical.sourceIds,
              }),
            );
          }
        }
        // Optional DEV-approved shadow comparison: the canonical response
        // above is always retained. Never log visitor prompts, answers,
        // provenance URLs, credentials or exception details.
        if (
          this.graphShadow &&
          !meetingTurn &&
          !isInjection(request.message) &&
          !isOffTopicTask(request.message) &&
          !isGreeting(request.message)
        ) {
          const shadowStartedAt = performance.now();
          // Measure only elapsed duration, never prompt, answer or source.
          const shadowDurationMs = () =>
            Math.min(60_000, Math.max(0, Math.round(performance.now() - shadowStartedAt)));
          try {
            const observation = graphShadowObservationSchema.parse(
              await this.graphShadow.inspect(query),
            );
            console.info(
              JSON.stringify({
                event: 'orbe_graphrag_shadow',
                traceId: evidenceTraceId,
                ...observation,
                durationMs: shadowDurationMs(),
              }),
            );
          } catch {
            console.info(
              JSON.stringify({
                event: 'orbe_graphrag_shadow',
                traceId: evidenceTraceId,
                mode: 'error',
                durationMs: shadowDurationMs(),
              }),
            );
          }
        }
        traceEvidence(
          'response_sources',
          result.sources.map((source) => ({ id: source.id, content: '' })),
          undefined,
          evidenceTraceId,
        );
        const response = chatResponseSchema.parse({
          conversationId,
          ...(isNew ? { conversationToken } : {}),
          answer: result.answer,
          sources: result.sources,
          ...(meetingActions && result.actions?.length ? { actions: result.actions } : {}),
          meta: {
            provider: this.provider.name,
            simulated: this.provider.name === 'mock',
            promptVersion: PROMPT_VERSION,
            ...(verifiedMatrix ||
            verifiedAcademic ||
            verifiedGo ||
            verifiedDuration ||
            verifiedOverview
              ? { deterministic: true }
              : graphAnswer
                ? { deterministic: true }
                : {}),
          },
        });
        return {
          response,
          messages: [
            { role: 'user', content: request.message },
            { role: 'assistant', content: response.answer },
          ],
        };
      },
    );
  }
}
