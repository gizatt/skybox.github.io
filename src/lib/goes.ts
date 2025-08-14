import * as satellite from "satellite.js";
import { fetchTextCached } from "./tleCache";

// DI points (defaults to browser fetch/Image loader)
export type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export type ImageLoader = (url: string) => Promise<HTMLImageElement>;

let _fetchImpl: FetchFn = (input, init) => fetch(input, init);
let _loadImageImpl: ImageLoader = (url) => new Promise((resolve, reject) => {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => resolve(img);
  img.onerror = (e) => reject(e);
  img.src = url;
});

// Allow tests to override fetch & image loader
export function setFetchImpl(fn: FetchFn) { _fetchImpl = fn; }
export function setImageLoader(fn: ImageLoader) { _loadImageImpl = fn; }

// ---------------- Types / API ----------------
export type Vec3 = { x: number; y: number; z: number };
export type SatId = "G18" | "G19";
export interface SatFrame {
  sat: SatId;
  band: "GEOCOLOR";
  imageUrl: string;
  image: HTMLImageElement;
  width: number;
  height: number;
  aspect: number;
  timestamp: Date;
  satEcef_m: Vec3;
  fovDeg: number;
}

// Exported constants for tests
export const FULL_DISK_FOV_DEG = 17.33 as const; // hand fine-tuned
export const GOES_CDN_BASE = "https://cdn.star.nesdis.noaa.gov";
export const IMAGE_CANDIDATES: Record<SatId, string[]> = {
  G19: [
    `${GOES_CDN_BASE}/GOES19/ABI/FD/GEOCOLOR/1808x1808.jpg`,
    `${GOES_CDN_BASE}/GOES19/ABI/FD/GEOCOLOR/1080x1080.jpg`,
    `${GOES_CDN_BASE}/GOES19/ABI/FD/GEOCOLOR/latest.jpg`,
  ],
  G18: [
    `${GOES_CDN_BASE}/GOES18/ABI/FD/GEOCOLOR/1808x1808.jpg`,
    `${GOES_CDN_BASE}/GOES18/ABI/FD/GEOCOLOR/1080x1080.jpg`,
    `${GOES_CDN_BASE}/GOES18/ABI/FD/GEOCOLOR/latest.jpg`,
  ],
};
const CELESTRAK_GOES_TLE_URL =
  "https://celestrak.org/NORAD/elements/gp.php?GROUP=goes&FORMAT=tle";

// Public API
export async function fetchLatestGoesFrames(): Promise<SatFrame[]> {
  const [g19, g18] = await Promise.all([
    resolveLatestImage("G19"),
    resolveLatestImage("G18"),
  ]);

  const tleBySat = await fetchGoesTLEsBySatId();

  const out: SatFrame[] = [];
  if (g19 && tleBySat.G19) {
    out.push(buildFrame("G19", {
      ...g19,
      timestamp: g19.timestamp instanceof Date && !isNaN(g19.timestamp.getTime()) ? g19.timestamp : new Date(),
    }, tleBySat.G19));
  }
  if (g18 && tleBySat.G18) {
    out.push(buildFrame("G18", {
      ...g18,
      timestamp: g18.timestamp instanceof Date && !isNaN(g18.timestamp.getTime()) ? g18.timestamp : new Date(),
    }, tleBySat.G18));
  }
  return out;
}

