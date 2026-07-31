import { HandTracker } from './HandTracker.js';
import { CameraFeed } from './CameraFeed.js';
import { SceneRenderer } from './SceneRenderer.js';
import { FluidSim } from './FluidSim.js';
import { RippleSim } from './RippleSim.js';
import { HandSplatter } from './HandSplatter.js';
import { ModeToggle } from './ModeToggle.js';
import { BodySegmenter } from './BodySegmenter.js';
import { ParticleSystem } from './ParticleSystem.js';
import { FpsMeter } from './FpsMeter.js';

const video = document.getElementById('camera');

const cameraFeed = new CameraFeed(video);
const sceneRenderer = new SceneRenderer(video);
const handTracker = new HandTracker();
const handSplatter = new HandSplatter();
const bodySegmenter = new BodySegmenter();

// WebGPU device creation is asynchronous, so the renderer has to be awaited
// alongside the model loads before anything can be drawn.
await Promise.all([handTracker.init(), bodySegmenter.init(), sceneRenderer.init()]);
await cameraFeed.start();
sceneRenderer.fitToVideo();
if (cameraFeed.shouldMirror) {
  sceneRenderer.mirror();
}

// fitToVideo() resets scale.x to a plain positive magnitude, so the mirror
// has to be reapplied based on the new facing rather than unconditionally
// flipped.
cameraFeed.onSwitch = () => {
  sceneRenderer.fitToVideo();
  if (cameraFeed.shouldMirror) {
    sceneRenderer.mirror();
  }
};

const fluidSim = new FluidSim(sceneRenderer.renderer, {
  aspect: video.videoWidth / video.videoHeight,
});
const rippleSim = new RippleSim(sceneRenderer.renderer, {
  aspect: video.videoWidth / video.videoHeight,
});

const particleSystem = new ParticleSystem({ count: 5000 });
sceneRenderer.addToVideoPlane(particleSystem.mesh);

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

const particlesBtn = document.getElementById('particles-toggle');
particlesBtn.classList.toggle('active', particleSystem.enabled);
particlesBtn.addEventListener('click', () => {
  particleSystem.setEnabled(!particleSystem.enabled);
  particlesBtn.classList.toggle('active', particleSystem.enabled);
});

const fpsMeter = new FpsMeter(document.getElementById('fps-meter'));
const fpsBtn = document.getElementById('fps-toggle');
fpsBtn.classList.toggle('active', fpsMeter.enabled);
fpsBtn.addEventListener('click', () => {
  fpsMeter.setEnabled(!fpsMeter.enabled);
  fpsBtn.classList.toggle('active', fpsMeter.enabled);
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

  // Stage timings for the FPS meter's breakdown. Hand tracking is measured on
  // its own because it is the one stage whose cost swings with whether hands
  // are actually in frame: MediaPipe bails out cheaply when it finds nothing,
  // then runs the landmark model per hand once it does.
  const landmarks = handTracker.detect(video);
  const afterHands = performance.now();
  const mode = modeToggle.mode;

  const personMask = bodySegmenter.segment(video);
  if (personMask) {
    sceneRenderer.setPersonMask(personMask);
  }
  const afterSeg = performance.now();

  handSplatter.update(landmarks, fluidSim, rippleSim, mode, dt, realDt);

  // The ripple sim is cheap (1 pass) so it always steps -- it's the main
  // effect in ripple mode and a secondary layer in fluid/combined mode. The
  // fluid solver only steps while it's actually on screen (it's the
  // expensive one, ~19 passes per frame) -- both fluid and combined mode use it.
  rippleSim.step();
  particleSystem.update(rippleSim, sceneRenderer);

  const u = sceneRenderer.uniforms;
  if (mode === 'fluid' || mode === 'combined') {
    fluidSim.step(dt);
    u.velocity.value = fluidSim.velocity.read.texture;
    u.rippleState.value = rippleSim.state.read.texture;
    u.rippleTexelSize.value.copy(rippleSim.texelSize);
    u.time.value = elapsedTime * SPLIT_SPEED;
  } else {
    u.rippleOnlyState.value = rippleSim.state.read.texture;
    u.rippleOnlyTexelSize.value.copy(rippleSim.texelSize);
    u.rippleOnlyTime.value = elapsedTime * SPLIT_SPEED;
  }

  const afterSim = performance.now();
  sceneRenderer.render();
  const end = performance.now();

  // Measured last so it covers the whole frame's work. `now` was taken at the
  // top of this callback, so the difference is time spent on the main thread
  // rather than time waiting for the next vsync.
  fpsMeter.update(realDt, end - now, {
    hands: afterHands - now,
    seg: afterSeg - afterHands,
    sim: afterSim - afterSeg,
    draw: end - afterSim,
  });
}

animate();
