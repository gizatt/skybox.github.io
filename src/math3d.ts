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

export function lookAtMatrix(eye: THREE.Vector3, target: THREE.Vector3, up: THREE.Vector3) {
  const m = new THREE.Matrix4()
  m.lookAt(eye, target, up)
  // three.js Matrix4.lookAt returns a view matrix inverse (camera world). We need view matrix.
  // For projective texturing we want: projectorVP = P * V where V is cameraMatrixWorldInverse.
  // m here is cameraMatrixWorldInverse already.
  return m
}

// Extend Matrix4 to build perspective easily
declare module 'three/src/math/Matrix4' {
  interface Matrix4 { makePerspective(fov: number, aspect: number, near: number, far: number): THREE.Matrix4 }
}

;(THREE.Matrix4.prototype as any).makePerspective = function(fovRad: number, aspect: number, near: number, far: number) {
  const f = 1.0 / Math.tan(fovRad / 2)
  const nf = 1 / (near - far)
  const e = this.elements
  e[0] = f / aspect; e[4] = 0; e[8]  = 0;                e[12] = 0
  e[1] = 0;          e[5] = f; e[9]  = 0;                e[13] = 0
  e[2] = 0;          e[6] = 0; e[10] = (far + near)*nf;  e[14] = (2*far*near)*nf
  e[3] = 0;          e[7] = 0; e[11] = -1;               e[15] = 0
  return this
}
