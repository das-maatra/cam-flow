import { uv, vec4 } from 'three/tsl';

// Decays the previous frame's pressure instead of zeroing it -- warm-starting
// the Jacobi solve from a decayed guess converges faster than starting cold.
export const clearPressureNode = ({ pressure, decay }) =>
    vec4(pressure.sample(uv()).x.mul(decay), 0, 0, 1);
