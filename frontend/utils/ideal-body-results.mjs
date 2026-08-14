/**
 * Fill failed display slots with the nearest successful result while preserving
 * the successful task's real taskId and variant for confirmation.
 * @template T
 * @param {Array<T | null>} results
 * @returns {Array<T | null>}
 */
export function fillIdealBodyResultSlots(results) {
  const source = results.slice(0, 3);
  while (source.length < 3) source.push(null);
  if (!source.some(Boolean)) return source;
  return source.map((result, index) => {
    if (result) return result;
    for (let distance = 1; distance < source.length; distance += 1) {
      const left = source[index - distance];
      if (left) return left;
      const right = source[index + distance];
      if (right) return right;
    }
    return null;
  });
}

const IDEAL_VARIANTS = ['lean', 'athletic', 'strong'];

/**
 * Resolve the persisted state of one generation batch without starting a new
 * provider request. Missing variants remain processing until the caller's
 * polling deadline so an in-flight batch is never invalidated prematurely.
 * @param {Array<{ batchId?: string | null, variant?: string | null, status?: string, resultImageUrl?: string | null, id: string }>} tasks
 * @param {string | undefined} batchId
 */
export function resolveIdealBodyBatch(tasks, batchId) {
  if (!batchId) return { status: 'missing', results: [null, null, null] };

  const matches = IDEAL_VARIANTS.map((variant) =>
    tasks.find((task) => task.batchId === batchId && task.variant === variant),
  );
  if (!matches.some(Boolean)) return { status: 'missing', results: [null, null, null] };

  const isTerminal = matches.every((task) =>
    task && (task.status === 'completed' || task.status === 'failed'),
  );
  if (!isTerminal) return { status: 'processing', results: [null, null, null] };

  return {
    status: 'terminal',
    results: matches.map((task, index) => task?.status === 'completed' && task.resultImageUrl
      ? { image: task.resultImageUrl, taskId: task.id, variant: IDEAL_VARIANTS[index] }
      : null),
  };
}
