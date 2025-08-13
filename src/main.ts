import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { makeEarthMaterial, updateProjector } from './projectorMaterial'
import { deg2rad, geodeticToECEF, lookAtMatrix } from './math3d'

// Scene basics
const app = document.getElementById('app')!
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(window.innerWidth, window.innerHeight)
app.appendChild(renderer.domElement)

// Earth parameters (kkm). We'll treat units as kilometers in ECEF.
const EARTH_RADIUS = 6.371

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x05070f)

const camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 1, EARTH_RADIUS*10)
camera.position.set(0, 0, EARTH_RADIUS * 10);
camera.updateProjectionMatrix();

const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.target.set(0, 0, 0)
controls.minDistance = EARTH_RADIUS * 1.2; // stop inside atmosphere
controls.maxDistance = EARTH_RADIUS * 40;  // don’t drift too far

// Lights (subtle)
const light = new THREE.DirectionalLight(0xffffff, 0.8)
light.position.set(1, 1, 1)
scene.add(light, new THREE.AmbientLight(0xffffff, 0.2))

scene.add(new THREE.AxesHelper(1.000)); // 1,000 km axes

// Earth mesh (slightly smaller than radius if you want an atmosphere shell later)
const earthGeo = new THREE.SphereGeometry(EARTH_RADIUS, 128, 128)
const earthMat = makeEarthMaterial()
const earth = new THREE.Mesh(earthGeo, earthMat)
earth.material.side = THREE.BackSide;
// earth.material.wireframe = true;
scene.add(earth)

// A simple marker for a GEO sat (GOES-like). We'll place it later.
const satMarker = new THREE.Mesh(new THREE.SphereGeometry(0.120, 16, 16), new THREE.MeshBasicMaterial({ color: 0xffd27f }))
scene.add(satMarker)

// Projector state
const projectorTex = new THREE.Texture()
projectorTex.minFilter = THREE.LinearMipMapLinearFilter
projectorTex.magFilter = THREE.LinearFilter
projectorTex.wrapS = THREE.ClampToEdgeWrapping
projectorTex.wrapT = THREE.ClampToEdgeWrapping
projectorTex.needsUpdate = false

// Bind uniforms once
;(earthMat as any).uniforms.uProjectorTex.value = projectorTex

// Default: no projection until an image is loaded
;(earthMat as any).uniforms.uHasProjector.value = 0

// --- Sample: position a GOES-like GEO satellite over ~75.2°W at the equator
// GEO altitude ~ 35,786 km above Earth's surface
const goesLon = 180
const goesLat = 0
const GEO_ALTITUDE = 35.786

const satECEF = geodeticToECEF(goesLat, goesLon, EARTH_RADIUS + GEO_ALTITUDE)
satMarker.position.set(satECEF.x, satECEF.y, satECEF.z)

// Projector camera properties – approximate FOV for full-disk ABI
// https://www.eoportal.org/satellite-missions/goes-r?utm_source=chatgpt.com
const fovDeg = 45
const aspect = 1.0
const near = 1
const far = 1000
// Build a real Three camera to steal its view matrix
const projCam = new THREE.PerspectiveCamera(
  fovDeg, aspect, near, far,
);
// Place the projector at the satellite, looking at Earth center with +Z up
const satPos = new THREE.Vector3();
console.log('Satellite ECEF position:', satPos);
projCam.position.set(satECEF.x, satECEF.y, satECEF.z);
projCam.lookAt(new THREE.Vector3(0, 0, 0));
projCam.up.set(new THREE.Vector3(0, 0, 1));
projCam.updateProjectionMatrix();
projCam.updateMatrixWorld(true);

// Now take the actual matrices Three computed
const view = projCam.matrixWorldInverse.clone(); // guaranteed view matrix
const proj = projCam.projectionMatrix.clone();
console.log('Projector view matrix:', view.elements);
console.log('Projector projection matrix:', proj.elements);

;(earthMat as any).uniforms.uSatPos.value = satPos.clone();
updateProjector(earthMat, view.invert(), proj);


// Draw the projector camera frustum
const frustumHelper = new THREE.CameraHelper(projCam);
frustumHelper.update()
scene.add(frustumHelper);

// Animation loop
function tick() {
  controls.update()
  renderer.render(scene, camera)
  requestAnimationFrame(tick)
}
requestAnimationFrame(tick)

// --- UI: load a sample image (bundled in /public) or use a local file ---

async function loadImageToProjector(src: string | File) {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  const url = typeof src === 'string' ? src : URL.createObjectURL(src)
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = (e) => reject(e)
    img.src = url
  })
  projectorTex.image = img
  projectorTex.needsUpdate = true
  ;(earthMat as any).uniforms.uHasProjector.value = 1
  if (src instanceof File) URL.revokeObjectURL(url)
}

(document.getElementById('loadSample') as HTMLButtonElement).onclick = () => {
  // You can replace this with a live URL if it supports CORS, or keep a local file at /public/sample-goes.jpg
  loadImageToProjector('/sample-goes.jpg').catch(console.error)
}

(document.getElementById('customImage') as HTMLInputElement).onchange = (e) => {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) loadImageToProjector(file).catch(console.error)
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})
