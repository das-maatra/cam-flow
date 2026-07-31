import { vec4 } from 'three/tsl';
import { neighbors } from '../neighbors.js';

// Scalar vorticity of the velocity field -- how much it rotates at each texel.
export const curlNode = ({ velocity, texelSize }) => {
    const n = neighbors(velocity, texelSize);
    const curl = n.right.y.sub(n.left.y).sub(n.top.x.sub(n.bottom.x)).mul(0.5);
    return vec4(curl, 0, 0, 1);
};
