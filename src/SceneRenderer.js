import * as THREE from 'three';

export class SceneRenderer {
  constructor(video) {
    this.video = video;

    this.renderer = new THREE.WebGLRenderer();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();

    this.aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.OrthographicCamera(-this.aspect, this.aspect, 1, -1, 0, 1);

    const videoTexture = new THREE.VideoTexture(video);
    videoTexture.colorSpace = THREE.SRGBColorSpace;

    const geometry = new THREE.PlaneGeometry(2, 2);
    const material = new THREE.MeshBasicMaterial({ map: videoTexture });
    this.quad = new THREE.Mesh(geometry, material);
    this.scene.add(this.quad);
  }

  fitToVideo() {
    const videoAspect = this.video.videoWidth / this.video.videoHeight;
    if (this.aspect > videoAspect) {
      this.quad.scale.y = videoAspect / this.aspect;
    } else {
      this.quad.scale.x = this.aspect / videoAspect;
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
