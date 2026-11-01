import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const root = resolve('knowledge/ppks');
const version = '1.0';
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);

async function loadCollection(folder, schemaName) {
  const schema = await json(join(root, 'schemas', schemaName));
  const validate = ajv.compile(schema);
  const paths = (await readdir(join(root, folder))).filter((x) => x.endsWith('.json')).sort();
  const items = [];
  for (const filename of paths) {
    const card = await json(join(root, folder, filename));
    if (!validate(card)) {
      throw new Error(
        `PPKS_SCHEMA_INVALID ${folder}/${filename}: ${ajv.errorsText(validate.errors)}`,
      );
    }
    if (`${card.id}.json` !== filename) throw new Error(`PPKS_FILENAME_MISMATCH ${filename}`);
    if (card.schemaVersion !== version) throw new Error(`PPKS_VERSION_INVALID ${filename}`);
    const evidenceIds = new Set(card.evidence.map((entry) => entry.id));
    if (evidenceIds.size !== card.evidence.length)
      throw new Error(`PPKS_DUPLICATE_EVIDENCE ${filename}`);
    for (const entry of [
      ...card.stack,
      ...card.competencies,
      ...(card.features ?? []),
      ...(card.architecture?.patterns ?? []),
      ...(card.engineering?.tests ?? []),
    ]) {
      for (const id of entry.evidenceIds ?? []) {
        if (!evidenceIds.has(id)) throw new Error(`PPKS_BROKEN_EVIDENCE ${filename}: ${id}`);
      }
      if (
        entry.evidenceLevel === 'verified' &&
        !(entry.evidenceIds ?? []).some((id) =>
          card.evidence.some(
            (proof) =>
              proof.id === id &&
              ['source_code', 'test', 'workflow', 'configuration', 'commit'].includes(proof.type) &&
              proof.path,
          ),
        )
      )
        throw new Error(`PPKS_UNSUPPORTED_VERIFICATION ${filename}: ${entry.name}`);
    }
    if (card.sync.sourceCommit && !card.sync.lastModifiedAt)
      throw new Error(`PPKS_COMMIT_WITHOUT_DATE ${filename}`);
    if (card.sync.sourceCommit && !card.sync.sourceRepository)
      throw new Error(`PPKS_COMMIT_WITHOUT_REPOSITORY ${filename}`);
    if (card.sync.reviewedAt && card.sync.verificationStatus === 'pending_review')
      throw new Error(`PPKS_REVIEW_STATUS_INVALID ${filename}`);
    items.push(card);
  }
  return items;
}

async function validateAcademicCatalog(catalog) {
  const rootAcademic = join(root, 'academic');
  const entries = [
    ['educations', 'education-v1.1.schema.json'],
    ['tracks', 'courses-v1.1.schema.json'],
    ['skills', 'skills-v1.1.schema.json'],
  ];
  const loaded = {};
  for (const [name, schemaName] of entries) {
    const payload = await json(join(rootAcademic, `${name}.json`));
    const schema = await json(join(root, 'schemas', schemaName));
    const validate = ajv.compile(schema);
    if (!validate(payload))
      throw new Error(`PPKS_ACADEMIC_SCHEMA_INVALID ${name}: ${ajv.errorsText(validate.errors)}`);
    loaded[name] = payload;
  }
  const known = new Set(catalog.map((item) => item.id));
  const degrees = loaded.educations.educations;
  const tracks = loaded.tracks.tracks;
  const courses = tracks.flatMap((t) => t.courses);
  const unique = (items) => new Set(items).size === items.length;
  if (
    !unique(degrees.map((e) => e.id)) ||
    !unique(tracks.map((t) => t.id)) ||
    !unique(courses.map((c) => c.id)) ||
    !unique(loaded.skills.skills.map((s) => s.skill))
  )
    throw new Error('PPKS_ACADEMIC_DUPLICATE');
  if (degrees.some((e) => !known.has(e.id)) || tracks.some((t) => !known.has(t.id)))
    throw new Error('PPKS_ACADEMIC_CATALOG_MISMATCH');
  if (
    courses.length !== 42 ||
    tracks.length !== 6 ||
    degrees.length !== 9 ||
    courses.some((c) => c.status !== 'completed')
  )
    throw new Error('PPKS_ACADEMIC_COVERAGE_MISMATCH');
  const completed = degrees.filter((e) => e.status === 'completed');
  if (completed.some((e) => !e.completedAt && e.evidence !== 'owner_confirmed'))
    throw new Error('PPKS_ACADEMIC_COMPLETION_UNVERIFIED');
  const computerScience = degrees.find((e) => e.id === 'formacao-computacao');
  if (
    computerScience?.status !== 'pending_completion' ||
    !/2027/.test(computerScience.expectedWindow) ||
    !/2028/.test(computerScience.expectedWindow)
  )
    throw new Error('PPKS_UNISUL_COMPLETION_INVALID');
  const projectIds = new Set(
    catalog.filter((c) => ['project', 'platform'].includes(c.type)).map((c) => c.id),
  );
  const experienceIds = new Set(catalog.filter((c) => c.experiencePeriod).map((c) => c.id));
  for (const skill of loaded.skills.skills) {
    if (
      skill.education.some((id) => !degrees.some((e) => e.id === id)) ||
      skill.courseTracks.some((id) => !tracks.some((t) => t.id === id)) ||
      skill.projects.some((id) => !projectIds.has(id)) ||
      skill.professional.some((id) => !experienceIds.has(id))
    )
      throw new Error(`PPKS_SKILL_REFERENCE_INVALID ${skill.skill}`);
  }
  console.log(
    `PPKS_ACADEMIC_OK: ${degrees.length} educations, ${tracks.length} tracks, ${courses.length} courses, ${loaded.skills.skills.length} skills`,
  );
}

