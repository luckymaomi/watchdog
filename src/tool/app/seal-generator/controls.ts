/** 滑块保留常用范围，直接填写数字时按实际值扩展范围。 */
export function expandRange(value: number, min: number, max: number): { min: number; max: number } {
  if (!Number.isFinite(value)) return { min, max };
  return { min: Math.min(min, value), max: Math.max(max, value) };
}

export function syncRange(range: HTMLInputElement, value: string): void {
  const bounds = expandRange(value === "" ? NaN : Number(value), Number(range.min), Number(range.max));
  range.min = String(bounds.min);
  range.max = String(bounds.max);
  range.value = value;
}
