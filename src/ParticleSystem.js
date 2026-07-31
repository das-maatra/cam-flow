import * as THREE from 'three';
import { vertexShader, fragmentShader } from './shaders/particles/particles.js';

const DEFAULT_COUNT = 5000;

// Plastic constant -- the 2D analogue of the golden ratio, and the basis of
// the R2 low-discrepancy sequence used to scatter particles below.
const PHI_2 = 1.324717957244746;

// Scatters `count` points over the unit square. Plain Math.random() clumps
// badly at this density (visible voids next to clusters), while a plain grid
// reads as an obvious lattice. R2 is a low-discrepancy sequence: it fills
// evenly at any count, with no lattice and no clumping. Deterministic on
// purpose, so the layout is identical across reloads.
function scatterR2(count) {
    const a1 = 1 / PHI_2;
    const a2 = 1 / (PHI_2 * PHI_2);
    const points = [];
    for (let i = 0; i < count; i++) {
        points.push({
            x: (0.5 + a1 * i) % 1,
            y: (0.5 + a2 * i) % 1,
        });
    }
    return points;
}

export class ParticleSystem {
    constructor({ count = DEFAULT_COUNT } = {}) {
        this.count = count;
        this.enabled = true;

        const positions = new Float32Array(count * 3);
        const seeds = new Float32Array(count);

        // Rest positions are laid out directly in the quad's local space
        // (-1..1), so the vertex shader can recover a 0..1 UV -- and the
        // ripple field it samples -- with a plain remap.
        scatterR2(count).forEach((p, i) => {
            positions[i * 3] = p.x * 2 - 1;
            positions[i * 3 + 1] = p.y * 2 - 1;
            positions[i * 3 + 2] = 0;
            // Cheap per-particle hash -- avoids a second random stream while
            // staying uncorrelated with position. Taken as a true fractional
            // part rather than `% 1`, which keeps the sign in JS and would
            // hand the shader negative seeds: those shrink a particle's point
            // size past zero and silently drop it from the draw.
            const hash = Math.sin(i * 12.9898) * 43758.5453;
            seeds[i] = hash - Math.floor(hash);
        });

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

        // Stand-in until the first ripple step produces a real texture --
        // an all-zero field means "flat water", which is the correct rest
        // state, rather than leaving the sampler unbound.
        const blankState = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
        blankState.needsUpdate = true;

        this.material = new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms: {
                uRippleState: { value: blankState },
                uRippleTexelSize: { value: new THREE.Vector2() },
                uBaseSize: { value: 3.5 },
                // Both zero for now: particles spawn and hold station. Raising
                // these is what turns on the wave response -- uDisplacement
                // pushes particles along the surface slope, uWaveScale swells
                // them where the wave is high.
                uWaveScale: { value: 0 },
                uDisplacement: { value: 0 },
                uColor: { value: new THREE.Color(0xffffff) },
                uOpacity: { value: 0.55 },
            },
            transparent: true,
            // Additive so particles read as glints of light on the water
            // rather than opaque specks pasted over the video.
            blending: THREE.AdditiveBlending,
            depthTest: false,
            depthWrite: false,
        });

        this.points = new THREE.Points(geometry, this.material);
        this.points.visible = this.enabled;
        // The quad is scaled well past the unit box by fitToVideo(), and
        // three culls against an unscaled bounding sphere it infers from the
        // raw positions -- without this the whole field pops out of view at
        // certain fits.
        this.points.frustumCulled = false;
    }

    setEnabled(enabled) {
        this.enabled = enabled;
        this.points.visible = enabled;
    }

    // Feeds the current wave field in each frame. Cheap enough to run even
    // while hidden, but skipped when off to keep the toggle genuinely free.
    update(rippleSim) {
        if (!this.enabled) return;
        this.material.uniforms.uRippleState.value = rippleSim.state.read.texture;
        this.material.uniforms.uRippleTexelSize.value.copy(rippleSim.texelSize);
    }
}
