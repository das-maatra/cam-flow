import { uv, vec2, vec4 } from 'three/tsl';
import { neighbors } from '../neighbors.js';

// Subtracts the pressure gradient from the velocity field, leaving it
// divergence-free -- the step that actually makes the flow incompressible.
export const gradientSubtractNode = ({ velocity, pressure, texelSize }) => {
    const n = neighbors(pressure, texelSize);
    const gradient = vec2(n.right.x.sub(n.left.x), n.top.x.sub(n.bottom.x)).mul(0.5);
    return vec4(velocity.sample(uv()).xy.sub(gradient), 0, 1);
};
