/** Convierte camelCase/PascalCase a snake_case. Implementacion simple sin dependencias. */
export function snakeCase(value: string): string {
  if (!value) return value;
  return value
    .replace(/([a-z\d])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/[-\s]+/g, '_')
    .toLowerCase();
}
