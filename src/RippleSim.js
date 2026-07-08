import * as THREE from 'three';
import { vertexShader } from './shaders/passthrough.js';
import { fragmentShader as rippleSimFragmentShader } from './shaders/ripple/rippleSim.js';

// A fast drag stamps several ripples per fingertip per frame to keep the
// trail continuous (see HandSplatter's MAX_RIPPLE_STAMPS), so this needs
// headroom well beyond "one drop per fingertip" -- sized for 2 tracked hands
// x 5 fingertips x up to 4 stamps each on average. Must match MAX_DROPS in
// shaders/ripple/rippleSim.js.
export const MAX_DROPS = 40;

function createRenderTarget(width, height) {
  return new THREE.WebGLRenderTarget(width, height, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false,
    stencilBuffer: false,
  });
}

class DoubleFBO {
  constructor(renderer, width, height) {
    this.read = createRenderTarget(width, height);
    this.write = createRenderTarget(width, height);
    renderer.setRenderTarget(this.read);
    renderer.clear();
    renderer.setRenderTarget(this.write);
    renderer.clear();
    renderer.setRenderTarget(null);
  }

  swap() {
    [this.read, this.write] = [this.write, this.read];
  }
}

export class RippleSim {
  constructor(renderer, { simResolution = 224, aspect = window.innerWidth / window.innerHeight } = {}) {
    this.renderer = renderer;

    const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;

    const width = safeAspect >= 1 ? simResolution : Math.round(simResolution * safeAspect);
    const height = safeAspect >= 1 ? Math.round(simResolution / safeAspect) : simResolution;
    this.texelSize = new THREE.Vector2(1 / width, 1 / height);
    this.aspect = width / height;

    // R = current wave height, G = previous wave height
    this.state = new DoubleFBO(renderer, width, height);

    this._simMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader: rippleSimFragmentShader,
      uniforms: {
        uState: { value: null },
        uTexelSize: { value: this.texelSize },
        uDropPoints: { value: Array.from({ length: MAX_DROPS }, () => new THREE.Vector2(-1, -1)) },
        uDropRadii: { value: new Array(MAX_DROPS).fill(0.03) },
        uDropStrengths: { value: new Array(MAX_DROPS).fill(0) },
        uDropCount: { value: 0 },
        uAspectRatio: { value: this.aspect },
        uSmoothing: { value: 0.4 }, // wave propagation coefficient -- higher spreads/blends neighbours more per step
      },
    });

    this._camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this._scene = new THREE.Scene();
    this._quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this._scene.add(this._quad);

    // drop() just queues -- multiple fingertips can each call it in the same
    // frame without stomping each other, and step() applies all of them
    // together in its single pass.
    this._pendingDrops = [];
  }

  runPass(material, target) {
    this._quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this._scene, this._camera);
    this.renderer.setRenderTarget(null);
  }

  drop(point, strength, radius = 0.03) {
    if (this._pendingDrops.length >= MAX_DROPS) return; // extra simultaneous drops beyond MAX_DROPS this frame are dropped rather than silently overwriting earlier ones
    this._pendingDrops.push({ point, strength, radius });
  }

  setSmoothing(value) {
    this._simMaterial.uniforms.uSmoothing.value = value;
  }

  step() {
    const uniforms = this._simMaterial.uniforms;
    uniforms.uState.value = this.state.read.texture;

    uniforms.uDropCount.value = this._pendingDrops.length;
    this._pendingDrops.forEach(({ point, strength, radius }, i) => {
      uniforms.uDropPoints.value[i].set(point.x, point.y);
      uniforms.uDropStrengths.value[i] = strength;
      uniforms.uDropRadii.value[i] = radius;
    });

    this.runPass(this._simMaterial, this.state.write);
    this.state.swap();

    this._pendingDrops = [];
  }
}
