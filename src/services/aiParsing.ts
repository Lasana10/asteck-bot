export function extractFirstJsonObject(text: string): any | null {
  if (!text) return null;

  const start = text.indexOf('{');
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const char = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === '{') depth++;
    if (char === '}') depth--;

    if (depth === 0) {
      const jsonText = text.slice(start, i + 1);
      try {
        return JSON.parse(jsonText);
      } catch {
        return null;
      }
    }
  }

  return null;
}

export function safeText(value: unknown, fallback = ''): string {
  if (typeof value === 'string' && value.trim()) return value;
  return fallback;
}
