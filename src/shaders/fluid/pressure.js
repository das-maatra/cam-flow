import { uv, vec4 } from 'three/tsl';
import { neighbors } from '../neighbors.js';

// One Jacobi iteration of the pressure Poisson solve.
export const pressureNode = ({ pressure, divergence, texelSize }) => {
    const n = neighbors(pressure, texelSize);
    const sum = n.left.x.add(n.right.x).add(n.bottom.x).add(n.top.x);
    const next = sum.sub(divergence.sample(uv()).x).mul(0.25);
    return vec4(next, 0, 0, 1);
};
