import assert from 'node:assert/strict';
import { fillIdealBodyResultSlots } from '../utils/ideal-body-results.mjs';

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
console.log('Ideal body result slot tests passed: first/middle/last/dual/all failure states preserve real task identity.');
