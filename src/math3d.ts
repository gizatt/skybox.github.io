import * as THREE from 'three'

export function deg2rad(d: number) { return d * Math.PI / 180 }
export function rad2deg(r: number) { return r * 180 / Math.PI }

// Very light geodetic to ECEF assuming spherical Earth (MVP). Good enough for GEO placement.
export function geodeticToECEF(latDeg: number, lonDeg: number, radius: number) {
  const lat = deg2rad(latDeg)
  const lon = deg2rad(lonDeg)
  const clat = Math.cos(lat), slat = Math.sin(lat)
  const clon = Math.cos(lon), slon = Math.sin(lon)
  return {
    x: radius * clat * clon,
    y: radius * clat * slon,
    z: radius * slat
  }
}
