import * as THREE from 'three';
import { vertexShader } from './shaders/passthrough.js';
import { fragmentShader } from './shaders/fluid/splat.js';
import { fragmentShader as visualizeVelocityFragmentShader } from './shaders/fluid/visualizeVelocity.js';
import { fragmentShader as advectFragmentShader } from './shaders/fluid/advect.js';
import { fragmentShader as divergenceFragmentShader } from './shaders/fluid/divergence.js';
import { fragmentShader as pressureFragmentShader } from './shaders/fluid/pressure.js';
import { fragmentShader as clearPressureFragmentShader } from './shaders/fluid/clearPressure.js';
import { fragmentShader as gradientSubtractFragmentShader } from './shaders/fluid/gradientSubtract.js';
import { fragmentShader as curlFragmentShader } from './shaders/fluid/curl.js';
import { fragmentShader as vorticityConfinementFragmentShader } from './shaders/fluid/vorticityConfinement.js';

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

// Two render targets you ping-pong between: each pass reads `read` and
// writes into `write`, then swap() flips which one is "current". Cleared
// explicitly on creation rather than relying on implicit zero-init, since a
// stray NaN/garbage frame here would otherwise propagate through every
// subsequent step.
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

export class FluidSim {
  constructor(renderer, { simResolution = 256, pressureIterations = 14, aspect = window.innerWidth / window.innerHeight } = {}) {
    this.renderer = renderer;
    this.pressureIterations = pressureIterations;

    // A NaN/zero/negative aspect (e.g. from a video whose dimensions weren't
    // ready yet) would otherwise poison texel size and render target
    // dimensions from frame one, before any interaction happens.
    const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;

    const width = safeAspect >= 1 ? simResolution : Math.round(simResolution * safeAspect);
    const height = safeAspect >= 1 ? Math.round(simResolution / safeAspect) : simResolution;
    this.texelSize = new THREE.Vector2(1 / width, 1 / height);
    this.aspect = width / height;

    this.velocity = new DoubleFBO(renderer, width, height);
    this.pressure = new DoubleFBO(renderer, width, height);
    this.divergence = createRenderTarget(width, height);
    this.curl = createRenderTarget(width, height);

    this._splatMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uVelocity: { value: null },
        uPoint: { value: new THREE.Vector2() },
        uValue: { value: new THREE.Vector2() },
        uRadius: { value: 0.02 },
        uAspectRatio: { value: this.aspect },
      },
    });

    this._advectMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader: advectFragmentShader,
      uniforms: {
        uVelocity: { value: null },
        uSource: { value: null },
        uDt: { value: 0 },
        uDissipation: { value: 0.9995 },
      },
    });

    this._curlMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader: curlFragmentShader,
      uniforms: {
        uVelocity: { value: null },
        uTexelSize: { value: this.texelSize },
      },
    });

    this._vorticityConfinementMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader: vorticityConfinementFragmentShader,
      uniforms: {
        uVelocity: { value: null },
        uCurl: { value: null },
        uTexelSize: { value: this.texelSize },
        uCurlStrength: { value: 17 },
        uDt: { value: 0 },
      },
    });

    this._divergenceMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader: divergenceFragmentShader,
      uniforms: {
        uVelocity: { value: null },
        uTexelSize: { value: this.texelSize },
      },
    });

    this._clearPressureMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader: clearPressureFragmentShader,
      uniforms: {
        uPressure: { value: null },
        uDecay: { value: 0.3 },
      },
    });

    this._pressureMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader: pressureFragmentShader,
      uniforms: {
        uPressure: { value: null },
        uDivergence: { value: null },
        uTexelSize: { value: this.texelSize },
      },
    });

    this._gradientSubtractMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader: gradientSubtractFragmentShader,
      uniforms: {
        uVelocity: { value: null },
        uPressure: { value: null },
        uTexelSize: { value: this.texelSize },
      },
    });

    // Temporary debug aid: renders the raw velocity field to the screen so
    // we can confirm splats work before wiring up advection/pressure/composite.
    this._visualizeMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader: visualizeVelocityFragmentShader,
      uniforms: {
        uVelocity: { value: null },
        uGain: { value: 1.0 },
      },
    });

    // A reusable fullscreen quad for running each simulation pass: we swap
    // its material out per-pass and render it into a target render target
    // instead of the screen.
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

  splat(point, value, radius = 0.02) {
    const uniforms = this._splatMaterial.uniforms;
    uniforms.uVelocity.value = this.velocity.read.texture;
    uniforms.uPoint.value.copy(point);
    uniforms.uValue.value.copy(value);
    uniforms.uRadius.value = radius;

    this.runPass(this._splatMaterial, this.velocity.write);
    this.velocity.swap();
  }

  debugRenderVelocity() {
    this._visualizeMaterial.uniforms.uVelocity.value = this.velocity.read.texture;
    this.runPass(this._visualizeMaterial, null);
  }

  advectVelocity(dt) {
    const uniforms = this._advectMaterial.uniforms;
    uniforms.uVelocity.value = this.velocity.read.texture;
    uniforms.uSource.value = this.velocity.read.texture;
    // Scaled up slightly from the real dt so the flow moves a bit faster
    // across the screen, independent of dissipation (lifespan) and curl
    // strength (energy/roundness).
    uniforms.uDt.value = dt * 0.92;

    this.runPass(this._advectMaterial, this.velocity.write);
    this.velocity.swap();
  }

  computeCurl() {
    this._curlMaterial.uniforms.uVelocity.value = this.velocity.read.texture;
    this.runPass(this._curlMaterial, this.curl);
  }

  applyVorticityConfinement(dt) {
    const uniforms = this._vorticityConfinementMaterial.uniforms;
    uniforms.uVelocity.value = this.velocity.read.texture;
    uniforms.uCurl.value = this.curl.texture;
    uniforms.uDt.value = dt;

    this.runPass(this._vorticityConfinementMaterial, this.velocity.write);
    this.velocity.swap();
  }

  computeDivergence() {
    this._divergenceMaterial.uniforms.uVelocity.value = this.velocity.read.texture;
    this.runPass(this._divergenceMaterial, this.divergence);
  }

  solvePressure() {
    this._clearPressureMaterial.uniforms.uPressure.value = this.pressure.read.texture;
    this.runPass(this._clearPressureMaterial, this.pressure.write);
    this.pressure.swap();

    const uniforms = this._pressureMaterial.uniforms;
    uniforms.uDivergence.value = this.divergence.texture;
    for (let i = 0; i < this.pressureIterations; i++) {
      uniforms.uPressure.value = this.pressure.read.texture;
      this.runPass(this._pressureMaterial, this.pressure.write);
      this.pressure.swap();
    }
  }

  subtractPressureGradient() {
    const uniforms = this._gradientSubtractMaterial.uniforms;
    uniforms.uVelocity.value = this.velocity.read.texture;
    uniforms.uPressure.value = this.pressure.read.texture;

    this.runPass(this._gradientSubtractMaterial, this.velocity.write);
    this.velocity.swap();
  }

  step(dt) {
    this.computeCurl();
    this.applyVorticityConfinement(dt);
    this.advectVelocity(dt);
    this.computeDivergence();
    this.solvePressure();
    this.subtractPressureGradient();
  }
}
