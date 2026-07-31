import { uv, vec2, vec4, exp, dot } from 'three/tsl';

// Adds a gaussian blob of velocity into the existing field.
export const splatNode = ({ velocity, point, value, radius, aspect }) => {
    const d = uv().sub(point);
    // Aspect-corrected so the blob stays round on a non-square sim grid.
    const p = vec2(d.x.mul(aspect), d.y);
    const falloff = exp(dot(p, p).div(radius).negate());
    return vec4(velocity.sample(uv()).xy.add(value.mul(falloff)), 0, 1);
};
