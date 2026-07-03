import { HandTracker } from './HandTracker.js';
import { CameraFeed } from './CameraFeed.js';
import { SceneRenderer } from './SceneRenderer.js';

const video = document.getElementById('camera');

const cameraFeed = new CameraFeed(video);
const sceneRenderer = new SceneRenderer(video);
const handTracker = new HandTracker();

await handTracker.init();
await cameraFeed.start();
sceneRenderer.fitToVideo();

function animate() {
  requestAnimationFrame(animate);

  const landmarks = handTracker.detect(video);
  console.log(landmarks);

  sceneRenderer.render();
}

animate();
