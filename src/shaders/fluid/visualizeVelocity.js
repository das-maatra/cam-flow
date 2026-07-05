export const fragmentShader = `
varying vec2 vUv;

uniform sampler2D uVelocity;
uniform float uGain;

void main() {
  vec2 vel = texture2D(uVelocity, vUv).xy;
  gl_FragColor = vec4(vel * uGain + 0.5, 0.5, 1.0);
}
`;
