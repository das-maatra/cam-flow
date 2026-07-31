import { Fn, If, Loop, uv, vec2, vec4, float, length, oneMinus } from 'three/tsl';

// One step of the wave equation, plus this frame's queued drops.
//
// The old GLSL version generated 40 unrolled `if (uDropCount > i)` blocks with
// literal indices, because GLSL ES 1.00 drivers could silently mis-handle
// dynamic indexing into a uniform array. WGSL has no such defect, so this is a
// plain loop over the drop arrays -- the unrolling machinery is gone.
export const rippleSimNode = ({
    state, texelSize, dropPoints, dropRadii, dropStrengths, dropCount, aspect, smoothing,
}) => Fn(() => {
    const ts = texelSize;

    // R = current height, G = previous height
    const centre = state.sample(uv());
    const curr = centre.r;
    const prev = centre.g;

    const n = state.sample(uv().add(vec2(0, ts.y))).r;
    const s = state.sample(uv().sub(vec2(0, ts.y))).r;
    const e = state.sample(uv().add(vec2(ts.x, 0))).r;
    const w = state.sample(uv().sub(vec2(ts.x, 0))).r;
    const ne = state.sample(uv().add(vec2(ts.x, ts.y))).r;
    const nw = state.sample(uv().add(vec2(ts.x.negate(), ts.y))).r;
    const se = state.sample(uv().add(vec2(ts.x, ts.y.negate()))).r;
    const sw = state.sample(uv().sub(vec2(ts.x, ts.y))).r;

    // 8-neighbour weighted average (diagonals at half weight, normalised by 6)
    const avg = n.add(s).add(e).add(w)
        .add(ne.add(nw).add(se).add(sw).mul(0.5))
        .div(6);

    const next = smoothing.mul(avg)
        .add(float(2).sub(smoothing).mul(curr))
        .sub(prev)
        .mul(0.92)
        .toVar();

    Loop(dropCount, ({ i }) => {
        const d = uv().sub(dropPoints.element(i));
        const p = vec2(d.x.mul(aspect), d.y);
        const dist = length(p);
        const radius = dropRadii.element(i);
        If(dist.lessThan(radius), () => {
            next.addAssign(dropStrengths.element(i).mul(oneMinus(dist.div(radius))));
        });
    });

    return vec4(next, curr, 0, 1);
})();
