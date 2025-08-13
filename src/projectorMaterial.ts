// Custom shader for projecting a camera image onto a sphere
export const projectorVertexShader = `
  varying vec3 vWorldPosition;
  void main() {
    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const projectorFragmentShader = `
  precision mediump float;
  uniform sampler2D tex;
  uniform mat4 cameraMatrix;
  uniform vec3 projectorCameraPosition;
  uniform mat4 cameraProjection;
  uniform float sphereRadius;
  varying vec3 vWorldPosition;

  // Lighting
  const vec3 baseColor = vec3(0.1, 0.3, 0.7);
  const vec3 lightDir = normalize(vec3(0.5, 1.0, 0.8));

  void main() {
    vec3 normal = normalize(vWorldPosition);
    vec3 toCamera = normalize(projectorCameraPosition - vWorldPosition);
    float facing = dot(normal, toCamera);

    if (facing > 0.0) {
      // Projected image
      vec3 dir = normalize(vWorldPosition - projectorCameraPosition);
      vec4 camSpace = inverse(cameraMatrix) * vec4(dir, 0.0);
      vec4 ndc = cameraProjection * vec4(camSpace.xyz, 1.0);
      if (ndc.w == 0.0) discard;
      ndc /= ndc.w;
      vec2 uv = ndc.xy * 0.5 + 0.5;
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) discard;
      gl_FragColor = texture2D(tex, uv);
    } else {
      // Blue base color with gentle shading
      float diffuse = 0.5 + 0.5 * max(dot(normal, lightDir), 0.0);
      gl_FragColor = vec4(baseColor * diffuse, 1.0);
    }
  }
`;
