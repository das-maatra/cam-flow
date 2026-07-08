export const fragmentShader = `
varying vec2 vUv;

uniform sampler2D uVideo;
uniform sampler2D uRippleState;
uniform vec2 uTexelSize;
uniform float uTime;
uniform float uSplitStrength;
uniform sampler2D uPersonMask;

void main(){
  vec2 ts = uTexelSize;

  // Surface gradient of the wave height -> UV displacement (refraction look)
  float wE = texture2D(uRippleState, vUv + vec2( ts.x, 0.0)).r;
  float wW = texture2D(uRippleState, vUv - vec2( ts.x, 0.0)).r;
  float wN = texture2D(uRippleState, vUv + vec2(0.0,  ts.y)).r;
  float wS = texture2D(uRippleState, vUv - vec2(0.0,  ts.y)).r;

  vec2 disp = vec2((wW - wE) * 4.0, (wS - wN) * 4.0);
  vec2 distortedUv = clamp(vUv + disp, 0.001, 0.999);

  // How much ripple is at this point -- scales the RGB split like composite.js
  // does with fluid velocity.
  float rippleAmount = clamp(length(disp) * 10.0, 0.0, 1.0);
  float splitOffset = sin(uTime) * uSplitStrength * rippleAmount;

  float r = texture2D(uVideo, distortedUv + vec2(splitOffset, 0.0)).r;
  float g = texture2D(uVideo, distortedUv).g;
  float b = texture2D(uVideo, distortedUv - vec2(splitOffset, 0.0)).b;

  // Wherever the person mask says "arm/body", show the plain undistorted
  // video instead of the effect -- keeps the person reading as a clean
  // layer sitting on top of the ripples rather than being warped by them.
  float personAmount = texture2D(uPersonMask, vUv).r;
  vec3 rawVideo = texture2D(uVideo, vUv).rgb;
  vec3 color = mix(vec3(r, g, b), rawVideo, personAmount);

  gl_FragColor = vec4(color, 1.0);
}
`;
