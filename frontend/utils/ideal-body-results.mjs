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
