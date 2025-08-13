import * as THREE from 'three'

// Shared GLSL chunks
const common = /* glsl */`
  uniform sampler2D uProjectorTex;
  uniform mat4 uProjectorVP;     // P * V of the projector (satellite instrument)
  uniform int uHasProjector;     // 0/1
  uniform vec3 uSatPos;
`;

// Earth shader: base lit color + projected image
const earthVS = /* glsl */`
  varying vec3 vWorldPos;
  void main(){
    vec4 world = modelMatrix * vec4(position,1.0);
    vWorldPos = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const earthFS = /* glsl */`
  varying vec3 vWorldPos;
  ${common}

  vec3 baseAlbedo(vec3 n) {
    // Simple bluish Earth base; you can replace with an equirect texture later.
    float t = n.z*0.5+0.5;
    return mix(vec3(0.02,0.08,0.22), vec3(0.05,0.25,0.55), t);
  }

  void main(){
    vec3 N = normalize(vWorldPos); // using sphere centered at origin
    vec3 base = baseAlbedo(N);

    vec3 color = base;

    vec3 toSat = normalize(uSatPos - vWorldPos);
    vec3 normal = normalize(vWorldPos);           // sphere @ origin → outward normal
    bool facesSat = dot(normal, toSat) > 0.0;     // front hemisphere w.r.t. satellite

      if (uHasProjector == 1 && facesSat) {
        vec4 clip = uProjectorVP * vec4(vWorldPos, 1.0);
        vec3 ndc = clip.xyz / clip.w; // normalized device coordinates
        vec2 uv = ndc.xy * 0.5 + 0.5;
        bool inProj = (clip.w > 0.0)
          && all(greaterThanEqual(uv, vec2(0.0)))
          && all(lessThanEqual(uv, vec2(1.0)))
          && ndc.z >= -1.0 && ndc.z <= 1.0; // ensure within near/far
        if (inProj) {
          vec3 proj = texture2D(uProjectorTex, uv).rgb;
          // Simple bright-over blend
          color = mix(color, proj, 0.85);
        }
      }

    gl_FragColor = vec4(color, 1.0);
  }
`;



export function makeEarthMaterial(){
  const uniforms = {
    uProjectorTex: { value: new THREE.Texture() },
    uProjectorVP:  { value: new THREE.Matrix4() },
    uHasProjector: { value: 0 },
    uSatPos: { value: new THREE.Vector3() }
  }
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: earthVS,
    fragmentShader: earthFS,
    lights: false
  })
}


export function updateProjector(earthMat: THREE.ShaderMaterial, view: THREE.Matrix4, proj: THREE.Matrix4){
  const vp = new THREE.Matrix4().multiplyMatrices(proj, view)
  ;(earthMat.uniforms as any).uProjectorVP.value.copy(vp)
}