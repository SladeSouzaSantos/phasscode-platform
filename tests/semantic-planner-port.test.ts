import { describe, expect, it } from 'vitest';
import {
  validateSemanticPlannerProposal,
  type SemanticPlannerPort,
} from '../apps/orbe-node/src/application/semantic-planner-port.js';

const sourceText = 'Requisitos: Java ou Kotlin. Usamos Go. React é desejável.';
const anchors = ['Java ou Kotlin', 'Go', 'React'].map((text, i) => {
  const start = sourceText.indexOf(text);
  return { id: `fragment-${i}`, start, end: start + text.length, text };
});
const request = {
  schemaVersion: 'semantic-planner-v1',
  sourceText,
  anchors,
  publicCatalogSkillIds: ['skill-java', 'skill-kotlin', 'skill-react'],
};

function validProposal() {
  return {
    schemaVersion: 'semantic-planner-v1',
    mode: 'diagnostic_only',
    suggestions: [
      {
        anchor: anchors[0],
        status: 'suggested',
        role: 'alternative',
        relation: 'candidate_requirement',
        priority: 'mandatory',
        origin: 'literal_rules',
        alternativeGroup: 'group-1',
        candidates: [
          { skillId: 'skill-java', score: 0.8, method: 'lexical' },
          { skillId: 'skill-kotlin', score: 0.7, method: 'embedding' },
        ],
      },
      {
        anchor: anchors[1],
        status: 'suggested',
        role: 'context',
        relation: 'company_stack',
        priority: 'none',
        origin: 'literal_rules',
        candidates: [],
      },
      {
        anchor: anchors[2],
        status: 'suggested',
        role: 'desirable',
        relation: 'candidate_requirement',
        priority: 'desirable',
        origin: 'literal_rules',
        candidates: [{ skillId: 'skill-react', score: 0.9, method: 'lexical' }],
      },
    ],
  };
}

