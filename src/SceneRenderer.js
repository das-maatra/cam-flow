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

    // Placeholder for uPersonMask until BodySegmenter produces a real one --
    // an all-zero mask means "no person detected anywhere", which is the
    // correct fallback (effect shows everywhere, nothing punched out) rather
    // than leaving the sampler unbound.
    const blankMaskTexture = new THREE.DataTexture(new Uint8Array([0]), 1, 1, THREE.RedFormat, THREE.UnsignedByteType);
    blankMaskTexture.needsUpdate = true;

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
        uPersonMask: { value: blankMaskTexture },
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
        uPersonMask: { value: blankMaskTexture },
      },
    });
    this.quad = new THREE.Mesh(geometry, this.material);
    this.scene.add(this.quad);
  }

  setMode(mode) {
    this.quad.material = mode === 'ripple' ? this.rippleMaterial : this.material;
    // Fluid mode treats the ripple as a faint trailing layer behind the
    // fluid; Combined mode is meant to read as both effects together, so the
    // same gradient-displacement math gets a much stronger weight.
    this.material.uniforms.uRippleStrength.value = mode === 'combined' ? 1.4 : 0.5;
  }

  fitToVideo() {
    const videoAspect = this.video.videoWidth / this.video.videoHeight;
    // Quad's on-screen pixel aspect ratio equals scale.x/scale.y directly
    // (the ortho camera/screen mapping is isotropic), so both axes must be
    // set on every call -- leaving one at a stale value breaks the fit.
    // This is a "cover" fit (fills the screen, crops overflow, like a normal
    // camera app) rather than "contain" -- the axis that would otherwise
    // leave a gap is overscaled instead of the other axis being shrunk.
    if (this.aspect > videoAspect) {
      this.quad.scale.x = this.aspect;
      this.quad.scale.y = this.aspect / videoAspect;
    } else {
      this.quad.scale.x = videoAspect;
      this.quad.scale.y = 1;
    }
  }

  mirror() {
    this.quad.scale.x *= -1;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
