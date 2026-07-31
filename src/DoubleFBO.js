import * as THREE from 'three/webgpu';

// Shared ping-pong render-target plumbing. Both simulations need exactly the
// same thing -- a pair of float targets to alternate between -- and each used
// to carry its own byte-identical copy of this.
//
// This lives in src/ rather than shaders/ because it owns GPU resources: the
// shaders/ tree is stateless node graphs only.

// Half-float rather than 8-bit: velocity, pressure and wave height are signed
// and routinely fall outside 0..1, so a normalised format would clip them.
export function createRenderTarget(width, height) {
  const target = new THREE.RenderTarget(width, height, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false,
    stencilBuffer: false,
  });
  // These hold raw simulation data, not colour -- tagging them NoColorSpace
  // keeps the node pipeline from applying an sRGB conversion to the velocity,
  // pressure and wave fields on the way in or out.
  target.texture.colorSpace = THREE.NoColorSpace;
  return target;
}

// Two render targets you ping-pong between: each pass reads `read` and writes
// into `write`, then swap() flips which one is "current". Needed because a
// GPU pass cannot sample the same texture it is rendering into.
export class DoubleFBO {
  constructor(width, height) {
    this.read = createRenderTarget(width, height);
    this.write = createRenderTarget(width, height);
  }

  swap() {
    [this.read, this.write] = [this.write, this.read];
  }
}