function buildFrame(
  sat: SatId,
  img: { url: string; image: HTMLImageElement; timestamp: Date },
  tle: { line1: string; line2: string }
): SatFrame {
  console.log("Building frame for", sat, "at", img.timestamp.toISOString(), {
    tle,
    tleTimestamp: tle.line1.slice(18, 32) // TLE epoch (YYDDD.DDDDDDDD)
  });
  const ecef = propagateToEcefMeters(tle, img.timestamp);
  // Compute expected FOV based on satellite altitude and earth radius
  const earthRadius_km = 6371;
  const satDist_km = Math.sqrt(ecef.x * ecef.x + ecef.y * ecef.y + ecef.z * ecef.z) / 1000;
  // FOV = 2 * arcsin(R_earth / (R_earth + h)), but for a perfect fit, it's 2*arcsin(R_earth / satDist)
  const expectedFovRad = 2 * Math.asin(earthRadius_km / satDist_km);
  const expectedFovDeg = expectedFovRad * 180 / Math.PI;
  console.log(`[${sat}] Expected full-disk FOV (earth fits image): ${expectedFovDeg.toFixed(4)} deg | Hardcoded: ${FULL_DISK_FOV_DEG} deg | (User slider may further adjust)`);
  const w = img.image.naturalWidth || img.image.width;
  const h = img.image.naturalHeight || img.image.height;
  return {
    sat,
    band: "GEOCOLOR",
    imageUrl: img.url,
    image: img.image,
    width: w,
    height: h,
    aspect: w / h,
    timestamp: img.timestamp,
    satEcef_m: ecef,
    fovDeg: FULL_DISK_FOV_DEG,
  };
}

// ---------------- Impl (with DI) ----------------

// --- Generalized Satellite Image Provider Interface ---
export interface RecentSatImageProvider {
  getRecentImage(fetchImpl: FetchFn, loadImageImpl: ImageLoader): Promise<{ url: string; image: HTMLImageElement; timestamp: Date | null } | null>;
}

// --- GOES-N (GOES-18, GOES-19, etc) implementation ---
export function makeGoesNImageProvider(satId: string): RecentSatImageProvider {
  // e.g. satId = "GOES18" or "GOES19"
  const dirUrl = `${GOES_CDN_BASE}/${satId}/ABI/FD/GEOCOLOR/`;
  // Only match 1808x1808 images
  const regex = new RegExp(`(\\d{11,})_${satId}-ABI-FD-GEOCOLOR-1808x1808\\.jpg`, 'g');
  return {
    async getRecentImage(fetchImpl, loadImageImpl) {
      const res = await fetchImpl(dirUrl, { method: "GET", mode: "cors" as RequestMode });
      if (res.ok) {
        const html = await res.text();
        const matches = Array.from(html.matchAll(regex));
        if (matches.length > 0) {
          matches.sort((a, b) => b[1].localeCompare(a[1]));
          const latest = matches[0];
          const filename = latest[0];
          const url = dirUrl + filename;
          const ts = parseGoesNFilenameTimestamp(latest[1]);
          const img = await loadImageImpl(url);
          return { url, image: img, timestamp: ts };
        }
      }
      return null;
    }
  };
}

function parseGoesNFilenameTimestamp(stamp: string): Date | null {
  // stamp: yyyydddhhmm (year, day-of-year, hour, minute)
  if (!/^\d{11}$/.test(stamp)) return null;
  const year = +stamp.slice(0, 4);
  const doy = +stamp.slice(4, 7);
  const hh = +stamp.slice(7, 9);
  const mm = +stamp.slice(9, 11);
  const { y, m, d } = dateFromDayOfYearUTC(year, doy);
  return new Date(Date.UTC(y, m - 1, d, hh, mm, 0));
}

// --- Main resolver using providers ---
const SAT_IMAGE_PROVIDERS: Record<SatId, RecentSatImageProvider> = {
  G18: makeGoesNImageProvider("GOES18"),
  G19: makeGoesNImageProvider("GOES19"),
};

async function resolveLatestImage(sat: SatId) {
  const provider = SAT_IMAGE_PROVIDERS[sat];
  if (!provider) return null;
  return provider.getRecentImage(_fetchImpl, _loadImageImpl);
}

let USE_REAL_TLE = false;
// Expose for main.ts
export function enableRealTleFetch() { USE_REAL_TLE = true; }

