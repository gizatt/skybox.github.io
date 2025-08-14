// sunUtil.ts - Simple sun direction helper for Earth ECEF
// Returns a normalized THREE.Vector3 pointing from Earth's center to the sun at the given date
import * as THREE from 'three';
import { geodeticToECEF } from './math3d';

// Approximate: subsolar longitude = -UTC_hour*15 deg, latitude = declination (approx)
export function getApproxSunDirection(date: Date = new Date()): THREE.Vector3 {
  // NOAA Solar Calculator equations: https://gml.noaa.gov/grad/solcalc/solareqns.PDF
  // 1. Day of year
  const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 0));
  const doy = (date.getTime() - start.getTime()) / 86400000;
  // 2. Fractional year (radians)
  const gamma = 2 * Math.PI / 365 * (doy - 1 + ((date.getUTCHours() - 12) / 24));
  // 3. Equation of time (minutes)
  const eqTime = 229.18 * (
    0.000075
    + 0.001868 * Math.cos(gamma)
    - 0.032077 * Math.sin(gamma)
    - 0.014615 * Math.cos(2 * gamma)
    - 0.040849 * Math.sin(2 * gamma)
  );
  // 4. Solar declination (degrees)
  const decl = 180 / Math.PI * (
    0.006918
    - 0.399912 * Math.cos(gamma)
    + 0.070257 * Math.sin(gamma)
    - 0.006758 * Math.cos(2 * gamma)
    + 0.000907 * Math.sin(2 * gamma)
    - 0.002697 * Math.cos(3 * gamma)
    + 0.00148 * Math.sin(3 * gamma)
  );
  // 5. Time offset (minutes)
  const timeOffset = eqTime;
  // 6. True solar time (degrees)
  const utcMinutes = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
  const tst = (utcMinutes + timeOffset) % 1440;
  // 7. Subsolar longitude (degrees)
  let subsolarLon = 180 - (tst / 4);
  if (subsolarLon > 180) subsolarLon -= 360;
  if (subsolarLon < -180) subsolarLon += 360;
  // 8. Subsolar latitude = declination
  const subsolarLat = decl;
  // Use geodeticToECEF with radius 1 for direction
  const { x, y, z } = geodeticToECEF(subsolarLat, subsolarLon, 1);
  // Debug log
  console.log(`[sunUtil] NOAA: subsolar lat=${subsolarLat.toFixed(2)}, lon=${subsolarLon.toFixed(2)}, ECEF=(${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)})`);
  return new THREE.Vector3(x, y, z).normalize();
}
