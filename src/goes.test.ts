import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  parseTimestampFromUrl, dateFromDayOfYearUTC, parseHttpDate,
  setFetchImpl, setImageLoader, fetchLatestGoesFrames, FULL_DISK_FOV_DEG
} from './goes';

vi.mock('satellite.js', () => {
  return {
    // twoline2satrec can return any token object
    twoline2satrec: (l1: string, l2: string) => ({ l1, l2 }),
    // Fixed ECI km
    propagate: (_rec: any, _at: Date) => ({ position: { x: 42164, y: 0, z: 0 } }),
    // Simple GMST & eciToEcf passthrough so math is stable
    gstime: (_at: Date) => 0,
    eciToEcf: (eci: any, _gmst: number) => eci,
  };
});


// -------------- Pure helpers -----------------
describe('timestamp parsing', () => {
  it('parses YYYYMMDD-HHMM.jpg', () => {
    const d = parseTimestampFromUrl('.../GOES19_20250812-2310.jpg');
    expect(d?.toISOString()).toBe('2025-08-12T23:10:00.000Z');
  });

  it('parses YYYYMMDDHHMMSS', () => {
    const d = parseTimestampFromUrl('.../GOES18-20250812231045_full.jpg');
    expect(d?.toISOString()).toBe('2025-08-12T23:10:45.000Z');
  });

  it('parses /YYYY/DDD/..-HHMMSS.jpg', () => {
    const d = parseTimestampFromUrl('https://x/y/2025/225/whatever-235959.jpg');
    expect(d?.toISOString()).toBe('2025-08-13T23:59:59.000Z'); // 2025-DOY225 = Aug 13
  });

  it('falls back for bad urls', () => {
    expect(parseTimestampFromUrl('no-time-here.jpg')).toBeNull();
  });

  it('DOY helper', () => {
    const { y,m,d } = dateFromDayOfYearUTC(2024, 60); // 2024 leap year
    expect([y,m,d]).toEqual([2024, 2, 29]);
  });

  it('http date', () => {
    const d = parseHttpDate('Tue, 12 Aug 2025 23:10:00 GMT');
    expect(d?.toISOString()).toBe('2025-08-12T23:10:00.000Z');
  });
});

// -------------- I/O with DI ------------------
describe('fetchLatestGoesFrames()', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns frames with correct aspect and timestamp (mocked)', async () => {
    // Mock fetch:
    setFetchImpl(async (url: any) => {
      const u = String(url);
      // Fake TLE response
      if (u.includes('celestrak.org/NORAD/elements/gp.php')) {
        const body =
          'GOES 19\n' +
          '1 57166U 23111A   25225.00000000  .00000000  00000-0  00000-0 0  9991\n' +
          '2 57166   0.1000  50.0000 0001000   0.0000  90.0000  1.00270000    05\n' +
          'GOES 18\n' +
          '1 53911U 22037A   25225.00000000  .00000000  00000-0  00000-0 0  9996\n' +
          '2 53911   0.1000 230.0000 0001000   0.0000 270.0000  1.00270000    09\n';
        return new Response(body, { status: 200, headers: { 'content-type': 'text/plain' } }) as any;
      }

      // Fake image GETs with Last-Modified and final URL containing timestamp
      const headers = new Headers({ 'last-modified': 'Tue, 12 Aug 2025 23:10:00 GMT' });
      const r = new Response(new Blob([]), { status: 200, headers }) as any;
      // Simulate final URL (redirected) carrying timestamp
      Object.defineProperty(r, 'url', { value: 'https://cdn.star.../20250812-2310.jpg' });
      return r;
    });

    // Mock image loader to return a "square" image
    setImageLoader(async (url) => {
      const img = document.createElement('img');
      Object.defineProperty(img, 'naturalWidth', { value: 1080 });
      Object.defineProperty(img, 'naturalHeight', { value: 1080 });
      return img;
    });

    const frames = await fetchLatestGoesFrames();
    expect(frames.length).toBeGreaterThan(0);
    for (const f of frames) {
      expect(f.aspect).toBeCloseTo(1.0, 5);
      expect(f.fovDeg).toBeCloseTo(FULL_DISK_FOV_DEG, 2);
      expect(f.timestamp.toISOString()).toBe('2025-08-12T23:10:00.000Z');
      // ECEF meters exist (we mocked satellite.js elsewhere if needed)
      expect(typeof f.satEcef_m.x).toBe('number');
    }
  });
});
