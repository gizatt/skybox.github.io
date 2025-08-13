import { beforeEach, afterEach, vi, it, expect } from 'vitest';
import { clear } from 'idb-keyval';
import {
  setFetchImpl,
  setImageLoader,
  fetchLatestGoesFrames,
} from './goes';

// Build a single fake fetch that handles *every* URL your code might request
function makeFakeFetch() {
  return vi.fn(async (input: any, init?: RequestInit) => {
    const url = String(input);

    // 1) TLE (text) requests
    if (url.includes('celestrak.org/NORAD/elements/gp.php')) {
      const body =
        'GOES 19\n' +
        '1 57166U 23111A   25225.00000000  .00000000  00000-0  00000-0 0  9991\n' +
        '2 57166   0.1000  50.0000 0001000   0.0000  90.0000  1.00270000    05\n';
      return new Response(body, {
        status: 200,
        headers: {
          etag: 'W/"abc"',
          'last-modified': 'Tue, 12 Aug 2025 23:10:00 GMT',
        },
      }) as any;
    }

    // 2) Image discovery GET (we don’t actually download pixels; we just need headers + final URL)
    if (url.includes('cdn.star.nesdis.noaa.gov')) {
      const r = new Response(new Blob([]), {
        status: 200,
        headers: { 'last-modified': 'Tue, 12 Aug 2025 23:10:00 GMT' },
      }) as any;
      // Simulate redirect to timestamped asset
      Object.defineProperty(r, 'url', {
        value: 'https://cdn.star.nesdis.noaa.gov/.../20250812-2310.jpg',
      });
      return r;
    }

    throw new Error(`Unhandled fake fetch URL: ${url}`);
  });
}

function makeFakeImageLoader() {
  return async (url: string) => {
    // Create a fake <img> that looks loaded and square-ish
    const img = document.createElement('img');
    Object.defineProperty(img, 'naturalWidth', { value: 1080 });
    Object.defineProperty(img, 'naturalHeight', { value: 1080 });
    (img as any).src = url;
    // If your code waits for onload, trigger it asynchronously:
    queueMicrotask(() => img.onload?.(new Event('load') as any));
    return img;
  };
}

beforeEach(async () => {
  await clear(); // wipe IndexedDB
  setFetchImpl(makeFakeFetch());
  setImageLoader(makeFakeImageLoader());
});

afterEach(() => {
  vi.clearAllMocks();
});

it('fetchLatestGoesFrames runs fully with injected fetch/loader (no network)', async () => {
  const frames = await fetchLatestGoesFrames();
  expect(frames.length).toBeGreaterThan(0);
  for (const f of frames) {
    expect(f.aspect).toBeCloseTo(1, 5);
    expect(f.timestamp.toISOString()).toBe('2025-08-12T23:10:00.000Z');
    expect(typeof f.satEcef_m.x).toBe('number');
  }
});
