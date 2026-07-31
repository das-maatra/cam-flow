import { vec4 } from 'three/tsl';
import { neighbors } from '../neighbors.js';

// How much the velocity field is expanding/compressing at each texel -- the
// right-hand side the pressure solve works to cancel out.
export const divergenceNode = ({ velocity, texelSize }) => {
    const n = neighbors(velocity, texelSize);
    const divergence = n.right.x.sub(n.left.x).add(n.top.y.sub(n.bottom.y)).mul(0.5);
    return vec4(divergence, 0, 0, 1);
};
