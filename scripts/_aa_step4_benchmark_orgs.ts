import { loadEnvironment } from '../src/config/env.js';
import { createDatabase } from '../src/db/database.js';
import { markRegistryUpdated } from '../src/db/registry-metadata.js';

const env = loadEnvironment();
const db = createDatabase(env.DATABASE_URL);

// slug -> { organization?: string; version?: string }
// Only include a key when there is verified, cited evidence. Leave
// everything else untouched (stays "Unknown") per AGENTS.md rule 11.
const UPDATES: Record<string, { organization?: string; version?: string }> = {
  // Artificial Analysis's own evaluations
  'aa-lcr': { organization: 'Artificial Analysis' },
  'aa-omniscience': { organization: 'Artificial Analysis' },
  'aa-intelligence-index': { organization: 'Artificial Analysis' },
  'gdpval-aa': { organization: 'Artificial Analysis', version: 'v2' },
  'tau3-banking': { organization: 'Artificial Analysis' },

  // Batch 1
  aime: { organization: 'MAA (Mathematical Association of America)' },
  'airs-bench': { organization: 'Meta FAIR' },
  apex: { organization: 'Mercor' },
  'apex-agents': { organization: 'Mercor' },
  'arc-agi': { organization: 'ARC Prize Foundation' },
  'automation-bench': { organization: 'Zapier' },
  'bfcl-v4': { organization: 'UC Berkeley', version: 'v4' },
  browsecomp: { organization: 'OpenAI' },
  chartqapro: { organization: 'York University' },
  'chinese-simpleqa': { organization: 'Alibaba' },

  // Batch 2
  corpusqa: { organization: 'Alibaba' },
  cursorbench: { organization: 'Cursor (Anysphere)' },
  deepplanning: { organization: 'Alibaba (Qwen Team)' },
  deepswe: { organization: 'Datacurve' },
  'finance-agent': { organization: 'Vals AI' },
  frontierswe: { organization: 'Proximal AI' },
  gpqa: { organization: 'New York University' },
  graphwalks: { organization: 'OpenAI' },
  'hle-verified': { organization: 'Alibaba (Qwen Team)' },
  hmmt: { organization: 'Harvard-MIT Mathematics Tournament' },
  'humanitys-last-exam': { organization: 'Center for AI Safety' },
  ifbench: { organization: 'Allen Institute for AI' },
  ifeval: { organization: 'Google' },
  imoanswerbench: { organization: 'Google DeepMind' },
  codeforces: { organization: 'Codeforces' },

  // Batch 3
  'itbench-sre': { organization: 'IBM' },
  livecodebench: { organization: 'UC Berkeley' },
  'livecodebench-v6': { organization: 'UC Berkeley', version: 'v6' },
  'longbench-v2': { organization: 'Tsinghua University', version: 'v2' },
  'mcp-atlas': { organization: 'Scale AI' },
  'mmlu-pro': { organization: 'University of Waterloo (TIGER-Lab)' },
  mmmlu: { organization: 'OpenAI' },
  mrcr: { organization: 'Google DeepMind' },
  'mrcr-v2': { organization: 'Google DeepMind', version: 'v2' },
  multichallenge: { organization: 'Scale AI' },
  'osworld-verified': { organization: 'XLang Lab (University of Hong Kong)' },
  posttrainbench: { organization: 'Thoughtful' },
  programbench: { organization: 'Meta FAIR' },

  // Batch 4
  scicode: { organization: 'University of Illinois Urbana-Champaign' },
  'screenspot-pro': { organization: 'National University of Singapore' },
  'seal-0': { organization: 'Virginia Tech' },
  seccodebench: { organization: 'Alibaba' },
  'simpleqa-verified': { organization: 'Google DeepMind' },
  skillsbench: { organization: 'BenchFlow AI' },
  supergpqa: { organization: 'ByteDance' },
  'swe-bench': { organization: 'Princeton University' },
  'swe-marathon': { organization: 'Abundant AI' },
  'tau2-bench': { organization: 'Sierra' },
  'terminal-bench': { organization: 'Laude Institute' },
  'terminal-bench-hard': { organization: 'Laude Institute' },
  'tool-decathlon': { organization: 'HKUST' },
  toolathlon: { organization: 'HKUST' },
  'video-mme': { organization: 'Tencent' },
  'vita-bench': { organization: 'Meituan' },
  widesearch: { organization: 'ByteDance' },
};

let updated = 0;
for (const [slug, fields] of Object.entries(UPDATES)) {
  const values: Record<string, string> = {};
  if (fields.organization !== undefined) values.organization_name = fields.organization;
  if (fields.version !== undefined) values.version = fields.version;
  if (Object.keys(values).length === 0) continue;

  const result = await db
    .updateTable('benchmarks')
    .set(values)
    .where('slug', '=', slug)
    .executeTakeFirst();

  if (Number(result.numUpdatedRows) === 0) {
    console.error('NOT FOUND:', slug);
    continue;
  }
  console.log('updated', slug, values);
  updated++;
}

if (updated > 0) await markRegistryUpdated(db);
console.log('total updated:', updated, 'of', Object.keys(UPDATES).length);

await db.destroy();