async function fetchGoesTLEsBySatId() {
  if (!USE_REAL_TLE) {
    // Reasonable stub TLEs for GOES-18 and GOES-19 (as of 2024)
    return {
      G18: {
      line1: "1 51850U 22021A   25225.49697635  .00000098  00000+0  00000+0 0  9996",
      line2: "2 51850   0.0070 282.4274 0000607 300.8675 140.7832  1.00271626  3507"
      },
      G19: {
      line1: "1 60133U 24119A   25225.52405752 -.00000247  00000+0  00000+0 0  9998",
      line2: "2 60133   0.0150  90.0040 0000708 157.4073 188.2598  1.00269356  3877"
      }
    };
  }
  // cached + conditional GET via injected fetch
   // Conditional requests like the ones we send can't be validated, so just self-limit to once per 6 hours.
  const txt = await fetchTextCached(CELESTRAK_GOES_TLE_URL, _fetchImpl, {
    ttlMs: 6 * 60 * 60 * 1000,  // 6 hours
    revalidate: false,
  });

  const lines = txt.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const out: Record<SatId, { line1: string; line2: string } | null> = { G18: null, G19: null };
  for (let i = 0; i < lines.length - 2; i += 3) {
    const name = lines[i];
    const satId = nameToSatId(name);
    if (!satId || out[satId]) continue;
    out[satId] = { line1: lines[i+1], line2: lines[i+2] };
  }
  console.log("Fetched Real TLEs:", out);
  return out;
}

function nameToSatId(name: string): SatId | null {
  const n = name.toUpperCase();
  if (/\bGOES[-\s]?19\b/.test(n) || /\bGOES U\b/.test(n)) return "G19";
  if (/\bGOES[-\s]?18\b/.test(n) || /\bGOES T\b/.test(n)) return "G18";
  return null;
}

// ---------------- Pure helpers (export for tests) ---------------
export function parseTimestampFromUrl(url: string): Date | null {
  let m = url.match(/(\d{8})[-_]?(\d{4})(\d{2})?\.(?:jpg|png|jpeg)(\?.*)?$/i)
       || url.match(/(\d{8})[-_]?(\d{4})(\d{2})?[^\/]*\.(?:jpg|png|jpeg)/i);
  if (m) {
    const y = +m[1].slice(0,4), mo = +m[1].slice(4,6), d = +m[1].slice(6,8);
    const hh = +m[2].slice(0,2), mm = +m[2].slice(2,4), ss = m[3] ? +m[3] : 0;
    return new Date(Date.UTC(y, mo-1, d, hh, mm, ss));
  }
  m = url.match(/(\d{4})(\d{2})(\d{2})[_-]?(\d{2})(\d{2})(\d{2})?[^\/]*\.(?:jpg|png|jpeg)/i);
  if (m) {
    const y = +m[1], mo = +m[2], d = +m[3], hh=+m[4], mm=+m[5], ss = m[6] ? +m[6] : 0;
    return new Date(Date.UTC(y, mo-1, d, hh, mm, ss));
  }
  m = url.match(/\/(\d{4})\/(\d{3})\/.*?[-_](\d{2})(\d{2})(\d{2})?\.(?:jpg|png|jpeg)/i);
  if (m) {
    const y = +m[1], doy = +m[2], hh=+m[3], mm=+m[4], ss = m[5] ? +m[5] : 0;
    const { y:yy, m:mmm, d } = dateFromDayOfYearUTC(y, doy);
    return new Date(Date.UTC(yy, mmm-1, d, hh, mm, ss));
  }
  return null;
}

export function parseHttpDate(v: string | null): Date | null {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t) : null;
}

export function dateFromDayOfYearUTC(year: number, doy: number) {
  const jan1 = Date.UTC(year, 0, 1);
  const dt = new Date(jan1 + (doy-1)*24*3600*1000);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth()+1, d: dt.getUTCDate() };
}

export function propagateToEcefMeters(tle: { line1: string; line2: string }, at: Date): Vec3 {
  const satrec = satellite.twoline2satrec(tle.line1, tle.line2);
  const { position } = satellite.propagate(satrec, at);
  if (!position || typeof position !== 'object' || typeof position.x !== 'number') throw new Error("SGP4 returned no position");
  const gmst = satellite.gstime(at);
  const ecf_km = satellite.eciToEcf(position, gmst);
  return { x: ecf_km.x * 1000, y: ecf_km.y * 1000, z: ecf_km.z * 1000 };
}
