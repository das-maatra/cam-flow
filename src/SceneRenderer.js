import * as THREE from 'three/webgpu';
import { texture, uniform } from 'three/tsl';
import { compositeNode } from './shaders/fluid/composite.js';
import { rippleCompositeNode } from './shaders/ripple/rippleComposite.js';

export class SceneRenderer {
  constructor(video) {
    this.video = video;

    this.renderer = new THREE.WebGPURenderer({ powerPreference: 'high-performance', antialias: false });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();

    this.aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.OrthographicCamera(-this.aspect, this.aspect, 1, -1, 0, 1);

    const videoTexture = new THREE.VideoTexture(video);
    videoTexture.colorSpace = THREE.SRGBColorSpace;

    // Placeholder for the person mask until BodySegmenter produces a real one
    // -- an all-zero mask means "no person detected anywhere", which is the
    // correct fallback (effect shows everywhere, nothing punched out) rather
    // than leaving the sampler unbound.
    const blankMaskTexture = new THREE.DataTexture(new Uint8Array([0]), 1, 1, THREE.RedFormat, THREE.UnsignedByteType);
    blankMaskTexture.needsUpdate = true;

    const videoNode = texture(videoTexture);

    // Shared between both composite materials -- the segmenter writes one
    // mask per frame and both passes read it.
    this._personMask = texture(blankMaskTexture);

    this.uniforms = {
      velocity: texture(blankMaskTexture),
      rippleState: texture(blankMaskTexture),
      rippleTexelSize: uniform(new THREE.Vector2()),
      rippleStrength: uniform(0.5),
      strength: uniform(0.05),
      time: uniform(0),
      splitStrength: uniform(0.015),
      tintStrength: uniform(0),

      rippleOnlyState: texture(blankMaskTexture),
      rippleOnlyTexelSize: uniform(new THREE.Vector2()),
      rippleOnlyTime: uniform(0),
      rippleOnlySplitStrength: uniform(0.015),
    };

    const geometry = new THREE.PlaneGeometry(2, 2);

    // fragmentNode rather than colorNode: these passes produce their final
    // pixel directly and must not be run through the node pipeline's lighting
    // and output-conversion stages, matching what the old raw ShaderMaterial
    // wrote.
    this.material = new THREE.NodeMaterial();
    this.material.fragmentNode = compositeNode({
      video: videoNode,
      velocity: this.uniforms.velocity,
      rippleState: this.uniforms.rippleState,
      rippleTexelSize: this.uniforms.rippleTexelSize,
      rippleStrength: this.uniforms.rippleStrength,
      strength: this.uniforms.strength,
      time: this.uniforms.time,
      splitStrength: this.uniforms.splitStrength,
      tintStrength: this.uniforms.tintStrength,
      personMask: this._personMask,
    });

    this.rippleMaterial = new THREE.NodeMaterial();
    this.rippleMaterial.fragmentNode = rippleCompositeNode({
      video: videoNode,
      rippleState: this.uniforms.rippleOnlyState,
      texelSize: this.uniforms.rippleOnlyTexelSize,
      time: this.uniforms.rippleOnlyTime,
      splitStrength: this.uniforms.rippleOnlySplitStrength,
      personMask: this._personMask,
    });

    this.quad = new THREE.Mesh(geometry, this.material);
    this.scene.add(this.quad);
  }

  // Called once from main.js before the first frame -- WebGPU device creation
  // is asynchronous, unlike WebGL context creation, so nothing may be rendered
  // until this resolves.
  async init() {
    await this.renderer.init();
  }

  setPersonMask(maskTexture) {
    this._personMask.value = maskTexture;
  }

  // Parents an overlay to the video quad rather than the scene, so it
  // inherits fitToVideo()'s cover-fit scale and mirror()'s flip and lands in
  // the same space as the video pixels -- including after a camera switch,
  // with no fit maths repeated on the overlay's side. Local coordinates
  // -1..1 therefore span exactly the visible video.
  addToVideoPlane(object) {
    object.renderOrder = 1; // drawn after the composited video beneath it
    this.quad.add(object);
  }

  setMode(mode) {
    this.quad.material = mode === 'ripple' ? this.rippleMaterial : this.material;
    // Fluid mode treats the ripple as a faint trailing layer behind the
    // fluid; Combined mode is meant to read as both effects together, so the
    // same gradient-displacement math gets a much stronger weight.
    this.uniforms.rippleStrength.value = mode === 'combined' ? 1.4 : 0.5;
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
