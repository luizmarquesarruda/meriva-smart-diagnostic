/** Parse ATRV output without promoting error text or implausible values to voltage. */
export function parseAdapterVoltageResponse(response: string): number | null {
  const match = response.match(/(?:^|\s)(\d{1,2}(?:\.\d{1,2})?)\s*V?\b/i);
  const value = match ? Number(match[1]) : NaN;
  return Number.isFinite(value) && value >= 5 && value <= 20 ? value : null;
}
