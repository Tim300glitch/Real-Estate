// Small, dependency-free geospatial helpers (client + server).
// In production the heavy lifting (bbox, radius, polygon) runs in PostGIS;
// these mirror the same semantics for the demo provider and the browser.

export type LngLat = [number, number];

const R_MILES = 3958.7613;
const toRad = (d: number) => (d * Math.PI) / 180;

export function haversineMiles(a: LngLat, b: LngLat): number {
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R_MILES * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function inBbox(p: LngLat, bbox: [number, number, number, number]): boolean {
  return p[0] >= bbox[0] && p[0] <= bbox[2] && p[1] >= bbox[1] && p[1] <= bbox[3];
}

/** Ray casting point-in-polygon. ring = [lng, lat][] */
export function pointInPolygon(p: LngLat, ring: LngLat[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect = yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Polygon approximating a circle, for drawing radius rings */
export function circlePolygon(center: LngLat, miles: number, steps = 64): LngLat[] {
  const ring: LngLat[] = [];
  const latR = miles / 69.0;
  const lngR = miles / (69.172 * Math.cos(toRad(center[1])));
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 * Math.PI;
    ring.push([center[0] + lngR * Math.cos(t), center[1] + latR * Math.sin(t)]);
  }
  return ring;
}

export function ringBbox(ring: LngLat[]): [number, number, number, number] {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [x, y] of ring) {
    if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y;
  }
  return [w, s, e, n];
}

export function radiusBbox(center: LngLat, miles: number): [number, number, number, number] {
  return ringBbox(circlePolygon(center, miles, 16));
}

/** Rough square-mile area of a lng/lat ring (equirectangular), good enough for UI display */
export function ringAreaSqMiles(ring: LngLat[]): number {
  if (ring.length < 3) return 0;
  const lat0 = toRad(ring[0][1]);
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    a += x1 * 69.172 * Math.cos(lat0) * (y2 * 69) - x2 * 69.172 * Math.cos(lat0) * (y1 * 69);
  }
  return Math.abs(a / 2);
}
