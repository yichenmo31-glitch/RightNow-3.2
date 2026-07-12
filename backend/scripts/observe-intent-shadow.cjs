const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { IntentSemanticService } = require('../dist/agent/intent/intent-semantic.service.js');

const samples = JSON.parse(fs.readFileSync(
  path.resolve(__dirname, '../../docs/AGENT_INTENT_V2_SHADOW_SAMPLE.json'),
  'utf8',
));
const config = { get: (key) => process.env[key] };
const semantic = new IntentSemanticService(config);

async function main() {
  const counts = { total: samples.length, completed: 0, exact: 0, errors: 0, durationMs: 0 };
  const fieldMatches = { resource: 0, operation: 0, scope: 0 };
  for (const sample of samples) {
    const startedAt = Date.now();
    try {
      const result = await semantic.classify({ message: sample.message, channel: 'shadow-sample' });
      const matches = {
        resource: result.resource === sample.resource,
        operation: result.operation === sample.operation,
        scope: result.scope === sample.scope,
      };
      for (const [field, matched] of Object.entries(matches)) if (matched) fieldMatches[field] += 1;
      if (Object.values(matches).every(Boolean)) counts.exact += 1;
      counts.completed += 1;
      counts.durationMs += Date.now() - startedAt;
      console.log(JSON.stringify({
        caseId: sample.caseId, ...matches,
        classifiedResource: result.resource, classifiedOperation: result.operation,
        classifiedScope: result.scope, confidence: result.confidence, riskLevel: result.riskLevel,
      }));
    } catch (error) {
      counts.errors += 1;
      counts.durationMs += Date.now() - startedAt;
      console.log(JSON.stringify({ caseId: sample.caseId, errorType: classifyError(error) }));
    }
  }
  console.log(JSON.stringify({
    event: 'intent_v2_shadow_sample_summary', ...counts, fieldMatches,
    exactRate: counts.completed ? Number((counts.exact / counts.completed).toFixed(4)) : 0,
    averageDurationMs: counts.total ? Math.round(counts.durationMs / counts.total) : 0,
  }));
  if (counts.errors || counts.exact !== counts.total) process.exitCode = 1;
}

function classifyError(error) {
  const message = error instanceof Error ? error.message : '';
  if (/Invalid semantic resource/.test(message)) return 'invalid_resource';
  if (/Invalid semantic operation/.test(message)) return 'invalid_operation';
  if (/Invalid semantic scope/.test(message)) return 'invalid_scope';
  if (/Invalid semantic risk/.test(message)) return 'invalid_risk';
  if (/Invalid semantic confidence/.test(message)) return 'invalid_confidence';
  if (/JSON|semantic/i.test(message)) return 'invalid_response';
  if (/429/.test(message)) return 'rate_limited';
  if (/abort|timeout/i.test(message)) return 'timeout';
  if (/No chat provider configured/.test(message)) return 'not_configured';
  return 'provider_error';
}

main();
