import * as THREE from 'three';
import { projectorVertexShader, projectorFragmentShader } from './projectorMaterial';
import { InsetImageWidget } from './InsetImageWidget';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

let SCREEN_WIDTH: number;
let SCREEN_HEIGHT: number;
let aspect: number;

let container: HTMLDivElement;
let camera: THREE.PerspectiveCamera;
let controls: OrbitControls;
let renderer: THREE.WebGLRenderer;
let scene: THREE.Scene;
let earth_mesh: THREE.Mesh;
let cameraRig: THREE.Group;
let cameraOrbiter: THREE.PerspectiveCamera;
let cameraOrbiterHelper: THREE.CameraHelper;
let activeCamera: THREE.Camera;
let activeHelper: THREE.CameraHelper;
const frustumSize = 600;

document.addEventListener('DOMContentLoaded', () => {
  SCREEN_WIDTH = window.innerWidth;
  SCREEN_HEIGHT = window.innerHeight;
  aspect = SCREEN_WIDTH / SCREEN_HEIGHT;
  // Add floating image overlay
  new InsetImageWidget('sample-goes.jpg');
  init();
});

function init(): void {
  container = document.getElementById('app') as HTMLDivElement;

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(50, aspect, 10, 5000);
  camera.position.set(0, 0, 2500);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(SCREEN_WIDTH, SCREEN_HEIGHT);
  renderer.setAnimationLoop(animate);
  container.appendChild(renderer.domElement);
  renderer.setScissorTest(true);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.minDistance = 150;
  controls.maxDistance = 3000;
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  // Load image as texture and set up camera aspect
  const loader = new THREE.TextureLoader();
  loader.load('sample-goes.jpg', (texture: THREE.Texture) => {
    // Set camera aspect to match image
    const imgAspect = texture.image.width / texture.image.height;
    cameraOrbiter = new THREE.PerspectiveCamera(50, imgAspect, 150, 1000);
    cameraOrbiterHelper = new THREE.CameraHelper(cameraOrbiter);
    scene.add(cameraOrbiterHelper);

    activeCamera = cameraOrbiter;
    activeHelper = cameraOrbiterHelper;

    cameraRig = new THREE.Group();
    cameraRig.add(cameraOrbiter);
    scene.add(cameraRig);

    // Custom shader material for projection
    const sphereMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tex: { value: texture },
        cameraMatrix: { value: cameraOrbiter.matrixWorld.clone() },
        projectorCameraPosition: { value: cameraOrbiter.position.clone() },
        cameraProjection: { value: cameraOrbiter.projectionMatrix.clone() },
        sphereRadius: { value: 100.0 },
      },
      vertexShader: projectorVertexShader,
      fragmentShader: projectorFragmentShader,
    });

    earth_mesh = new THREE.Mesh(
      new THREE.SphereGeometry(100, 32, 32),
      sphereMaterial
    );
    earth_mesh.position.set(0, 0, 0); // Sphere at origin
    scene.add(earth_mesh);

  // Store reference for per-frame uniform update
  (earth_mesh as any).projectorMaterial = sphereMaterial;
  (earth_mesh as any).projectorCamera = cameraOrbiter;
  });

  const geometry = new THREE.BufferGeometry();
  const vertices: number[] = [];
  const radius = 2000;
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