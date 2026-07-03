import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();

const aspect = window.innerWidth/window.innerHeight;
const camera = new THREE.OrthographicCamera(-aspect, aspect, 1,-1, 0,1);


const video = document.getElementById('camera');
const videoTexture = new THREE.VideoTexture(video);
videoTexture.colorSpace = THREE.SRGBColorSpace;

const geometry = new THREE.PlaneGeometry(2,2);
const material = new THREE.MeshBasicMaterial({map: videoTexture});
const quad = new THREE.Mesh(geometry, material);
scene.add(quad);


try {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment' },
  });
  video.srcObject = stream;
  await video.play();
} catch (err) {
  document.body.innerText = `Camera error: ${err.message}`;
}

const videoAspect = video.videoWidth/video.videoHeight;
if(aspect > videoAspect){
  quad.scale.y = videoAspect/aspect;
}else{
  quad.scale.x = aspect/videoAspect;
}

function animate(){
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}

animate();
