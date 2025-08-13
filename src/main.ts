import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { fetchLatestGoesFrames, SatFrame } from './lib/goes';
import { InsetImageWidget } from './InsetImageWidget';
import { projectorVertexShader, projectorFragmentShader } from './projectorMaterial';

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
let satelliteImageWidgets: InsetImageWidget[] = [];
let frustumAlpha = 0.5;
let cameraRig: THREE.Group;
let cameraOrbiter: THREE.PerspectiveCamera;
let cameraOrbiterHelper: THREE.CameraHelper;
let activeCamera: THREE.Camera;
let activeHelper: THREE.CameraHelper;

import { enableRealTleFetch } from './lib/goes';
document.addEventListener('DOMContentLoaded', () => {
  SCREEN_WIDTH = window.innerWidth;
  SCREEN_HEIGHT = window.innerHeight;
  aspect = SCREEN_WIDTH / SCREEN_HEIGHT;

  // Setup Three.js scene, camera, renderer, controls
  container = document.getElementById('app') as HTMLDivElement;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(50, aspect, 1000, 1000000);
  camera.position.set(0, -100000, 75000);
  camera.lookAt(0, 0, 0);
  camera.up.set(0, 0, 1);
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(SCREEN_WIDTH, SCREEN_HEIGHT);
  renderer.setAnimationLoop(animate);
  container.appendChild(renderer.domElement);
  renderer.setScissorTest(true);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.minDistance = 5000;
  controls.maxDistance = 200000;
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  // Earth mesh and material
  const uniforms: any = {
    numProjectors: { value: 0 },
    tex0: { value: new THREE.Texture() },
    tex1: { value: new THREE.Texture() },
    tex2: { value: new THREE.Texture() },
    tex3: { value: new THREE.Texture() },
    cameraMatrix: { value: [new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Matrix4()] },
    projectorCameraPosition: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
    cameraProjection: { value: [new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Matrix4()] },
    sphereRadius: { value: 6371.0 },
  };
  const projectorMaterial = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: projectorVertexShader,
    fragmentShader: projectorFragmentShader,
    side: THREE.FrontSide,
    transparent: false,
    wireframe: false,
  });
  earth_mesh = new THREE.Mesh(
    new THREE.SphereGeometry(6371, 64, 64),
    projectorMaterial
  );
  earth_mesh.position.set(0, 0, 0);
  scene.add(earth_mesh);
  (earth_mesh as any).projectorMaterial = projectorMaterial;

  // Add distant stars
  const geometry = new THREE.BufferGeometry();
  const vertices: number[] = [];
  const radius = 200000;
  for (let i = 0; i < 10000; i++) {
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

  loadSatellites();

  // Helper to remove all satellite objects from scene
function clearSatellitesFromScene() {
  satellites.forEach(sat => {
    if (sat.helper) scene.remove(sat.helper);
    if (sat.camera) scene.remove(sat.camera);
    // Remove marker if you want (not tracked in SatelliteProjector)
  });
  satelliteImageWidgets.forEach(w => w.destroy());
  satelliteImageWidgets = [];
  satellites = [];
}

// Main function to (re)load satellites
async function loadSatellites() {
  clearSatellitesFromScene();
  const frames = await fetchLatestGoesFrames();
  frames.forEach((f, i) => {
    const satEcef_km = {
      x: f.satEcef_m.x / 1000,
      y: f.satEcef_m.y / 1000,
      z: f.satEcef_m.z / 1000,
    };
    const cam = new THREE.PerspectiveCamera(f.fovDeg, f.aspect, 35000, 50000);
    cam.up.set(0, 0, 1);
    cam.position.set(satEcef_km.x, satEcef_km.y, satEcef_km.z);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld();
    const color = hashStringToColor(f.sat);
    const helper = new THREE.CameraHelper(cam);
    if (helper.material) {
      if (Array.isArray(helper.material)) {
        helper.material.forEach((mat: any) => {
          mat.opacity = frustumAlpha;
          mat.transparent = frustumAlpha < 1.0;
          if (mat.color && typeof mat.color.set === 'function') mat.color.set(color.hex);
        });
      } else {
        const mat = helper.material as any;
        mat.opacity = frustumAlpha;
        mat.transparent = frustumAlpha < 1.0;
        if (mat.color && typeof mat.color.set === 'function') mat.color.set(color.hex);
      }
    }
    scene.add(helper);
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(100, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffaa00 })
    );
    marker.position.set(satEcef_km.x, satEcef_km.y, satEcef_km.z);
    scene.add(marker);
    const tex = new THREE.Texture(f.image);
    tex.needsUpdate = true;
    satellites.push({
      sat: f.sat,
      camera: cam,
      helper,
      texture: tex,
      frame: f,
    });
    const widget = new InsetImageWidget(f.image.src, document.body, f.sat);
    widget['container'].style.width = '128px';
    widget['container'].style.right = '20px';
    widget['container'].style.left = '';
    widget['container'].style.top = (20 + i * 148) + 'px';
    widget['container'].style.zIndex = (2000 + i).toString();
    satelliteImageWidgets.push(widget);
  });
}

