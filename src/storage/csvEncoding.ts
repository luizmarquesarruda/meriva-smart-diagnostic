/**
 * Encode one scalar as a quoted CSV cell and neutralize spreadsheet formula prefixes.
 * Numeric values retain their numeric representation, including negative values.
 */
export function escapeCsvCell(value: unknown): string {
  const text = String(value ?? '');
  const formulaLikeText = typeof value === 'string' && /^[\s]*[=+\-@]/.test(text);
  const safeText = formulaLikeText ? "'" + text : text;
  return '"' + safeText.replace(/"/g, '""') + '"';
}
