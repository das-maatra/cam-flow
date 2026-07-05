import { HandTracker } from './HandTracker.js';
import { CameraFeed } from './CameraFeed.js';
import { SceneRenderer } from './SceneRenderer.js';
import { FluidSim } from './FluidSim.js';
import { RippleSim } from './RippleSim.js';
import { HandSplatter } from './HandSplatter.js';
import { ModeToggle } from './ModeToggle.js';

const video = document.getElementById('camera');

const cameraFeed = new CameraFeed(video);
const sceneRenderer = new SceneRenderer(video);
const handTracker = new HandTracker();
const handSplatter = new HandSplatter();

await handTracker.init();
await cameraFeed.start();
sceneRenderer.fitToVideo();
if (cameraFeed.isFrontFacing) {
  sceneRenderer.mirror();
}

const fluidSim = new FluidSim(sceneRenderer.renderer, {
  aspect: video.videoWidth / video.videoHeight,
});
const rippleSim = new RippleSim(sceneRenderer.renderer, {
  aspect: video.videoWidth / video.videoHeight,
});

const modeToggle = new ModeToggle({
  onChange: (mode) => sceneRenderer.setMode(mode),
});
sceneRenderer.setMode(modeToggle.mode);

const SPLIT_SPEED = 0.5; // radians/sec -- how fast the RGB split drifts back and forth

let lastTime = performance.now();
let elapsedTime = 0;

function animate() {
  requestAnimationFrame(animate);

  const now = performance.now();
  const dt = Math.min((now - lastTime) / 1000, 1 / 30);
  lastTime = now;
  elapsedTime += dt;

  const landmarks = handTracker.detect(video);
  const mode = modeToggle.mode;

  handSplatter.update(landmarks, fluidSim, rippleSim, mode, dt);

  // The ripple sim is cheap (1 pass) so it always steps -- it's the main
  // effect in ripple mode and a subtle secondary layer in fluid mode. The
  // fluid solver only steps while it's actually on screen (it's the
  // expensive one, ~19 passes per frame).
  rippleSim.step();

  if (mode === 'fluid') {
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
