import { uv, vec2, vec4, abs, clamp, length } from 'three/tsl';
import { neighbors } from '../neighbors.js';

// Re-injects the small-scale swirl that semi-Lagrangian advection smears away.
export const vorticityConfinementNode = ({ velocity, curl, texelSize, curlStrength, dt }) => {
    const n = neighbors(curl, texelSize);
    const left = abs(n.left.x);
    const right = abs(n.right.x);
    const bottom = abs(n.bottom.x);
    const top = abs(n.top.x);
    const center = n.center.x;

    // Larger epsilon than the textbook formula: with a near-zero epsilon, any
    // tiny grid-noise gradient gets normalized up to full strength every frame,
    // which is what made the curls look noisy/jagged instead of round -- and
    // fed a runaway energy increase. This epsilon suppresses weak/noisy
    // gradients while still fully confining strong, coherent ones.
    const raw = vec2(top.sub(bottom), right.sub(left)).mul(0.5);
    const normalized = raw.div(length(raw).add(0.05)).mul(curlStrength.mul(center));
    const force = vec2(normalized.x, normalized.y.negate());

    // Vorticity confinement is a feedback loop -- it re-injects energy
    // proportional to existing curl every single frame, forever. Without the
    // 0.99 counterweight here, that loop can slowly accumulate over a long
    // session (not just from new splats) until it saturates the clamp across
    // the whole field, which is what caused the "explodes into noise after a
    // while, starting from a random spot" bug.
    const next = velocity.sample(uv()).xy.add(force.mul(dt)).mul(0.99);
    return vec4(clamp(next, vec2(-12), vec2(12)), 0, 1);
};
