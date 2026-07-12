export interface NormalizedIntentInput {
  original: string;
  normalized: string;
  features: string;
}

export function normalizeIntentInput(message: string): NormalizedIntentInput {
  const normalized = message
    .normalize('NFKC')
    .replace(/[，、；]/g, ',')
    .replace(/[。！？]/g, (value) => ({ '。': '.', '！': '!', '？': '?' })[value] || value)
    .replace(/\s+/g, ' ')
    .trim();
  const features = normalized
    .replace(/干嘛/g, '安排')
    .replace(/还剩(?:啥|什么)/g, '未完成')
    .replace(/还有(?:啥|什么)没完成/g, '未完成')
    .replace(/啥/g, '什么');
  return { original: message, normalized, features };
}
