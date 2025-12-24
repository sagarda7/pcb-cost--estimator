/** Safely parse any numeric input string to a non-negative number. */
export const num = (v: string | number | undefined | null): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

/** Clamp quantity to minimum of 2 as requested. */
export const clampQty = (v: string | number): number => {
  const n = num(v);
  return Math.max(1, Math.floor(n));
};

/** Excel-like ROUNDUP(x) for positive x (ceil). */
export const roundup = (x: number): number => Math.ceil(x);

/** Excel-like formula:
 * discount row = gross - gross * MAX(0.7, (1 - 0.05*qty))
 * total = gross - discount
 */
export const discountRow = (gross: number, qty: number) => {
  const effectiveRate = Math.max(0.7, 1 - 0.05 * qty);
  const discount = gross - gross * effectiveRate;
  const total = gross - discount; // equals gross * effectiveRate
  return { discount, total };
};
