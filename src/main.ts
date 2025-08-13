import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { fetchLatestGoesFrames, SatFrame } from './goes';

let SCREEN_WIDTH: number;
let SCREEN_HEIGHT: number;
let aspect: number;

let container: HTMLDivElement;
let camera: THREE.PerspectiveCamera;
let controls: OrbitControls;
let renderer: THREE.WebGLRenderer;
let scene: THREE.Scene;
let earth_mesh: THREE.Mesh;
type SatelliteProjector = {
  sat: string;
  camera: THREE.PerspectiveCamera;
  helper: THREE.CameraHelper;
  texture: THREE.Texture;
  frame: SatFrame;
};
let satellites: SatelliteProjector[] = [];
let cameraRig: THREE.Group;
let cameraOrbiter: THREE.PerspectiveCamera;
let cameraOrbiterHelper: THREE.CameraHelper;
let activeCamera: THREE.Camera;
let activeHelper: THREE.CameraHelper;

document.addEventListener('DOMContentLoaded', () => {
  SCREEN_WIDTH = window.innerWidth;
  SCREEN_HEIGHT = window.innerHeight;
  aspect = SCREEN_WIDTH / SCREEN_HEIGHT;
  init();
});

function init(): void {
  container = document.getElementById('app') as HTMLDivElement;

  scene = new THREE.Scene();

  // Camera: set up for km scale (Earth radius ~6371 km)
  camera = new THREE.PerspectiveCamera(50, aspect, 1000, 1000000);
  camera.position.set(0, 0, 100000); // 20,000 km away
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(SCREEN_WIDTH, SCREEN_HEIGHT);
  renderer.setAnimationLoop(animate);
  container.appendChild(renderer.domElement);
  renderer.setScissorTest(true);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.minDistance = 5000; // 1,000 km
  controls.maxDistance = 200000; // 50,000 km
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  // Earth: radius = 6371 km
  earth_mesh = new THREE.Mesh(
    new THREE.SphereGeometry(6371, 64, 64),
    new THREE.MeshBasicMaterial({ color: 0x223366, wireframe: true })
  );
  earth_mesh.position.set(0, 0, 0);
  scene.add(earth_mesh);

  // Fetch satellite frames and add markers/cameras/helpers
  fetchLatestGoesFrames().then((frames: SatFrame[]) => {
    console.log('Satellite frames:');
    frames.forEach(f => {
      // Convert ECEF from meters to kilometers
      const satEcef_km = {
        x: f.satEcef_m.x / 1000,
        y: f.satEcef_m.y / 1000,
        z: f.satEcef_m.z / 1000,
      };
      console.log(`Satellite: ${f.sat}, ECEF (km): (${satEcef_km.x.toFixed(1)}, ${satEcef_km.y.toFixed(1)}, ${satEcef_km.z.toFixed(1)})`);

      // Create a PerspectiveCamera at the satellite's ECEF position (in km)
      const cam = new THREE.PerspectiveCamera(f.fovDeg, f.aspect, 100, 50000);
      cam.position.set(satEcef_km.x, satEcef_km.y, satEcef_km.z);
      cam.lookAt(0, 0, 0);
      cam.updateMatrixWorld();

      // Add a CameraHelper
      const helper = new THREE.CameraHelper(cam);
      scene.add(helper);

      // Add a visible marker (small sphere) for the satellite
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(100, 16, 16), // 100 km radius marker
        new THREE.MeshBasicMaterial({ color: 0xffaa00 })
      );
      marker.position.set(satEcef_km.x, satEcef_km.y, satEcef_km.z);
      scene.add(marker);

      // Create a texture from the already-loaded HTMLImageElement
      const tex = new THREE.Texture(f.image);
      tex.needsUpdate = true;

      satellites.push({
        sat: f.sat,
        camera: cam,
        helper,
        texture: tex,
        frame: f,
      });
    });
  });

  // Add some distant stars for context (radius 30,000 km)
  const geometry = new THREE.BufferGeometry();
  const vertices: number[] = [];
  const radius = 200000;
  for (let i = 0; i < 10000; i++) {
    // Uniformly distributed points on a sphere
    const u = Math.random();
    const v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    const x = radius * Math.sin(phi) * Math.cos(theta);
    const y = radius * Math.sin(phi) * Math.sin(theta);
    const z = radius * Math.cos(phi);
    vertices.push(x, y, z);
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  const particles = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0x888888 }));
  scene.add(particles);

  window.addEventListener('resize', onWindowResize);
}

function onWindowResize(): void {
  SCREEN_WIDTH = window.innerWidth;
  SCREEN_HEIGHT = window.innerHeight;
  aspect = SCREEN_WIDTH / SCREEN_HEIGHT;

  renderer.setSize(SCREEN_WIDTH, SCREEN_HEIGHT);

  camera.aspect = 0.5 * aspect;
  camera.updateProjectionMatrix();

  cameraOrbiter.aspect = 0.5 * aspect;
  cameraOrbiter.updateProjectionMatrix();
}

function animate(): void {
  // Update projector uniforms if available and cameraOrbiter is defined
  if (
    earth_mesh &&
    (earth_mesh as any).projectorMaterial &&
    (earth_mesh as any).projectorCamera &&
    cameraOrbiter
  ) {
    const mat = (earth_mesh as any).projectorMaterial as THREE.ShaderMaterial;
    const cam = (earth_mesh as any).projectorCamera as THREE.PerspectiveCamera;
  mat.uniforms.cameraMatrix.value.copy(cam.matrixWorld);
  mat.uniforms.projectorCameraPosition.value.copy(cam.position);
  mat.uniforms.cameraProjection.value.copy(cam.projectionMatrix);
  }
  controls.update();
  render();
}

function render(): void {
  const r = Date.now() * 0.0005;

  // Perspective camera (with helper) orbits the origin and looks at it
  if (cameraOrbiter) {
    const orbitRadius = 700;
    cameraOrbiter.position.x = orbitRadius * Math.cos(r);
    cameraOrbiter.position.z = orbitRadius * Math.sin(r);
    cameraOrbiter.position.y = orbitRadius * Math.sin(r);
    cameraOrbiter.lookAt(0, 0, 0);
  }

  // Only render the external view (right side)
  if (activeHelper) activeHelper.visible = true;
  renderer.setClearColor(0x111111, 1);
  renderer.setScissor(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
  renderer.setViewport(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
  renderer.render(scene, camera);
}