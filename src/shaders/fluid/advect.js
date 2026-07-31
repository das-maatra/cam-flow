import { uv } from 'three/tsl';

// Semi-Lagrangian advection: trace backwards along the velocity field and
// sample whatever was there, fading by the dissipation factor.
export const advectNode = ({ velocity, source, dt, dissipation }) => {
    const coord = uv().sub(velocity.sample(uv()).xy.mul(dt));
    return source.sample(coord).mul(dissipation);
};
