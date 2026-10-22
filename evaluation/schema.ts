import { z } from 'zod';
import { sourceSchema } from '../packages/contracts/src/index.js';

export const categorySchema = z.enum([
  'facts',
  'missing-information',
  'continuity',
  'scope',
  'security',
  'unavailable-features',
]);
export const conceptGroupSchema = z.strictObject({
  label: z.string().min(1),
  anyOf: z.array(z.string().min(1)).min(1),
  missing: z.enum(['fail', 'review']).default('fail'),
});
export const expectationSchema = z.strictObject({
  sourcePolicy: z.enum(['required', 'optional', 'none']),
  requiredSourceIds: z.array(z.string().min(1)).default([]),
  concepts: z.array(conceptGroupSchema).default([]),
  forbiddenTerms: z.array(z.string().min(1)).default([]),
});
export const matrixSchema = z.strictObject({
  version: z.enum(['orbe-phase2-v1', 'orbe-phase2-v2', 'orbe-phase2-v3']),
  description: z.string().min(1),
  cases: z
    .array(
      z.strictObject({
        id: z.string().regex(/^[a-z0-9-]+$/),
        category: categorySchema,
        title: z.string().min(1),
        humanReview: z.array(z.string().min(1)).min(1),
        turns: z
          .array(
            z.strictObject({
              message: z.string().trim().min(1).max(2000),
              expect: expectationSchema,
            }),
          )
          .min(1)
          .max(3),
      }),
    )
    .min(1)
    .max(20),
});
export const catalogSchema = z.array(sourceSchema.loose()).min(1).max(500);
export type EvaluationMatrix = z.infer<typeof matrixSchema>;
export type EvaluationCase = EvaluationMatrix['cases'][number];
export type Expectation = z.infer<typeof expectationSchema>;
export type Category = z.infer<typeof categorySchema>;
export type EvaluationStatus = 'pass' | 'fail' | 'review';
export const publicErrorCodeSchema = z.enum([
  'LLM_TIMEOUT',
  'LLM_UNAVAILABLE',
  'LLM_CONTEXT_LIMIT',
  'LLM_INVALID_RESPONSE',
  'LLM_INVALID_TOOL',
  'LLM_TOOL_LIMIT',
  'RATE_LIMITED',
  'INVALID_REQUEST',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'INTERNAL_ERROR',
  'NOT_FOUND',
  'ORIGIN_FORBIDDEN',
  'CONVERSATION_NOT_FOUND',
  'CONVERSATION_BUSY',
  'CAPACITY_REACHED',
]);
export type PublicErrorCode = z.infer<typeof publicErrorCodeSchema>;
export interface Check {
  id: string;
  status: EvaluationStatus;
  explanation: string;
}
export interface TurnAssessment {
  status: EvaluationStatus;
  checks: Check[];
  answer?: string;
  sourceIds: string[];
  provider?: string;
  simulated?: boolean;
  promptVersion?: string;
}
export interface TurnReport extends TurnAssessment {
  message: string;
  httpStatus: number | null;
  latencyMs: number;
  errorCode?: PublicErrorCode;
}
export interface CaseReport {
  id: string;
  category: Category;
  title: string;
  status: EvaluationStatus;
  turns: TurnReport[];
  humanReview: { status: 'pending'; criteria: string[] };
}
export interface EvaluationReport {
  reportVersion: 'orbe-evaluation-v1';
  startedAt: string;
  finishedAt: string;
  configuration: {
    apiOrigin: string;
    mode: 'live';
    matrixVersion: string;
    matrixSha256: string;
    catalogSha256: string;
    timeoutMs: number;
    maxCalls: number;
    selectedCaseIds: string[];
  };
  summary: { pass: number; fail: number; review: number; calls: number; stoppedEarly: boolean };
  limitations: string[];
  cases: CaseReport[];
}
