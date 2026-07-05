import * as THREE from 'three';
import { vertexShader } from './shaders/passthrough.js';
import { fragmentShader as rippleSimFragmentShader } from './shaders/ripple/rippleSim.js';

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
        uDropPoint: { value: new THREE.Vector2(-1, -1) },
        uDropRadius: { value: 0.03 },
        uDropStrength: { value: 0.0 },
        uAddDrop: { value: 0.0 },
        uAspectRatio: { value: this.aspect },
      },
    });

    this._camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this._scene = new THREE.Scene();
    this._quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this._scene.add(this._quad);
  }

  runPass(material, target) {
    this._quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this._scene, this._camera);
    this.renderer.setRenderTarget(null);
  }

  drop(point, strength, radius = 0.03) {
    const uniforms = this._simMaterial.uniforms;
    uniforms.uDropPoint.value.copy(point);
    uniforms.uDropStrength.value = strength;
    uniforms.uDropRadius.value = radius;
    uniforms.uAddDrop.value = 1.0;
  }

  step() {
    const uniforms = this._simMaterial.uniforms;
    uniforms.uState.value = this.state.read.texture;

    this.runPass(this._simMaterial, this.state.write);
    this.state.swap();

    uniforms.uAddDrop.value = 0.0;
  }
}
