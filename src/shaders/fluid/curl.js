export const fragmentShader = `
varying vec2 vUv;

uniform sampler2D uVelocity;
uniform vec2 uTexelSize;

void main() {
  float left   = texture2D(uVelocity, vUv - vec2(uTexelSize.x, 0.0)).y;
  float right  = texture2D(uVelocity, vUv + vec2(uTexelSize.x, 0.0)).y;
  float bottom = texture2D(uVelocity, vUv - vec2(0.0, uTexelSize.y)).x;
  float top    = texture2D(uVelocity, vUv + vec2(0.0, uTexelSize.y)).x;

  float curl = 0.5 * ((right - left) - (top - bottom));
  gl_FragColor = vec4(curl, 0.0, 0.0, 1.0);
}
`;