async function validateSemanticRelations() {
  const graph = await json(join(root, 'semantic-relations.json'));
  const schema = await json(join(root, 'schemas', 'semantic-relations-v1.schema.json'));
  const validate = ajv.compile(schema);
  if (!validate(graph))
    throw new Error('PPKS_GRAPH_SCHEMA_INVALID: ' + ajv.errorsText(validate.errors));
  const ids = graph.nodes.map((node) => node.id);
  const unique = new Set(ids);
  if (unique.size !== ids.length) throw new Error('PPKS_GRAPH_DUPLICATE_NODE');
  for (const edge of graph.edges)
    if (!unique.has(edge.from) || !unique.has(edge.to))
      throw new Error('PPKS_GRAPH_DANGLING_EDGE');
  const academic = await json(join(root, 'academic', 'skills.json'));
  const skills = new Set(academic.skills.map((record) => record.skill));
  if (graph.nodes.some((node) => node.skill && !skills.has(node.skill)))
    throw new Error('PPKS_GRAPH_UNKNOWN_SKILL');
  console.log('PPKS_GRAPH_OK: ' + graph.nodes.length + ' nodes, ' + graph.edges.length + ' relationships');
}

function buildIndex(projects, experiences, generatedAt) {
  return {
    schemaVersion: version,
    generatedAt,
    projects: projects.map((card) => ({
      id: card.id,
      path: `projects/${card.id}.json`,
      name: card.identity.name,
      applicationType: card.classification.applicationType,
      technologies: card.stack
        .filter((entry) => ['implemented', 'documented'].includes(entry.usage))
        .map((entry) => entry.name),
      skills: card.competencies
        .filter((entry) => entry.evidenceLevel !== 'inferred')
        .map((entry) => entry.name),
      nature: card.identity.nature,
      sourceCommit: card.sync.sourceCommit,
      lastModifiedAt: card.sync.lastModifiedAt,
      verificationStatus: card.sync.verificationStatus,
    })),
    experiences: experiences.map((card) => ({
      id: card.id,
      path: `experiences/${card.id}.json`,
      organization: card.organization,
      role: card.role,
      technologies: card.stack
        .filter((entry) => ['implemented', 'documented'].includes(entry.usage))
        .map((entry) => entry.name),
    })),
  };
}
async function main() {
  const [command] = process.argv.slice(2);
  if (!['index', 'check'].includes(command))
    throw new Error('Usage: npm run ppks:index | npm run ppks:check');
  const [projects, experiences] = await Promise.all([
    loadCollection('projects', 'project-v1.schema.json'),
    loadCollection('experiences', 'experience-v1.schema.json'),
  ]);
  const unique = new Set([...projects, ...experiences].map((x) => x.id));
  if (unique.size !== projects.length + experiences.length) throw new Error('PPKS_DUPLICATE_IDS');
  const catalog = await json(resolve('knowledge/portfolio.json'));
  await validateAcademicCatalog(catalog);
  await validateSemanticRelations();
  const sourceIds = new Set(catalog.map((item) => item.id));
  const catalogProjects = catalog.filter((item) => ['project', 'platform'].includes(item.type));
  if (
    projects.length !== catalogProjects.length ||
    catalogProjects.some((item) => !projects.some((card) => card.id === item.id))
  )
    throw new Error('PPKS_PROJECT_COVERAGE_MISMATCH');
  const catalogExperiences = catalog.filter((item) => item.experiencePeriod);
  if (
    experiences.length !== catalogExperiences.length ||
    catalogExperiences.some((item) => !experiences.some((card) => card.id === item.id))
  )
    throw new Error('PPKS_EXPERIENCE_COVERAGE_MISMATCH');
  for (const card of experiences) {
    const ref = catalog.find((item) => item.id === card.id);
    if (
      ref.experiencePeriod.start !== card.start ||
      (ref.experiencePeriod.end ?? null) !== card.end
    )
      throw new Error(`PPKS_EXPERIENCE_PERIOD_MISMATCH ${card.id}`);
    for (const id of card.projects)
      if (!sourceIds.has(id)) throw new Error(`PPKS_PROJECT_REFERENCE_INVALID ${card.id}: ${id}`);
  }
  const indexPath = join(root, 'index.json');
  const current = await json(indexPath).catch((error) => {
    if (command === 'index' && error.code === 'ENOENT') return null;
    throw error;
  });
  const expected = buildIndex(
    projects,
    experiences,
    current?.generatedAt ?? new Date().toISOString(),
  );
  const indexSchema = await json(join(root, 'schemas', 'index-v1.schema.json'));
  const validateIndex = ajv.compile(indexSchema);
  if (!validateIndex(expected))
    throw new Error(`PPKS_INDEX_SCHEMA_INVALID: ${ajv.errorsText(validateIndex.errors)}`);
  if (command === 'index') {
    // Only update generatedAt when the index material actually changed.
    if (current && JSON.stringify(current) !== JSON.stringify(expected))
      expected.generatedAt = new Date().toISOString();
    await writeFile(indexPath, JSON.stringify(expected, null, 2) + '\n', 'utf8');
    console.log(`PPKS_INDEX_OK: ${projects.length} projects, ${experiences.length} experiences`);
    return;
  }
  if (!validateIndex(current))
    throw new Error(`PPKS_INDEX_INVALID: ${ajv.errorsText(validateIndex.errors)}`);
  if (JSON.stringify(current) !== JSON.stringify(expected))
    throw new Error('PPKS_INDEX_STALE: run npm run ppks:index');
  console.log(`PPKS_CHECK_OK: ${projects.length} projects, ${experiences.length} experiences`);
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
