import assert from 'node:assert/strict';
import { fillIdealBodyResultSlots, resolveIdealBodyBatch } from '../utils/ideal-body-results.mjs';

const lean = { taskId: 'lean-task', variant: 'lean' };
const athletic = { taskId: 'athletic-task', variant: 'athletic' };
const strong = { taskId: 'strong-task', variant: 'strong' };

assert.deepEqual(fillIdealBodyResultSlots([lean, athletic, strong]), [lean, athletic, strong]);
assert.deepEqual(fillIdealBodyResultSlots([null, athletic, strong]), [athletic, athletic, strong]);
assert.deepEqual(fillIdealBodyResultSlots([lean, null, strong]), [lean, lean, strong]);
assert.deepEqual(fillIdealBodyResultSlots([lean, athletic, null]), [lean, athletic, athletic]);
assert.deepEqual(fillIdealBodyResultSlots([null, athletic, null]), [athletic, athletic, athletic]);
assert.deepEqual(fillIdealBodyResultSlots([null, null, null]), [null, null, null]);

const filled = fillIdealBodyResultSlots([lean, null, null]);
assert.equal(filled[1].variant, 'lean');
assert.equal(filled[2].taskId, 'lean-task');

const batchTasks = [
  { id: 'lean-task', batchId: 'batch-1', variant: 'lean', status: 'completed', resultImageUrl: '/uploads/lean.png' },
  { id: 'athletic-task', batchId: 'batch-1', variant: 'athletic', status: 'processing' },
  { id: 'strong-task', batchId: 'batch-1', variant: 'strong', status: 'failed' },
];
assert.equal(resolveIdealBodyBatch(batchTasks, undefined).status, 'missing');
assert.equal(resolveIdealBodyBatch(batchTasks, 'unknown').status, 'missing');
assert.equal(resolveIdealBodyBatch(batchTasks, 'batch-1').status, 'processing');

batchTasks[1] = { ...batchTasks[1], status: 'completed', resultImageUrl: '/uploads/athletic.png' };
const terminal = resolveIdealBodyBatch(batchTasks, 'batch-1');
assert.equal(terminal.status, 'terminal');
assert.deepEqual(terminal.results, [
  { image: '/uploads/lean.png', taskId: 'lean-task', variant: 'lean' },
  { image: '/uploads/athletic.png', taskId: 'athletic-task', variant: 'athletic' },
  null,
]);

console.log('Ideal body result tests passed: display fallback and persisted batch recovery are stable.');
