// Number of simultaneous drops the shader accepts -- must match MAX_DROPS in
// RippleSim.js.
const MAX_DROPS = 40;

// GLSL ES 1.00 (what WebGL1 mobile GPUs run) has historically inconsistent
// driver support for dynamically indexing a uniform array with a loop
// variable in a fragment shader -- some drivers just silently read index 0
// every time. Unrolling with literal constant indices sidesteps that
// entirely instead of looping over uDropPoints[i].
const dropBlocks = Array.from({ length: MAX_DROPS }, (_, i) => `
  if (uDropCount > ${i}) {
    vec2 p${i} = vUv - uDropPoints[${i}];
    p${i}.x *= uAspectRatio;
    float d${i} = length(p${i});
    if (d${i} < uDropRadii[${i}]) {
      next += uDropStrengths[${i}] * (1.0 - d${i} / uDropRadii[${i}]);
    }
  }
`).join('\n');

export const fragmentShader = `
varying vec2 vUv;

uniform sampler2D uState;
uniform vec2 uTexelSize;
uniform vec2 uDropPoints[${MAX_DROPS}];
uniform float uDropRadii[${MAX_DROPS}];
uniform float uDropStrengths[${MAX_DROPS}];
uniform int uDropCount;
uniform float uAspectRatio;
uniform float uSmoothing;

void main(){
  vec2 ts = uTexelSize;

  // R = current height, G = previous height
  float curr = texture2D(uState, vUv).r;
  float prev = texture2D(uState, vUv).g;

  // 8-neighbour weighted average (diagonals at half weight, normalised by 6)
  float n  = texture2D(uState, vUv + vec2( 0.0,  ts.y)).r;
  float s  = texture2D(uState, vUv + vec2( 0.0, -ts.y)).r;
  float e  = texture2D(uState, vUv + vec2( ts.x,  0.0)).r;
  float w  = texture2D(uState, vUv + vec2(-ts.x,  0.0)).r;
  float ne = texture2D(uState, vUv + vec2( ts.x,  ts.y)).r;
  float nw = texture2D(uState, vUv + vec2(-ts.x,  ts.y)).r;
  float se = texture2D(uState, vUv + vec2( ts.x, -ts.y)).r;
  float sw = texture2D(uState, vUv + vec2(-ts.x, -ts.y)).r;

  float avg  = ((n + s + e + w) + 0.5 * (ne + nw + se + sw)) / 6.0;
  float c2   = uSmoothing;
  float next = c2 * avg + (2.0 - c2) * curr - prev;
  next *= 0.92;

  ${dropBlocks}

  gl_FragColor = vec4(next, curr, 0.0, 1.0);
}
`;
