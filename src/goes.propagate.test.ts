import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('satellite.js', () => {
  let gmst = 0; // radians
  return {
    __setGmst: (v: number) => { gmst = v; },

    twoline2satrec: (line1: string, line2: string) => ({ line1, line2 }),

    // deterministic ECI (km)
    propagate: (_rec: any, _at: Date) => ({ position: { x: 42164, y: 0, z: 0 } }),

    // read the current gmst set by tests
    gstime: (_at: Date) => gmst,

    // rotate about Z by gmst (km -> km)
    eciToEcf: (eci: { x: number; y: number; z: number }, g: number) => {
      const c = Math.cos(g), s = Math.sin(g);
      return { x: eci.x * c - eci.y * s, y: eci.x * s + eci.y * c, z: eci.z };
    },
  };
});

import { propagateToEcefMeters } from './goes';
import * as sat from 'satellite.js'; // this is the mocked module

const TLE = { line1: '1 00000U 00000A   00000.00000000  .00000000  00000-0  00000-0 0  0000',
              line2: '2 00000   0.0000   0.0000 0000000   0.0000   0.0000  1.00270000    00' };

describe('propagateToEcefMeters', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Default GMST = 0 rad unless a test changes it
    (sat as any).__setGmst(0);
  });

  it('converts km to meters and uses GMST=0 (no rotation)', () => {
    (sat as any).__setGmst(0); // no rotation: ECEF == ECI
    const t = new Date(Date.UTC(2025, 0, 1, 0, 0, 0));
    const ecef = propagateToEcefMeters(TLE, t);

    // Expected: x = 42164 km -> 42,164,000 m ; y,z ~ 0
    expect(ecef.x).toBeCloseTo(42164_000, 0);
    expect(Math.abs(ecef.y)).toBeLessThan(1e-6);
    expect(Math.abs(ecef.z)).toBeLessThan(1e-6);
  });

  it('applies Earth rotation (GMST=π/2 rotates +x into +y)', () => {
    (sat as any).__setGmst(Math.PI / 2); // 90° rotation about Z
    const t = new Date(Date.UTC(2025, 0, 1, 0, 0, 0));
    const ecef = propagateToEcefMeters(TLE, t);

    // x'≈0, y'≈42164 km -> 42,164,000 m
    expect(Math.abs(ecef.x)).toBeLessThan(100);           // near zero (meters)
    expect(ecef.y).toBeCloseTo(42164_000, -2);            // within a couple meters
    expect(Math.abs(ecef.z)).toBeLessThan(1e-6);
  });

  it('throws when SGP4 returns no position', () => {
    // Make propagate return an object without .position just this once
    vi.spyOn(sat, 'propagate' as any).mockReturnValueOnce({ position: undefined });
    const t = new Date(Date.UTC(2025, 0, 1, 0, 0, 0));

    expect(() => propagateToEcefMeters(TLE, t)).toThrow(/no position/i);
  });
});
