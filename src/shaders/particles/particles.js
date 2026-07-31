// Particles are a child of the video quad, so `position` already arrives in
// the quad's local space (-1..1 on both axes, matching PlaneGeometry(2,2)).
// That makes the UV used to sample the ripple field a plain remap of the
// vertex position -- the same vUv the composite shaders sample the video and
// ripple state with, so a particle lines up with the wave underneath it.
export const vertexShader = `
attribute float aSeed;

uniform sampler2D uRippleState;
uniform vec2 uRippleTexelSize;
uniform float uBaseSize;
uniform float uWaveScale;
uniform float uDisplacement;

varying float vSeed;

void main() {
  vec2 uv = position.xy * 0.5 + 0.5;

  // Wave height under this particle, and the surface gradient -- the same
  // two quantities the ripple composite uses, read here per-vertex instead
  // of per-pixel. Vertex texture fetch is the one hardware capability this
  // whole approach depends on, so it is exercised from the start rather
  // than discovered to be missing later.
  float wave = texture2D(uRippleState, uv).r;
  vec2 ts = uRippleTexelSize;
  float wE = texture2D(uRippleState, uv + vec2(ts.x, 0.0)).r;
  float wW = texture2D(uRippleState, uv - vec2(ts.x, 0.0)).r;
  float wN = texture2D(uRippleState, uv + vec2(0.0, ts.y)).r;
  float wS = texture2D(uRippleState, uv - vec2(0.0, ts.y)).r;
  vec2 slope = vec2(wW - wE, wS - wN);

  // uDisplacement/uWaveScale are 0 for now, so particles sit at rest -- the
  // wave response is a matter of raising them, not of rewiring anything.
  vec3 displaced = position + vec3(slope * uDisplacement, 0.0);

  gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);

  // Per-particle size variation keeps the field from reading as a uniform
  // stipple pattern. Point size is in device pixels and ignores the parent
  // quad's scale, so particles stay the same size on screen however the
  // video is fitted or mirrored.
  float size = uBaseSize * (0.6 + 0.8 * aSeed);
  gl_PointSize = size * (1.0 + wave * uWaveScale);

  vSeed = aSeed;
}
`;

export const fragmentShader = `
uniform vec3 uColor;
uniform float uOpacity;

varying float vSeed;

void main() {
  // gl_PointCoord is a unit square -- carve a soft-edged disc out of it so
  // particles read as round dust rather than hard squares.
  float d = length(gl_PointCoord - 0.5);
  float alpha = smoothstep(0.5, 0.3, d);
  if (alpha <= 0.001) discard;

  gl_FragColor = vec4(uColor, alpha * uOpacity * (0.5 + 0.5 * vSeed));
}
`;
