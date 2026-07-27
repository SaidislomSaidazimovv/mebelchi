export const MM = 10;

export function mm(millimeters: number): number {
  return Math.round(millimeters * MM);
}

export function mm10ToMeters(value: number): number {
  return value / 10000;
}

export function mm10ToMm(value: number): number {
  return value / 10;
}
