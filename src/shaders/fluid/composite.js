import { uv, vec2, vec3, vec4, clamp, length, mix, sin } from 'three/tsl';
import { neighbors } from '../neighbors.js';

// Fluid/combined mode's screen pass: warps the camera image by the velocity
// field, layers the ripple field's refraction on top, and punches the person
// back through undistorted.
export const compositeNode = ({
    video, velocity, rippleState, rippleTexelSize, rippleStrength,
    strength, time, splitStrength, tintStrength, personMask,
}) => {
    const vel = velocity.sample(uv()).xy;

    // A subtle secondary displacement from the same wave-equation sim ripple
    // mode uses -- it decays slower and more gracefully than the velocity
    // field, so it gives the fluid a lingering "trailing" quality instead of
    // just vanishing once the velocity dissipates.
    const w = neighbors(rippleState, rippleTexelSize);
    const rippleDisp = vec2(w.left.r.sub(w.right.r), w.bottom.r.sub(w.top.r)).mul(rippleStrength);

    const distortedUv = clamp(uv().add(vel.mul(strength)).add(rippleDisp), 0.001, 0.999);

    // How much fluid is at this point -- 0 where the water is still (no split,
    // looks like plain video), ramping to 1 where the flow is strong.
    const fluidAmount = clamp(length(vel), 0, 1);

    // A horizontal offset that drifts back and forth over time, scaled by how
    // much fluid is present so the split only shows up where the water is.
    const splitOffset = sin(time).mul(splitStrength).mul(fluidAmount);

    const r = video.sample(distortedUv.add(vec2(splitOffset, 0))).r;
    const g = video.sample(distortedUv).g;
    const b = video.sample(distortedUv.sub(vec2(splitOffset, 0))).b;

    // Teal <-> blue tint that slowly drifts over time, masked by fluidAmount so
    // it only shows up where the fluid is actually moving (helps read where
    // the effect is versus still video) and blended in at low opacity so the
    // video underneath stays clearly visible.
    const tintPhase = sin(time.mul(0.3)).mul(0.5).add(0.5);
    const tint = mix(vec3(0.0, 0.6, 0.55), vec3(0.05, 0.35, 0.9), tintPhase);

    const tinted = mix(vec3(r, g, b), tint, tintStrength.mul(fluidAmount));

    // Wherever the person mask says "arm/body", show the plain undistorted
    // video instead of the effect -- keeps the person reading as a clean
    // layer sitting on top of the fluid rather than being warped by it.
    const personAmount = personMask.sample(uv()).r;
    const color = mix(tinted, video.sample(uv()).rgb, personAmount);

    return vec4(color, 1);
};