describe('F3.7 model-agnostic SemanticPlanner diagnostic contract', () => {
  it('accepts complete anchored alternatives, company context and optional qualifications', () => {
    const output = validateSemanticPlannerProposal(request, validProposal());
    expect(output.suggestions.map((d) => [d.role, d.priority])).toEqual([
      ['alternative', 'mandatory'],
      ['context', 'none'],
      ['desirable', 'desirable'],
    ]);
    expect(output.mode).toBe('diagnostic_only');
  });

  it('permits abstention without losing a source span', () => {
    const proposal = validProposal();
    proposal.suggestions[1] = {
      anchor: anchors[1],
      status: 'abstained',
      role: 'uncertain',
      relation: null,
      priority: 'none',
      origin: null,
      candidates: [],
    };
    const output = validateSemanticPlannerProposal(request, proposal);
    expect(output.suggestions).toHaveLength(3);
    expect(output.suggestions[1]?.status).toBe('abstained');
    expect(output.suggestions[1]?.candidates).toEqual([]);
  });

  it('rejects omitting or duplicating a requirement anchor', () => {
    const missing = validProposal();
    missing.suggestions.pop();
    expect(() => validateSemanticPlannerProposal(request, missing)).toThrow(
      'SEMANTIC_PLANNER_INCOMPLETE_COVERAGE',
    );
    const duplicate = validProposal();
    duplicate.suggestions[1]!.anchor = anchors[0];
    expect(() => validateSemanticPlannerProposal(request, duplicate)).toThrow(
      'SEMANTIC_PLANNER_SPAN_MISMATCH',
    );
  });

  it('rejects a hallucinated span and any manipulated literal offsets', () => {
    const tampered = validProposal();
    tampered.suggestions[0]!.anchor = { ...anchors[0]!, text: 'Go ou Java' };
    expect(() => validateSemanticPlannerProposal(request, tampered)).toThrow(
      'SEMANTIC_PLANNER_SPAN_MISMATCH',
    );

    const ungroundedRequest = structuredClone(request);
    ungroundedRequest.anchors[0]!.start += 1;
    expect(() => validateSemanticPlannerProposal(ungroundedRequest, validProposal())).toThrow(
      'SEMANTIC_PLANNER_UNGROUNDED_ANCHOR',
    );
  });

  it('forbids invented PPKS ids and duplicate candidate skills', () => {
    const invented = validProposal();
    invented.suggestions[0]!.candidates[0]!.skillId = 'skill-hallucinated';
    expect(() => validateSemanticPlannerProposal(request, invented)).toThrow(
      'SEMANTIC_PLANNER_UNTRUSTED_CANDIDATE',
    );

    const duplicated = validProposal();
    duplicated.suggestions[0]!.candidates[1]!.skillId = 'skill-java';
    expect(() => validateSemanticPlannerProposal(request, duplicated)).toThrow(
      'SEMANTIC_PLANNER_UNTRUSTED_CANDIDATE',
    );
  });

  it('rejects scores outside 0..1 even when an embedding returns them', () => {
    const negative = validProposal();
    negative.suggestions[0]!.candidates[0]!.score = -0.5;
    expect(() => validateSemanticPlannerProposal(request, negative)).toThrow(
      'SEMANTIC_PLANNER_INVALID_PROPOSAL',
    );

    const infinite = validProposal();
    infinite.suggestions[0]!.candidates[0]!.score = Infinity;
    expect(() => validateSemanticPlannerProposal(request, infinite)).toThrow(
      'SEMANTIC_PLANNER_INVALID_PROPOSAL',
    );
  });

  it('does not allow a company stack to become a priority requirement in the response', () => {
    const wrong = validProposal();
    wrong.suggestions[1]!.priority = 'mandatory';
    expect(() => validateSemanticPlannerProposal(request, wrong)).toThrow(
      'SEMANTIC_PLANNER_ROLE_PRIORITY_CONFLICT',
    );
  });

  it('requires explicit alternatives to remain grouped and non-optional by default', () => {
    const missingGroup = validProposal();
    delete (missingGroup.suggestions[0] as { alternativeGroup?: string }).alternativeGroup;
    expect(() => validateSemanticPlannerProposal(request, missingGroup)).toThrow(
      'SEMANTIC_PLANNER_INVALID_ALTERNATIVE_GROUP',
    );
    const badPriority = validProposal();
    badPriority.suggestions[0]!.priority = 'none';
    expect(() => validateSemanticPlannerProposal(request, badPriority)).toThrow(
      'SEMANTIC_PLANNER_ROLE_PRIORITY_CONFLICT',
    );
  });

  it('rejects malformed abstentions that pretend to prove qualifications', () => {
    const wrong = validProposal();
    wrong.suggestions[0]!.status = 'abstained';
    expect(() => validateSemanticPlannerProposal(request, wrong)).toThrow(
      'SEMANTIC_PLANNER_INVALID_ABSTENTION',
    );
  });

  it('fails closed when arbitrary claims, verified flags or a production mode appear', () => {
    const forged = validProposal();
    const withClaim = { ...forged, verifiedProfessionalExperience: true };
    expect(() => validateSemanticPlannerProposal(request, withClaim)).toThrow(
      'SEMANTIC_PLANNER_INVALID_PROPOSAL',
    );
    expect(() =>
      validateSemanticPlannerProposal(request, {
        ...forged,
        mode: 'active',
      }),
    ).toThrow('SEMANTIC_PLANNER_INVALID_PROPOSAL');
    expect(() =>
      validateSemanticPlannerProposal(request, {
        ...forged,
        suggestions: [{ ...forged.suggestions[0], claimIds: ['invented'] }, ...forged.suggestions.slice(1)],
      }),
    ).toThrow('SEMANTIC_PLANNER_INVALID_PROPOSAL');
  });

  it('is independent of the optional implementation behind the port', async () => {
    const adapter: SemanticPlannerPort = {
      async propose() {
        return validProposal();
      },
    };
    const result = validateSemanticPlannerProposal(request, await adapter.propose(request));
    expect(result.suggestions).toHaveLength(3);
    expect(result.suggestions.every((s) => s.status === 'suggested')).toBe(true);
  });

  it('rejects extra candidate ids in the catalog and overlapping source spans', () => {
    const duplicateCatalog = {
      ...request,
      publicCatalogSkillIds: ['skill-java', 'skill-java'],
    };
    expect(() => validateSemanticPlannerProposal(duplicateCatalog, validProposal())).toThrow(
      'SEMANTIC_PLANNER_DUPLICATE_CATALOG_SKILL',
    );
    const overlap = structuredClone(request);
    overlap.anchors[1] = { ...overlap.anchors[0]!, id: 'fragment-1' };
    expect(() => validateSemanticPlannerProposal(overlap, validProposal())).toThrow(
      'SEMANTIC_PLANNER_UNGROUNDED_ANCHOR',
    );
  });
});
