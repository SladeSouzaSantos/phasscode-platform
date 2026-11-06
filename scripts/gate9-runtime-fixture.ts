/**
 * Export exact approved Orbe queries and a synthetic three-node LAB fixture.
 * Only for disposable GraphDB engine comparison, never seed operational Orbe.
 */
import {
  graphConstraintCypher, graphNodesCypher, graphRelationsCypher,
  graphPruneRelationsCypher, graphPruneNodesCypher,
  graphFindEvidenceCypher, graphGetSourceCypher,
} from '../apps/orbe-node/src/adapters/neo4j-graph-queries.js';

if (process.argv.length !== 2) {
  throw new Error('GATE9_FIXTURE_NO_ARGUMENTS');
}
const snapshot = 'gate9-ephemeral';
const skill = {
  kind: 'skill', id: 'skill-java', label: 'Java',
};
const claim = {
  kind: 'claim', id: 'claim-java', label: 'Java usage',
  subjectId: 'record-demo', objectId: 'skill-java',
  predicate: 'USES_TECHNOLOGY', scope: 'professional',
  sourceIds: ['source-java'],
};
const source = {
  kind: 'source', id: 'source-java', label: 'Synthetic code excerpt',
  visibility: 'public', origin: 'github', verificationStatus: 'code_reviewed',
};
const nodes = [skill, claim, source].map(node => ({
  id: node.id,
  properties: {
    ...node,
    payload: JSON.stringify(node),
    sourceIds: node.kind === 'claim' ? claim.sourceIds : [],
  },
}));
const relations = [
  { from: 'claim-java', to: 'skill-java', type: 'USES_TECHNOLOGY' },
  { from: 'claim-java', to: 'source-java', type: 'SUPPORTED_BY' },
].map((rel) => ({
  ...rel, key: [rel.from, rel.type, rel.to].join('::'),
  sourceIds: ['source-java'],
}));
const fixture = {
  version: 'gate9-exact-orbe-query-fixture-v1',
  provenance: 'synthetic_laboratory_only',
  snapshot,
  queries: {
    constraint: graphConstraintCypher,
    nodes: graphNodesCypher,
    relations: graphRelationsCypher,
    findEvidence: graphFindEvidenceCypher,
    getSource: graphGetSourceCypher,
    countNodes: 'MATCH (n:OrbeEvidence) RETURN count(n) AS total',
    countRelations: 'MATCH (:OrbeEvidence)-[r:ORBE_RELATION]->(:OrbeEvidence) RETURN count(r) AS total',
    pruneRelations: graphPruneRelationsCypher,
    pruneNodes: graphPruneNodesCypher,
  },
  params: {
    constraint: {},
    nodes: { rows: nodes, snapshot },
    relations: { rows: relations, snapshot },
    findEvidence: { skill: 'Java', limit: 5 },
    getSource: { id: source.id },
    countNodes: {}, countRelations: {},
    pruneRelations: { snapshot }, pruneNodes: { snapshot },
  },
  expected: {
    countNodes: 3, countRelations: 2,
    findEvidenceRows: 1, getSourceRows: 1,
  },
};
console.log(JSON.stringify(fixture));
