import * as THREE from 'three/webgpu';
import { texture, uniform } from 'three/tsl';
import { createRenderTarget, DoubleFBO } from './DoubleFBO.js';
import { splatNode } from './shaders/fluid/splat.js';
import { advectNode } from './shaders/fluid/advect.js';
import { curlNode } from './shaders/fluid/curl.js';
import { vorticityConfinementNode } from './shaders/fluid/vorticityConfinement.js';
import { divergenceNode } from './shaders/fluid/divergence.js';
import { clearPressureNode } from './shaders/fluid/clearPressure.js';
import { pressureNode } from './shaders/fluid/pressure.js';
import { gradientSubtractNode } from './shaders/fluid/gradientSubtract.js';

// A fullscreen pass material. NodeMaterial replaces the old ShaderMaterial +
// hand-written passthrough vertex shader -- QuadMesh supplies the geometry and
// the trivial vertex stage, so only the fragment graph has to be described.
function createPassMaterial(fragmentNode) {
  const material = new THREE.NodeMaterial();
  material.fragmentNode = fragmentNode;
  material.depthTest = false;
  material.depthWrite = false;
  return material;
}

export class FluidSim {
  constructor(renderer, { simResolution = 256, pressureIterations = 20, aspect = window.innerWidth / window.innerHeight } = {}) {
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

    this.velocity = new DoubleFBO(width, height);
    this.pressure = new DoubleFBO(width, height);
    this.divergence = createRenderTarget(width, height);
    this.curl = createRenderTarget(width, height);

    // Uniform and texture nodes are built once and mutated per pass -- the
    // node graph itself is compiled a single time, exactly like the old
    // uniform objects were reused across frames.
    const texelSize = uniform(this.texelSize);
    const aspectUniform = uniform(this.aspect);

    this._u = {
      splatVelocity: texture(this.velocity.read.texture),
      splatPoint: uniform(new THREE.Vector2()),
      splatValue: uniform(new THREE.Vector2()),
      splatRadius: uniform(0.02),

      advectVelocity: texture(this.velocity.read.texture),
      advectSource: texture(this.velocity.read.texture),
      advectDt: uniform(0),
      advectDissipation: uniform(0.997),

      curlVelocity: texture(this.velocity.read.texture),

      vorticityVelocity: texture(this.velocity.read.texture),
      vorticityCurl: texture(this.curl.texture),
      vorticityStrength: uniform(17),
      vorticityDt: uniform(0),

      divergenceVelocity: texture(this.velocity.read.texture),

      clearPressure: texture(this.pressure.read.texture),
      clearDecay: uniform(0.3),

      pressure: texture(this.pressure.read.texture),
      pressureDivergence: texture(this.divergence.texture),

      gradientVelocity: texture(this.velocity.read.texture),
      gradientPressure: texture(this.pressure.read.texture),
    };

    // Live-tunable from the UI slider -- scales how fast the flow drifts
    // across the screen, on top of the tuned base advection speed.
    this.speedMultiplier = 1;

    this._splatMaterial = createPassMaterial(splatNode({
      velocity: this._u.splatVelocity,
      point: this._u.splatPoint,
      value: this._u.splatValue,
      radius: this._u.splatRadius,
      aspect: aspectUniform,
    }));

    this._advectMaterial = createPassMaterial(advectNode({
      velocity: this._u.advectVelocity,
      source: this._u.advectSource,
      dt: this._u.advectDt,
      dissipation: this._u.advectDissipation,
    }));

    this._curlMaterial = createPassMaterial(curlNode({
      velocity: this._u.curlVelocity,
      texelSize,
    }));

    this._vorticityConfinementMaterial = createPassMaterial(vorticityConfinementNode({
      velocity: this._u.vorticityVelocity,
      curl: this._u.vorticityCurl,
      texelSize,
      curlStrength: this._u.vorticityStrength,
      dt: this._u.vorticityDt,
    }));

    this._divergenceMaterial = createPassMaterial(divergenceNode({
      velocity: this._u.divergenceVelocity,
      texelSize,
    }));

    this._clearPressureMaterial = createPassMaterial(clearPressureNode({
      pressure: this._u.clearPressure,
      decay: this._u.clearDecay,
    }));

    this._pressureMaterial = createPassMaterial(pressureNode({
      pressure: this._u.pressure,
      divergence: this._u.pressureDivergence,
      texelSize,
    }));

    this._gradientSubtractMaterial = createPassMaterial(gradientSubtractNode({
      velocity: this._u.gradientVelocity,
      pressure: this._u.gradientPressure,
      texelSize,
    }));

    this._quad = new THREE.QuadMesh();
  }

  // Leaves the render target bound rather than unbinding after every pass --
  // step() runs 26 of these, and the old code paid for an unbind on each one
  // when only the final reset before screen rendering actually matters.
  runPass(material, target) {
    this._quad.material = material;
    this.renderer.setRenderTarget(target);
    this._quad.render(this.renderer);
  }

  splat(point, value, radius = 0.02) {
    this._u.splatVelocity.value = this.velocity.read.texture;
    this._u.splatPoint.value.copy(point);
    this._u.splatValue.value.copy(value);
    this._u.splatRadius.value = radius;

    this.runPass(this._splatMaterial, this.velocity.write);
    this.velocity.swap();
    this.renderer.setRenderTarget(null);
  }

  advectVelocity(dt) {
    this._u.advectVelocity.value = this.velocity.read.texture;
    this._u.advectSource.value = this.velocity.read.texture;
    // Scaled down from the real dt so the flow drifts across the screen at a
    // slower, more graceful pace, independent of dissipation (lifespan) and
    // curl strength (energy/roundness). speedMultiplier is the live UI knob
    // on top of that tuned base pace.
    this._u.advectDt.value = dt * 0.6 * this.speedMultiplier;

    this.runPass(this._advectMaterial, this.velocity.write);
    this.velocity.swap();
  }

  computeCurl() {
    this._u.curlVelocity.value = this.velocity.read.texture;
    this.runPass(this._curlMaterial, this.curl);
  }

  applyVorticityConfinement(dt) {
    this._u.vorticityVelocity.value = this.velocity.read.texture;
    this._u.vorticityCurl.value = this.curl.texture;
    this._u.vorticityDt.value = dt;

    this.runPass(this._vorticityConfinementMaterial, this.velocity.write);
    this.velocity.swap();
  }

  computeDivergence() {
    this._u.divergenceVelocity.value = this.velocity.read.texture;
    this.runPass(this._divergenceMaterial, this.divergence);
  }

  solvePressure() {
    this._u.clearPressure.value = this.pressure.read.texture;
    this.runPass(this._clearPressureMaterial, this.pressure.write);
    this.pressure.swap();

    this._u.pressureDivergence.value = this.divergence.texture;
    for (let i = 0; i < this.pressureIterations; i++) {
      this._u.pressure.value = this.pressure.read.texture;
      this.runPass(this._pressureMaterial, this.pressure.write);
      this.pressure.swap();
    }
  }

  subtractPressureGradient() {
    this._u.gradientVelocity.value = this.velocity.read.texture;
    this._u.gradientPressure.value = this.pressure.read.texture;

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
    this.renderer.setRenderTarget(null);
  }
}
