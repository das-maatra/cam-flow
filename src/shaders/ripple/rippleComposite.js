import { uv, vec2, vec3, vec4, clamp, length, mix, sin } from 'three/tsl';
import { neighbors } from '../neighbors.js';

// Ripple mode's screen pass: refracts the camera image through the wave
// surface, with an amplitude-scaled RGB split.
export const rippleCompositeNode = ({
    video, rippleState, texelSize, time, splitStrength, personMask,
}) => {
    // Surface gradient of the wave height -> UV displacement (refraction look)
    const w = neighbors(rippleState, texelSize);
    const disp = vec2(w.left.r.sub(w.right.r), w.bottom.r.sub(w.top.r)).mul(4);
    const distortedUv = clamp(uv().add(disp), 0.001, 0.999);

    // How much ripple is at this point -- scales the RGB split like composite.js
    // does with fluid velocity.
    const rippleAmount = clamp(length(disp).mul(10), 0, 1);
    const splitOffset = sin(time).mul(splitStrength).mul(rippleAmount);

    const r = video.sample(distortedUv.add(vec2(splitOffset, 0))).r;
    const g = video.sample(distortedUv).g;
    const b = video.sample(distortedUv.sub(vec2(splitOffset, 0))).b;

    // Wherever the person mask says "arm/body", show the plain undistorted
    // video instead of the effect -- keeps the person reading as a clean
    // layer sitting on top of the ripples rather than being warped by them.
    const personAmount = personMask.sample(uv()).r;
    const color = mix(vec3(r, g, b), video.sample(uv()).rgb, personAmount);

    return vec4(color, 1);
};