function hashStringToColor(str: string): {r:number,g:number,b:number,hex:number} {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i)*1234;
  }
  const hue = Math.abs(hash) % 360;
  const {r, g, b} = hslToRgb(hue / 360., 0.5, 0.8);
  const hex = ((Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255));
  return { r, g, b, hex };
}

function hslToRgb(h: number, s: number, l: number) {
  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return { r, g, b };
}

  // Frustum alpha slider logic
  const slider = document.getElementById('frustumAlphaSlider') as HTMLInputElement;
  const valueSpan = document.getElementById('frustumAlphaValue') as HTMLSpanElement;
  if (slider && valueSpan) {
    slider.value = frustumAlpha.toString();
    valueSpan.textContent = frustumAlpha.toFixed(2);
    slider.addEventListener('input', () => {
      frustumAlpha = parseFloat(slider.value);
      valueSpan.textContent = frustumAlpha.toFixed(2);
      // Update all helpers' material opacity
      satellites.forEach(sat => {
        if (sat.helper && sat.helper.material) {
          if (Array.isArray(sat.helper.material)) {
            sat.helper.material.forEach((mat: any) => {
              mat.opacity = frustumAlpha;
              mat.transparent = frustumAlpha < 1.0;
            });
          } else {
            (sat.helper.material as THREE.Material).opacity = frustumAlpha;
            (sat.helper.material as THREE.Material).transparent = frustumAlpha < 1.0;
          }
        }
      });
    });
  }

  // Real TLE button logic
  const tleBtn = document.getElementById('loadTleBtn');
  if (tleBtn) {
    tleBtn.addEventListener('click', () => {
      enableRealTleFetch();
      loadSatellites();
    });
  }
});

function onWindowResize(): void {
  SCREEN_WIDTH = window.innerWidth;
  SCREEN_HEIGHT = window.innerHeight;
  aspect = SCREEN_WIDTH / SCREEN_HEIGHT;

  renderer.setSize(SCREEN_WIDTH, SCREEN_HEIGHT);

  if (camera) {
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
  }
  if (cameraOrbiter) {
    cameraOrbiter.aspect = aspect;
    cameraOrbiter.updateProjectionMatrix();
  }
}

function animate(): void {
  // Update projector uniforms for all satellites
  if (earth_mesh && (earth_mesh as any).projectorMaterial) {
    const mat = (earth_mesh as any).projectorMaterial as THREE.ShaderMaterial;
    const n = Math.min(satellites.length, 4);
    mat.uniforms.numProjectors.value = n;
    if (n > 0) mat.uniforms.tex0.value = satellites[0].texture;
    if (n > 1) mat.uniforms.tex1.value = satellites[1].texture;
    if (n > 2) mat.uniforms.tex2.value = satellites[2].texture;
    if (n > 3) mat.uniforms.tex3.value = satellites[3].texture;
    for (let i = 0; i < n; ++i) {
      mat.uniforms.cameraMatrix.value[i].copy(satellites[i].camera.matrixWorld);
      mat.uniforms.projectorCameraPosition.value[i].copy(satellites[i].camera.position);
      mat.uniforms.cameraProjection.value[i].copy(satellites[i].camera.projectionMatrix);
    }
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