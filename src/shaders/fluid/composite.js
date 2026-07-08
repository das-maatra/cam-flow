export const fragmentShader = `
varying vec2 vUv;

uniform sampler2D uVideo;
uniform sampler2D uVelocity;
uniform sampler2D uRippleState;
uniform vec2 uRippleTexelSize;
uniform float uRippleStrength;
uniform float uStrength;
uniform float uTime;
uniform float uSplitStrength;
uniform float uTintStrength;
uniform sampler2D uPersonMask;

void main(){
  vec2 velocity = texture2D(uVelocity, vUv).xy;

  // A subtle secondary displacement from the same wave-equation sim ripple
  // mode uses -- it decays slower and more gracefully than the velocity
  // field, so it gives the fluid a lingering "trailing" quality instead of
  // just vanishing once the velocity dissipates.
  vec2 rts = uRippleTexelSize;
  float wE = texture2D(uRippleState, vUv + vec2(rts.x, 0.0)).r;
  float wW = texture2D(uRippleState, vUv - vec2(rts.x, 0.0)).r;
  float wN = texture2D(uRippleState, vUv + vec2(0.0, rts.y)).r;
  float wS = texture2D(uRippleState, vUv - vec2(0.0, rts.y)).r;
  vec2 rippleDisp = vec2(wW - wE, wS - wN) * uRippleStrength;

  vec2 distortedUv = clamp(vUv + velocity * uStrength + rippleDisp, 0.001, 0.999);

  // How much fluid is at this point -- 0 where the water is still (no split,
  // looks like plain video), ramping to 1 where the flow is strong.
  float fluidAmount = clamp(length(velocity) * 1.0, 0.0, 1.0);

  // A horizontal offset that drifts back and forth over time, scaled by how
  // much fluid is present so the split only shows up where the water is.
  float splitOffset = sin(uTime) * uSplitStrength * fluidAmount;

  float r = texture2D(uVideo, distortedUv + vec2(splitOffset, 0.0)).r;
  float g = texture2D(uVideo, distortedUv).g;
  float b = texture2D(uVideo, distortedUv - vec2(splitOffset, 0.0)).b;

  // Teal <-> blue tint that slowly drifts over time, masked by fluidAmount so
  // it only shows up where the fluid is actually moving (helps read where
  // the effect is versus still video) and blended in at low opacity so the
  // video underneath stays clearly visible.
  vec3 teal = vec3(0.0, 0.6, 0.55);
  vec3 blue = vec3(0.05, 0.35, 0.9);
  float tintPhase = sin(uTime * 0.3) * 0.5 + 0.5;
  vec3 tint = mix(teal, blue, tintPhase);

  vec3 color = mix(vec3(r, g, b), tint, uTintStrength * fluidAmount);

  // Wherever the person mask says "arm/body", show the plain undistorted
  // video instead of the effect -- keeps the person reading as a clean
  // layer sitting on top of the fluid rather than being warped by it.
  float personAmount = texture2D(uPersonMask, vUv).r;
  vec3 rawVideo = texture2D(uVideo, vUv).rgb;
  color = mix(color, rawVideo, personAmount);

  gl_FragColor = vec4(color, 1.0);
}
`;