import * as THREE from 'three';
import { fragmentShader as compositeFragmentShader } from './shaders/fluid/composite.js';
import { fragmentShader as rippleCompositeFragmentShader } from './shaders/ripple/rippleComposite.js';

// Unlike FluidSim's internal offscreen passes (where the quad always exactly
// fills its own dedicated camera, so raw position IS clip space), this quad
// gets scaled by fitToVideo() and viewed through a real scene camera, so it
// needs the standard projection/model-view transform to render correctly.
const vertexShader = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export class SceneRenderer {
  constructor(video) {
    this.video = video;

    this.renderer = new THREE.WebGLRenderer({ powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();

    this.aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.OrthographicCamera(-this.aspect, this.aspect, 1, -1, 0, 1);

    const videoTexture = new THREE.VideoTexture(video);
    videoTexture.colorSpace = THREE.SRGBColorSpace;

    const geometry = new THREE.PlaneGeometry(2, 2);
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader: compositeFragmentShader,
      uniforms: {
        uVideo: { value: videoTexture },
        uVelocity: { value: null },
        uRippleState: { value: null },
        uRippleTexelSize: { value: new THREE.Vector2() },
        uRippleStrength: { value: 0.5 },
        uStrength: { value: 0.05 },
        uTime: { value: 0 },
        uSplitStrength: { value: 0.015 },
        uTintStrength: { value: 0 },
      },
    });
    this.rippleMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader: rippleCompositeFragmentShader,
      uniforms: {
        uVideo: { value: videoTexture },
        uRippleState: { value: null },
        uTexelSize: { value: new THREE.Vector2() },
        uTime: { value: 0 },
        uSplitStrength: { value: 0.015 },
      },
    });
    this.quad = new THREE.Mesh(geometry, this.material);
    this.scene.add(this.quad);
  }

  setMode(mode) {
    this.quad.material = mode === 'ripple' ? this.rippleMaterial : this.material;
  }

  fitToVideo() {
    const videoAspect = this.video.videoWidth / this.video.videoHeight;
    if (this.aspect > videoAspect) {
      this.quad.scale.y = videoAspect / this.aspect;
    } else {
      this.quad.scale.x = this.aspect / videoAspect;
    }
  }

  mirror() {
    this.quad.scale.x *= -1;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
