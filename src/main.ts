import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { fetchLatestGoesFrames, SatFrame } from './lib/goes';
import { OBJLoader } from 'three-stdlib';
import { InsetImageWidget } from './InsetImageWidget';
import { projectorVertexShader, projectorFragmentShader } from './projectorMaterial';
import {hashStringToColor} from "./lib/colorUtil"
import { getApproxSunDirection } from './lib/sunUtil';

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
let frustumAlpha = 0.25;
let fovFineAdj = 0.0; // degrees, -1 to +1
let cameraOrbiter: THREE.PerspectiveCamera;
let activeHelper: THREE.CameraHelper;

import { enableRealTleFetch } from './lib/goes';
document.addEventListener('DOMContentLoaded', () => {
  SCREEN_WIDTH = window.innerWidth;
  SCREEN_HEIGHT = window.innerHeight;
  aspect = SCREEN_WIDTH / SCREEN_HEIGHT;

  // Setup Three.js scene, camera, renderer, controls
  container = document.getElementById('app') as HTMLDivElement;
  scene = new THREE.Scene();
  // Add lighting for satellite OBJ models (after scene is created)
  // Set sunlight direction to match sun's current position
  const sunDir = getApproxSunDirection(new Date());
  const sunLight = new THREE.DirectionalLight(0xffffff, 100.0);
  sunLight.position.copy(sunDir.clone().multiplyScalar(200000)); // far from earth, in sun direction
  scene.add(sunLight);
  // Draw a bright yellow ray from Earth's center in the sun direction
  // Sun ray now starts at innerAltitude and ends at outerAltitude
  const innerAltitude = 15000;
  const outerAltitude = 30000;
  const sunRayColor = 0xffff00;
  const sunRayDir = getApproxSunDirection(new Date());
  // ArrowHelper: dir, origin, length, color, headLength, headWidth
  const sunArrowLength = outerAltitude - innerAltitude;
  const sunArrow = new THREE.ArrowHelper(
    sunRayDir,
    sunRayDir.clone().multiplyScalar(innerAltitude),
    sunArrowLength,
    sunRayColor,
    2000, // headLength
    800   // headWidth
  );
  scene.add(sunArrow);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
  scene.add(ambientLight);
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

  // --- Add Earth's axis of rotation (white, thin, long) ---
  const axisLength = 20000;
  const axisGeom = new THREE.CylinderGeometry(40, 40, axisLength, 32);
  const axisMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const axisMesh = new THREE.Mesh(axisGeom, axisMat);
  axisMesh.position.set(0, 0, 0);
  axisMesh.rotation.x = Math.PI / 2; // align with Z axis
  scene.add(axisMesh);

  // --- Add "Earth spins in this direction" arrow circling the north pole ---
  // We'll draw a partial torus (arc) and add an arrowhead at the end
  const spinArrowRadius = 2000; // km, just above the pole
  const spinArrowThickness = 200;
  const spinArrowColor = 0xffffff;
  const spinArcAngle = Math.PI * 1.2; // 216 degrees
  // Arc in X-Y plane, centered at north pole (0,0,axisLength/2)
  const arcCurve = new THREE.ArcCurve(
    0, 0, spinArrowRadius, Math.PI * 0.1, spinArcAngle, false
  );
  const arcPoints = arcCurve.getPoints(60);
  const arc3DPoints = arcPoints.map(pt => new THREE.Vector3(pt.x, pt.y, axisLength/2 - 500));
  const spinArcGeom = new THREE.BufferGeometry().setFromPoints(arc3DPoints);
  const spinArcMat = new THREE.LineBasicMaterial({ color: spinArrowColor, linewidth: 6 });
  const spinArc = new THREE.Line(spinArcGeom, spinArcMat);
  scene.add(spinArc);
  // Arrowhead at end of arc
  const arrowTail = arc3DPoints[arc3DPoints.length - 2];
  const arrowTip = arc3DPoints[arc3DPoints.length - 1];
  const arrowDir = arrowTip.clone().sub(arrowTail).normalize();
  const spinArrowHead = new THREE.ArrowHelper(
    arrowDir,
    arrowTail,
    800, // length
    spinArrowColor,
    600, // headLength
    300  // headWidth
  );
  scene.add(spinArrowHead);

  // --- Add Earth's magnetic axis (light purple, thicker, slightly tilted) ---
  // Magnetic axis is about 11 degrees from rotation axis, toward Greenwich (0°E)
  const magAxisLength = 18000;
  const magAxisGeom = new THREE.CylinderGeometry(40, 40, magAxisLength, 32);
  const magAxisMat = new THREE.MeshBasicMaterial({ color: 0xc02070 });
  const magAxisMesh = new THREE.Mesh(magAxisGeom, magAxisMat);
  magAxisMesh.position.set(0, 0, 0);
  // Tilt by 11° toward +X (Greenwich meridian)
  magAxisMesh.rotation.x = Math.PI / 2;
  magAxisMesh.rotation.z = -THREE.MathUtils.degToRad(11);
  scene.add(magAxisMesh);

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
  const objLoader = new OBJLoader();
  const satObjUrl = 'satellite.obj';
  await Promise.all(frames.map(async (f, i) => {
    const satEcef_km = {
      x: f.satEcef_m.x / 1000,
      y: f.satEcef_m.y / 1000,
      z: f.satEcef_m.z / 1000,
    };
    // Apply FOV fine adjustment
    const fov = f.fovDeg + fovFineAdj;
    const cam = new THREE.PerspectiveCamera(fov, f.aspect, 35000, 50000);
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
    // Load and place satellite OBJ
    objLoader.load(satObjUrl, (object) => {
      // Set all child materials to white with simple shading
      object.traverse(child => {
        if ((child as THREE.Mesh).isMesh) {
          (child as THREE.Mesh).material = new THREE.MeshStandardMaterial({ color: 0x99ccff });
        }
      });
      object.position.set(satEcef_km.x, satEcef_km.y, satEcef_km.z);
      // Orient +Z of model along camera ray (parameterize if needed)
      const dir = new THREE.Vector3().copy(cam.position).normalize();
      object.up.set(0, 1, 0);
      object.lookAt(dir);
      object.scale.set(400, 400, 400); // scale to 200 km in each dimension
      scene.add(object);
      console.log(`Loaded satellite model for ${f.sat} at (${satEcef_km.x}, ${satEcef_km.y}, ${satEcef_km.z})`);
    });
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
  }));
}


  // Frustum alpha slider logic
  const slider = document.getElementById('frustumAlphaSlider') as HTMLInputElement;
  const valueSpan = document.getElementById('frustumAlphaValue') as HTMLSpanElement;
  const fovSlider = document.getElementById('fovFineSlider') as HTMLInputElement;
  const fovValue = document.getElementById('fovFineValue') as HTMLSpanElement;
  if (slider && valueSpan && fovSlider && fovValue) {
    slider.value = frustumAlpha.toString();
    valueSpan.textContent = frustumAlpha.toFixed(2);
  fovSlider.value = fovFineAdj.toString();
  const baseFov = satellites[0]?.frame?.fovDeg ?? 17.33;
  fovValue.textContent = (baseFov + fovFineAdj).toFixed(2) + '°';
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
    fovSlider.addEventListener('input', () => {
      fovFineAdj = parseFloat(fovSlider.value);
      // Use first satellite's base FOV for display (should be same for all)
      const baseFov = satellites[0]?.frame?.fovDeg ?? 17.33;
      fovValue.textContent = (baseFov + fovFineAdj).toFixed(2) + '°';
      // Update FOV of all satellite cameras and their helpers
      satellites.forEach(sat => {
        const newFov = sat.frame.fovDeg + fovFineAdj;
        sat.camera.fov = newFov;
        sat.camera.updateProjectionMatrix();
        if (sat.helper) {
          sat.helper.update();
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