import { readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
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
      throw new Error(`PPKS_SCHEMA_INVALID ${folder}/${filename}: ${ajv.errorsText(validate.errors)}`);
    }
    if (`${card.id}.json` !== filename) throw new Error(`PPKS_FILENAME_MISMATCH ${filename}`);
    if (card.schemaVersion !== version) throw new Error(`PPKS_VERSION_INVALID ${filename}`);
    const evidenceIds = new Set(card.evidence.map((entry) => entry.id));
    if (evidenceIds.size !== card.evidence.length) throw new Error(`PPKS_DUPLICATE_EVIDENCE ${filename}`);
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
      if (entry.evidenceLevel === 'verified' &&
        !(entry.evidenceIds ?? []).some((id) => card.evidence.some(
          (proof) => proof.id === id && ['source_code', 'test', 'workflow', 'configuration', 'commit'].includes(proof.type) && proof.path,
        )))
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
      skills: card.competencies.filter((entry) => entry.evidenceLevel !== 'inferred').map((entry) => entry.name),
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
      technologies: card.stack.filter((entry) => ['implemented', 'documented'].includes(entry.usage)).map((entry) => entry.name),
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
  const sourceIds = new Set(catalog.map((item) => item.id));
  const catalogProjects = catalog.filter((item) => ['project', 'platform'].includes(item.type));
  if (projects.length !== catalogProjects.length ||
    catalogProjects.some((item) => !projects.some((card) => card.id === item.id)))
    throw new Error('PPKS_PROJECT_COVERAGE_MISMATCH');
  const catalogExperiences = catalog.filter((item) => item.experiencePeriod);
  if (experiences.length !== catalogExperiences.length ||
    catalogExperiences.some((item) => !experiences.some((card) => card.id === item.id)))
    throw new Error('PPKS_EXPERIENCE_COVERAGE_MISMATCH');
  for (const card of experiences) {
    const ref = catalog.find((item) => item.id === card.id);
    if (ref.experiencePeriod.start !== card.start ||
      (ref.experiencePeriod.end ?? null) !== card.end)
      throw new Error(`PPKS_EXPERIENCE_PERIOD_MISMATCH ${card.id}`);
    for (const id of card.projects) if (!sourceIds.has(id)) throw new Error(`PPKS_PROJECT_REFERENCE_INVALID ${card.id}: ${id}`);
  }
  const indexPath = join(root, 'index.json');
  const current = await json(indexPath).catch((error) => {
    if (command === 'index' && error.code === 'ENOENT') return null;
    throw error;
  });
  const expected = buildIndex(projects, experiences, current?.generatedAt ?? new Date().toISOString());
  const indexSchema = await json(join(root, 'schemas', 'index-v1.schema.json'));
  const validateIndex = ajv.compile(indexSchema);
  if (!validateIndex(expected)) throw new Error(`PPKS_INDEX_SCHEMA_INVALID: ${ajv.errorsText(validateIndex.errors)}`);
  if (command === 'index') {
    // Only update generatedAt when the index material actually changed.
    if (current && JSON.stringify(current) !== JSON.stringify(expected))
      expected.generatedAt = new Date().toISOString();
    await writeFile(indexPath, JSON.stringify(expected, null, 2) + '\n', 'utf8');
    console.log(`PPKS_INDEX_OK: ${projects.length} projects, ${experiences.length} experiences`);
    return;
  }
  if (!validateIndex(current)) throw new Error(`PPKS_INDEX_INVALID: ${ajv.errorsText(validateIndex.errors)}`);
  if (JSON.stringify(current) !== JSON.stringify(expected))
    throw new Error('PPKS_INDEX_STALE: run npm run ppks:index');
  console.log(`PPKS_CHECK_OK: ${projects.length} projects, ${experiences.length} experiences`);
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
