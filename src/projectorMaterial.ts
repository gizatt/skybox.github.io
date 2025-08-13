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
  #define MAX_PROJECTORS 4
  uniform int numProjectors;
  uniform sampler2D tex0;
  uniform sampler2D tex1;
  uniform sampler2D tex2;
  uniform sampler2D tex3;
  uniform mat4 cameraMatrix[MAX_PROJECTORS];
  uniform vec3 projectorCameraPosition[MAX_PROJECTORS];
  uniform mat4 cameraProjection[MAX_PROJECTORS];
  uniform float sphereRadius;
  varying vec3 vWorldPosition;

  // Lighting
  const vec3 baseColor = vec3(0.1, 0.3, 0.7);
  const vec3 lightDir = normalize(vec3(0.5, 1.0, 0.8));

  vec4 projectColor(int idx, sampler2D tex) {
    vec3 normal = normalize(vWorldPosition);
    vec3 toCamera = normalize(projectorCameraPosition[idx] - vWorldPosition);
    float facing = dot(normal, toCamera);
    if (facing > 0.01) {
      vec3 dir = normalize(vWorldPosition - projectorCameraPosition[idx]);
      vec4 camSpace = inverse(cameraMatrix[idx]) * vec4(dir, 0.0);
      vec4 ndc = cameraProjection[idx] * vec4(camSpace.xyz, 1.0);
      if (ndc.w == 0.0) return vec4(0.0);
      ndc /= ndc.w;
      vec2 uv = ndc.xy * 0.5 + 0.5;
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec4(0.0);
      // Fade out alpha near the border (within 10% of edge)
      float edge = 0.1;
      float fade = 1.0;
      fade *= smoothstep(0.0, edge, uv.x);
      fade *= smoothstep(0.0, edge, uv.y);
      fade *= smoothstep(0.0, edge, 1.0 - uv.x);
      fade *= smoothstep(0.0, edge, 1.0 - uv.y);
      vec4 projColor = texture2D(tex, uv);
      projColor.a *= fade * facing;
      return projColor;
    }
    return vec4(0.0);
  }

  void main() {
    vec3 normal = normalize(vWorldPosition);
    vec4 color = vec4(0.0);
    float totalAlpha = 0.0;
    if (numProjectors > 0) {
      vec4 c0 = projectColor(0, tex0); color.rgb += c0.rgb * c0.a; totalAlpha += c0.a;
    }
    if (numProjectors > 1) {
      vec4 c1 = projectColor(1, tex1); color.rgb += c1.rgb * c1.a; totalAlpha += c1.a;
    }
    if (numProjectors > 2) {
      vec4 c2 = projectColor(2, tex2); color.rgb += c2.rgb * c2.a; totalAlpha += c2.a;
    }
    if (numProjectors > 3) {
      vec4 c3 = projectColor(3, tex3); color.rgb += c3.rgb * c3.a; totalAlpha += c3.a;
    }
    float diffuse = 0.5 + 0.5 * max(dot(normal, lightDir), 0.0);
    vec3 base = baseColor * diffuse;
    if (totalAlpha > 0.0) {
      color.rgb /= totalAlpha;
      color.rgb = mix(base, color.rgb, clamp(totalAlpha, 0.0, 1.0));
      color.a = 1.0;
      gl_FragColor = color;
    } else {
      gl_FragColor = vec4(base, 1.0);
    }
  }
`;
