/**
 * Gate 8 preflight only: validate a DRAFT synthetic recruiter question corpus
 * against the seven public LAB records. NO NLP inference, model calls, HydraDB
 * HTTP, writes or integration into the Orbe application.
 *
 * PASS means structural integrity + canonical fixture consistency.
 * It does NOT mean the question gold has been independently reviewed, nor
 * that any natural-language classifier is accurate.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  assertLabCheckout,
  canonicalRepository,
  publicFixture,
  requirement,
} from './hydradb-lab-ts-live-check.js';

type Obj = Record<string, unknown>;
function check(value: unknown, code: string): asserts value {
  if (!value) throw new Error(code);
}
function object(value: unknown): Obj {
  check(typeof value === 'object' && value !== null &&
    !Array.isArray(value), 'LAB_GATE8_INVALID_OBJECT');
  return value as Obj;
}
function array(value: unknown): unknown[] {
  check(Array.isArray(value), 'LAB_GATE8_INVALID_ARRAY');
  return value as unknown[];
}
function string(value: unknown): string {
  check(typeof value === 'string' && value.trim().length > 0,
    'LAB_GATE8_INVALID_STRING');
  return value as string;
}
function unique(values: readonly string[], code: string): void {
  check(new Set(values).size === values.length, code);
}

async function main(): Promise<void> {
  const root = resolve(process.cwd());
  await assertLabCheckout(root);
  const filename = resolve(root, 'knowledge/evaluations/hydradb-gate8-recruiter.json');
  const document = object(JSON.parse(await readFile(filename, 'utf8')) as unknown);
  check(document.schemaVersion === 1, 'LAB_GATE8_SCHEMA_UNSUPPORTED');
  check(document.state === 'draft_requires_independent_review',
    'LAB_GATE8_GOLD_STATUS_UNEXPECTED');
  check(document.fixture === 'seven explicitly public PPKS lab records (Gate 7)',
    'LAB_GATE8_CORPUS_NOT_PUBLIC_LAB');

  const registry = object(document.knownClaims);
  const expectedSkills = [
    'Java', 'Flutter', 'Node.js', 'TypeScript', 'Go', 'React',
    'Spring Boot', 'Python', 'FastAPI', 'Django',
  ];
  unique(expectedSkills, 'LAB_GATE8_DUPLICATE_TECH');
  check(Object.keys(registry).length === expectedSkills.length &&
    expectedSkills.every((skill) => Object.hasOwn(registry, skill)),
  'LAB_GATE8_TECHNOLOGY_REGISTRY_DRIFT');

  const fixture = await publicFixture(root);
  check(fixture.length === 7, 'LAB_GATE8_FIXTURE_DRIFT');
  const canonical = canonicalRepository(fixture);
  for (const skill of expectedSkills) {
    const records = array(registry[skill]);
    const expected = records.map((item) => {
      const entry = object(item);
      const subjectId = string(entry.subjectId);
      const scope = string(entry.scope);
      check(Object.keys(entry).length === 2,
        'LAB_GATE8_GOLD_EXTRANEOUS_FIELDS');
      return [subjectId, scope];
    });
    unique(expected.map((item) => item.join('|')),
      'LAB_GATE8_DUPLICATE_CLAIM');
    const [result] = await canonical.findEvidence([requirement(skill)], {
      maxClaimsPerRequirement: 20,
    });
    check(result !== undefined, 'LAB_GATE8_NO_CANONICAL_RESULT');
    const observed = result.claims.map((claim) => [claim.subjectId, claim.scope]);
    check(JSON.stringify(expected) === JSON.stringify(observed),
      'LAB_GATE8_DRAFT_GOLD_FIXTURE_DRIFT_' +
        skill.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
  }

  const cases = array(document.cases);
  check(cases.length >= 16 && cases.length <= 80,
    'LAB_GATE8_CASE_COUNT_INVALID');
  const ids: string[] = [];
  const usedTags = new Set<string>();
  const usedSkills = new Set<string>();
  const allowedTags = new Set([
    'employment_overclaim', 'scope', 'paraphrase', 'provenance',
    'oov', 'mixed_skills', 'negation',
  ]);
  for (const item of cases) {
    const entry = object(item);
    const id = string(entry.id);
    check(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id),
      'LAB_GATE8_INVALID_CASE_ID');
    ids.push(id);
    check(entry.origin === 'synthetic', 'LAB_GATE8_UNAPPROVED_ORIGIN');
    const question = string(entry.question);
    check(question.length <= 320, 'LAB_GATE8_QUESTION_TOO_LONG');
    const skills = array(entry.expectedSkills).map(string);
    check(skills.length >= 1 && skills.length <= 3,
      'LAB_GATE8_REQUIREMENT_COUNT_INVALID');
    unique(skills, 'LAB_GATE8_DUPLICATE_REQUIREMENT');
    for (const skill of skills) {
      check(Object.hasOwn(registry, skill),
        'LAB_GATE8_SKILL_OUTSIDE_PUBLIC_FIXTURE');
      usedSkills.add(skill);
    }
    const tags = array(entry.riskTags).map(string);
    check(tags.length >= 1 && tags.length <= 5,
      'LAB_GATE8_TAG_COUNT_INVALID');
    unique(tags, 'LAB_GATE8_DUPLICATE_TAG');
    for (const tag of tags) {
      check(allowedTags.has(tag), 'LAB_GATE8_UNKNOWN_TAG');
      usedTags.add(tag);
    }
    check(Object.keys(entry).length === 5,
      'LAB_GATE8_UNDOCUMENTED_CASE_FIELD');
  }
  unique(ids, 'LAB_GATE8_DUPLICATE_CASE_ID');
  check(expectedSkills.every((skill) => usedSkills.has(skill)) &&
    [...allowedTags].every((tag) => usedTags.has(tag)),
  'LAB_GATE8_DRAFT_COVERAGE_INCOMPLETE');
  console.log('GATE8_CORPUS_DRAFT_CASES', cases.length,
    'SKILLS', usedSkills.size, 'RISK_TAGS', usedTags.size);
  console.log('GATE8_CORPUS_CANONICAL_FIXTURE_PARITY_PASS');
  console.log('GATE8_CORPUS_DRAFT_CHECK_PASS');
  console.log('GATE8_INDEPENDENT_GOLD_REVIEW_REQUIRED');
}

main().catch((error: unknown) => {
  console.error('GATE8_CORPUS_DRAFT_CHECK_FAILED',
    error instanceof Error && error.message.startsWith('LAB_')
      ? error.message : 'INTERNAL_ERROR');
  process.exitCode = 1;
});
