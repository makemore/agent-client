/**
 * Case conversion utilities — ported from agent-frontend helpers.js
 */

/** Convert a string from snake_case to camelCase */
export function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

/** Convert a string from camelCase to snake_case */
export function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/** Recursively convert all keys in an object from snake_case to camelCase */
export function keysToCamel(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(keysToCamel);
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([key, value]) => [
        snakeToCamel(key),
        keysToCamel(value),
      ]),
    );
  }
  return obj;
}

/** Recursively convert all keys in an object from camelCase to snake_case */
export function keysToSnake(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(keysToSnake);
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([key, value]) => [
        camelToSnake(key),
        keysToSnake(value),
      ]),
    );
  }
  return obj;
}

/** Get a value from an object supporting both camelCase and snake_case keys */
export function getAnyCase(obj: Record<string, unknown> | null | undefined, camelKey: string): unknown {
  if (!obj || typeof obj !== 'object') return undefined;
  if (camelKey in obj) return obj[camelKey];
  const snakeKey = camelToSnake(camelKey);
  if (snakeKey in obj) return obj[snakeKey];
  return undefined;
}
