/**
 * Recursively converts snake_case keys to camelCase.
 * Used to normalise Supabase (snake_case) responses for client components.
 */
export function toCamel<T>(obj: T): T {
  if (Array.isArray(obj)) return obj.map((item) => toCamel(item)) as unknown as T
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([k, v]) => [
        k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()),
        toCamel(v),
      ])
    ) as T
  }
  return obj
}
