export const fragmentShader = `
varying vec2 vUv;

uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform vec2 uTexelSize;
uniform float uCurlStrength;
uniform float uDt;

void main() {
  float left   = abs(texture2D(uCurl, vUv - vec2(uTexelSize.x, 0.0)).x);
  float right  = abs(texture2D(uCurl, vUv + vec2(uTexelSize.x, 0.0)).x);
  float bottom = abs(texture2D(uCurl, vUv - vec2(0.0, uTexelSize.y)).x);
  float top    = abs(texture2D(uCurl, vUv + vec2(0.0, uTexelSize.y)).x);
  float center = texture2D(uCurl, vUv).x;

  // Larger epsilon than the textbook formula: with a near-zero epsilon, any
  // tiny grid-noise gradient gets normalized up to full strength every frame,
  // which is what made the curls look noisy/jagged instead of round -- and
  // fed a runaway energy increase. This epsilon suppresses weak/noisy
  // gradients while still fully confining strong, coherent ones.
  vec2 force = 0.5 * vec2(top - bottom, right - left);
  force /= length(force) + 0.05;
  force *= uCurlStrength * center;
  force.y *= -1.0;

  vec2 velocity = texture2D(uVelocity, vUv).xy;
  velocity += force * uDt;
  // Vorticity confinement is a feedback loop -- it re-injects energy
  // proportional to existing curl every single frame, forever. Without a
  // direct counterweight here, that loop can slowly accumulate over a long
  // session (not just from new splats) until it saturates the clamp across
  // the whole field, which is what caused the "explodes into noise after a
  // while, starting from a random spot" bug.
  velocity *= 0.99;
  velocity = clamp(velocity, vec2(-12.0), vec2(12.0));
  gl_FragColor = vec4(velocity, 0.0, 1.0);
}
`;
