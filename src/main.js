import { HandTracker } from './HandTracker.js';
import { CameraFeed } from './CameraFeed.js';
import { SceneRenderer } from './SceneRenderer.js';
import { FluidSim } from './FluidSim.js';
import { RippleSim } from './RippleSim.js';
import { HandSplatter } from './HandSplatter.js';
import { ModeToggle } from './ModeToggle.js';
import { BodySegmenter } from './BodySegmenter.js';

const video = document.getElementById('camera');

const cameraFeed = new CameraFeed(video);
const sceneRenderer = new SceneRenderer(video);
const handTracker = new HandTracker();
const handSplatter = new HandSplatter();
const bodySegmenter = new BodySegmenter();

await Promise.all([handTracker.init(), bodySegmenter.init()]);
await cameraFeed.start();
sceneRenderer.fitToVideo();
if (cameraFeed.isFrontFacing) {
  sceneRenderer.mirror();
}

// fitToVideo() resets scale.x to a plain positive magnitude, so the mirror
// has to be reapplied based on the new facing rather than unconditionally
// flipped.
cameraFeed.onSwitch = () => {
  sceneRenderer.fitToVideo();
  if (cameraFeed.isFrontFacing) {
    sceneRenderer.mirror();
  }
};

const fluidSim = new FluidSim(sceneRenderer.renderer, {
  aspect: video.videoWidth / video.videoHeight,
});
const rippleSim = new RippleSim(sceneRenderer.renderer, {
  aspect: video.videoWidth / video.videoHeight,
});

const modeToggle = new ModeToggle({
  initialMode: 'combined',
  onChange: (mode) => sceneRenderer.setMode(mode),
});
sceneRenderer.setMode(modeToggle.mode);

const distanceGateBtn = document.getElementById('distance-gate');
distanceGateBtn.classList.toggle('active', handSplatter.distanceGateEnabled);
distanceGateBtn.addEventListener('click', () => {
  handSplatter.distanceGateEnabled = !handSplatter.distanceGateEnabled;
  distanceGateBtn.classList.toggle('active', handSplatter.distanceGateEnabled);
});

const segmentationBtn = document.getElementById('segmentation-toggle');
segmentationBtn.classList.toggle('active', bodySegmenter.enabled);
segmentationBtn.addEventListener('click', () => {
  bodySegmenter.setEnabled(!bodySegmenter.enabled);
  segmentationBtn.classList.toggle('active', bodySegmenter.enabled);
});

const multiFingerBtn = document.getElementById('multi-finger-toggle');
multiFingerBtn.classList.toggle('active', handSplatter.multiFingerEnabled);
multiFingerBtn.addEventListener('click', () => {
  handSplatter.multiFingerEnabled = !handSplatter.multiFingerEnabled;
  multiFingerBtn.classList.toggle('active', handSplatter.multiFingerEnabled);
});

const cameraToggleBtn = document.getElementById('camera-toggle');
cameraToggleBtn.addEventListener('click', () => cameraFeed.switchCamera());

// Wires a slider's live value to a setter and keeps its `--fill` CSS custom
// property in sync with the current position, which the "filled track" look
// in index.html's slider styling reads from.
function bindSlider(id, onChange) {
  const el = document.getElementById(id);
  const update = () => {
    const min = parseFloat(el.min);
    const max = parseFloat(el.max);
    const value = parseFloat(el.value);
    el.style.setProperty('--fill', `${((value - min) / (max - min)) * 100}%`);
    onChange(value);
  };
  el.addEventListener('input', update);
  update();
}

bindSlider('single-radius-slider', (v) => { handSplatter.singleFingerRadiusMultiplier = v; });
bindSlider('multi-radius-slider', (v) => { handSplatter.multiFingerRadiusMultiplier = v; });
bindSlider('fluid-speed-slider', (v) => { fluidSim.speedMultiplier = v; });
bindSlider('ripple-strength-slider', (v) => { handSplatter.rippleStrengthMultiplier = v; });
bindSlider('fluid-threshold-slider', (v) => { handSplatter.fluidMotionThreshold = v; });
bindSlider('ripple-threshold-slider', (v) => { handSplatter.rippleMotionThreshold = v; });

const SPLIT_SPEED = 0.5; // radians/sec -- how fast the RGB split drifts back and forth

let lastTime = performance.now();
let elapsedTime = 0;

function animate() {
  requestAnimationFrame(animate);

  const now = performance.now();
  // dt is clamped so a lag spike can't dump a huge single force impulse into
  // the fluid sim. realDt is the true, unclamped gap -- HandSplatter needs
  // it to tell a fast drag from a tracking glitch, since a raw per-frame
  // distance means something different depending on how much time actually
  // passed between detections.
  const realDt = (now - lastTime) / 1000;
  const dt = Math.min(realDt, 1 / 30);
  lastTime = now;
  elapsedTime += dt;

  const landmarks = handTracker.detect(video);
  const mode = modeToggle.mode;

  handSplatter.update(landmarks, fluidSim, rippleSim, mode, dt, realDt);

  const personMask = bodySegmenter.segment(video);
  if (personMask) {
    sceneRenderer.material.uniforms.uPersonMask.value = personMask;
    sceneRenderer.rippleMaterial.uniforms.uPersonMask.value = personMask;
  }

  // The ripple sim is cheap (1 pass) so it always steps -- it's the main
  // effect in ripple mode and a secondary layer in fluid/combined mode. The
  // fluid solver only steps while it's actually on screen (it's the
  // expensive one, ~19 passes per frame) -- both fluid and combined mode use it.
  rippleSim.step();

  if (mode === 'fluid' || mode === 'combined') {
    fluidSim.step(dt);
    sceneRenderer.material.uniforms.uVelocity.value = fluidSim.velocity.read.texture;
    sceneRenderer.material.uniforms.uRippleState.value = rippleSim.state.read.texture;
    sceneRenderer.material.uniforms.uRippleTexelSize.value.copy(rippleSim.texelSize);
    sceneRenderer.material.uniforms.uTime.value = elapsedTime * SPLIT_SPEED;
  } else {
    sceneRenderer.rippleMaterial.uniforms.uRippleState.value = rippleSim.state.read.texture;
    sceneRenderer.rippleMaterial.uniforms.uTexelSize.value.copy(rippleSim.texelSize);
    sceneRenderer.rippleMaterial.uniforms.uTime.value = elapsedTime * SPLIT_SPEED;
  }

  sceneRenderer.render();
}

animate();
