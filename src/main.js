import { HandTracker } from './HandTracker.js';
import { CameraFeed } from './CameraFeed.js';
import { SceneRenderer } from './SceneRenderer.js';
import { LandmarkDebugView } from './LandmarkDebugView.js';

const video = document.getElementById('camera');

const cameraFeed = new CameraFeed(video);
const sceneRenderer = new SceneRenderer(video);
const handTracker = new HandTracker();
const landmarkDebugView = new LandmarkDebugView(sceneRenderer.scene, handTracker.numHands);

await handTracker.init();
await cameraFeed.start();
sceneRenderer.fitToVideo();

function animate() {
  requestAnimationFrame(animate);

  const landmarks = handTracker.detect(video);
  landmarkDebugView.update(landmarks, sceneRenderer.quad);
  // console.log(landmarks);

  sceneRenderer.render();
}

animate();
