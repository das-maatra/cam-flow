import * as THREE from 'three/webgpu';
import { texture, uniform, uniformArray } from 'three/tsl';
import { DoubleFBO } from './DoubleFBO.js';
import { rippleSimNode } from './shaders/ripple/rippleSim.js';

// A fast drag stamps several ripples per fingertip per frame to keep the
// trail continuous (see HandSplatter's MAX_RIPPLE_STAMPS), so this needs
// headroom well beyond "one drop per fingertip" -- sized for 2 tracked hands
// x 5 fingertips x up to 4 stamps each on average.
//
// Unlike the GLSL version this no longer has to be mirrored inside the shader
// as an unrolled block count: the WGSL loop reads it from the uniform arrays'
// length, so this constant is now the single source of truth.
export const MAX_DROPS = 40;

export class RippleSim {
  constructor(renderer, { simResolution = 224, aspect = window.innerWidth / window.innerHeight } = {}) {
    this.renderer = renderer;

    const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;

    const width = safeAspect >= 1 ? simResolution : Math.round(simResolution * safeAspect);
    const height = safeAspect >= 1 ? Math.round(simResolution / safeAspect) : simResolution;
    this.texelSize = new THREE.Vector2(1 / width, 1 / height);
    this.aspect = width / height;

    // R = current wave height, G = previous wave height
    this.state = new DoubleFBO(width, height);

    this._dropPoints = uniformArray(Array.from({ length: MAX_DROPS }, () => new THREE.Vector2(-1, -1)));
    this._dropRadii = uniformArray(new Array(MAX_DROPS).fill(0.03));
    this._dropStrengths = uniformArray(new Array(MAX_DROPS).fill(0));
    this._dropCount = uniform(0, 'int');
    this._smoothing = uniform(0.4); // wave propagation coefficient -- higher spreads/blends neighbours more per step
    this._state = texture(this.state.read.texture);

    this._simMaterial = new THREE.NodeMaterial();
    this._simMaterial.fragmentNode = rippleSimNode({
      state: this._state,
      texelSize: uniform(this.texelSize),
      dropPoints: this._dropPoints,
      dropRadii: this._dropRadii,
      dropStrengths: this._dropStrengths,
      dropCount: this._dropCount,
      aspect: uniform(this.aspect),
      smoothing: this._smoothing,
    });
    this._simMaterial.depthTest = false;
    this._simMaterial.depthWrite = false;

    this._quad = new THREE.QuadMesh();

    // drop() just queues -- multiple fingertips can each call it in the same
    // frame without stomping each other, and step() applies all of them
    // together in its single pass.
    this._pendingDrops = [];
  }

  drop(point, strength, radius = 0.03) {
    if (this._pendingDrops.length >= MAX_DROPS) return; // extra simultaneous drops beyond MAX_DROPS this frame are dropped rather than silently overwriting earlier ones
    this._pendingDrops.push({ point, strength, radius });
  }

  setSmoothing(value) {
    this._smoothing.value = value;
  }

  step() {
    this._state.value = this.state.read.texture;
    this._dropCount.value = this._pendingDrops.length;

    this._pendingDrops.forEach(({ point, strength, radius }, i) => {
      this._dropPoints.array[i].set(point.x, point.y);
      this._dropStrengths.array[i] = strength;
      this._dropRadii.array[i] = radius;
    });
    this._dropStrengths.needsUpdate = true;
    this._dropRadii.needsUpdate = true;
    this._dropPoints.needsUpdate = true;

    this._quad.material = this._simMaterial;
    this.renderer.setRenderTarget(this.state.write);
    this._quad.render(this.renderer);
    this.renderer.setRenderTarget(null);
    this.state.swap();

    this._pendingDrops = [];
  }
}
