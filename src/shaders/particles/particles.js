import { attribute, positionGeometry, uv, vec2, vec3, float, length, smoothstep } from 'three/tsl';

// Unlike the fluid/ripple passes -- which each return a single fragment node --
// a particle needs both a vertex and a fragment contribution, so this returns
// the pair the material assigns to positionNode/opacityNode.
export const particleNodes = ({
    rippleState, rippleTexelSize, baseSize, waveScale, displacement, opacity, pixelToLocal,
}) => {
    const restPos = attribute('aRest', 'vec2');
    const seed = attribute('aSeed', 'float');

    // Particles are a child of the video quad, so rest positions already live
    // in the quad's local space (-1..1). That makes the UV used to sample the
    // ripple field a plain remap -- the same space the composite passes sample
    // the video and ripple state in, so a particle lines up with the wave
    // underneath it.
    const particleUv = restPos.mul(0.5).add(0.5);

    const wave = rippleState.sample(particleUv).r;
    const ts = rippleTexelSize;
    const wE = rippleState.sample(particleUv.add(vec2(ts.x, 0))).r;
    const wW = rippleState.sample(particleUv.sub(vec2(ts.x, 0))).r;
    const wN = rippleState.sample(particleUv.add(vec2(0, ts.y))).r;
    const wS = rippleState.sample(particleUv.sub(vec2(0, ts.y))).r;
    const slope = vec2(wW.sub(wE), wS.sub(wN));

    // Per-particle size variation keeps the field from reading as a uniform
    // stipple pattern.
    const size = baseSize
        .mul(float(0.6).add(seed.mul(0.8)))
        .mul(float(1).add(wave.mul(waveScale)));

    const centre = restPos.add(slope.mul(displacement));
    // positionGeometry is the unit quad's own corner (+/-0.5); pixelToLocal
    // converts the pixel size into the parent's local units per axis.
    const corner = positionGeometry.xy.mul(size).mul(pixelToLocal);

    return {
        position: vec3(centre.add(corner), 0),
        // Flat white; the additive blend is what gives them their glint.
        color: vec3(1, 1, 1),
        // The quad's own uv runs 0..1 across the sprite -- carve a soft-edged
        // disc out of it so particles read as round dust rather than squares.
        opacity: smoothstep(0.5, 0.3, length(uv().sub(0.5)))
            .mul(opacity)
            .mul(float(0.5).add(seed.mul(0.5))),
    };
};
