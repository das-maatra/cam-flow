export const fragmentShader = `
varying vec2 vUv;

uniform sampler2D uState;
uniform vec2 uTexelSize;
uniform vec2 uDropPoint;
uniform float uDropRadius;
uniform float uDropStrength;
uniform float uAddDrop;
uniform float uAspectRatio;

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
  float c2   = 0.4;
  float next = c2 * avg + (2.0 - c2) * curr - prev;
  next *= 0.92;

  if (uAddDrop > 0.5) {
    vec2 p = vUv - uDropPoint;
    p.x *= uAspectRatio;
    float d = length(p);
    if (d < uDropRadius) {
      next += uDropStrength * (1.0 - d / uDropRadius);
    }
  }

  gl_FragColor = vec4(next, curr, 0.0, 1.0);
}
`;
