const fs = require('node:fs');
const path = require('node:path');
const { classifyByRules } = require('../dist/agent/intent/intent-rules.js');

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === '"' && quoted && text[i + 1] === '"') { cell += '"'; i += 1; }
    else if (c === '"') quoted = !quoted;
    else if (c === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell); cell = '';
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const headers = rows.shift();
  return rows.map((values) => Object.fromEntries(headers.map((h, i) => [h, values[i] || ''])));
}

const csvPath = path.resolve(__dirname, '../../docs/AGENT_INTENT_CLASSIFIER_TESTS.csv');
const cases = parseCsv(fs.readFileSync(csvPath, 'utf8'));
const failures = [];
let fieldChecks = 0;

for (const test of cases) {
  const actual = classifyByRules({
    message: test.message,
    hasImage: test.has_image === 'true',
    imageType: test.image_type || null,
    knownContextSummary: test.context_hint ? { hint: test.context_hint } : undefined,
  });
  const expected = {
    intent: test.expected_intent,
    subIntent: test.expected_sub_intent || null,
    riskLevel: test.expected_risk,
    requiresContext: test.requires_context === 'true',
    requiresKnowledge: test.requires_knowledge === 'true',
    requiresWriteTool: test.requires_write_tool === 'true',
    responseMode: test.response_mode,
  };
  if (!actual) { failures.push(`${test.case_id}: no rule result`); continue; }
  for (const [field, value] of Object.entries(expected)) {
    fieldChecks += 1;
    if (actual[field] !== value) failures.push(`${test.case_id}.${field}: expected ${value}, got ${actual[field]}`);
  }
}

const passed = fieldChecks - failures.length;
console.log(`Intent classifier: ${cases.length} cases, ${passed}/${fieldChecks} field checks passed`);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
}
