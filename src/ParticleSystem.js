import * as THREE from 'three/webgpu';
import { texture, uniform } from 'three/tsl';
import { particleNodes } from './shaders/particles/particles.js';

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

// Particles are instanced quads rather than THREE.Points. WebGPU has no
// sized point primitive -- it rasterises point-list topology at exactly one
// pixel, and there is no gl_PointCoord equivalent in WGSL, so three's
// `pointUV` node emits GLSL that will not compile there. One unit quad drawn
// `count` times sidesteps both limits and costs nothing at this scale.
export class ParticleSystem {
    constructor({ count = DEFAULT_COUNT } = {}) {
        this.count = count;
        this.enabled = true;

        const rest = new Float32Array(count * 2);
        const seeds = new Float32Array(count);

        // Rest positions are laid out directly in the parent quad's local
        // space (-1..1), so the shader can recover a 0..1 UV -- and the ripple
        // field it samples -- with a plain remap.
        scatterR2(count).forEach((p, i) => {
            rest[i * 2] = p.x * 2 - 1;
            rest[i * 2 + 1] = p.y * 2 - 1;
            // Cheap per-particle hash -- avoids a second random stream while
            // staying uncorrelated with position. Taken as a true fractional
            // part rather than `% 1`, which keeps the sign in JS and would
            // hand the shader negative seeds: those shrink a particle past
            // zero size and silently drop it from the draw.
            const hash = Math.sin(i * 12.9898) * 43758.5453;
            seeds[i] = hash - Math.floor(hash);
        });

        // A single unit quad (corners at +/-0.5, uv 0..1), instanced per
        // particle. No billboarding needed: the whole scene is a flat plane
        // viewed through an orthographic camera, so the quad already faces us.
        const source = new THREE.PlaneGeometry(1, 1);
        const geometry = new THREE.InstancedBufferGeometry();
        geometry.index = source.index;
        geometry.setAttribute('position', source.attributes.position);
        geometry.setAttribute('uv', source.attributes.uv);
        geometry.setAttribute('aRest', new THREE.InstancedBufferAttribute(rest, 2));
        geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
        geometry.instanceCount = count;

        // Stand-in until the first ripple step produces a real texture --
        // an all-zero field means "flat water", which is the correct rest
        // state, rather than leaving the sampler unbound.
        const blankState = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
        blankState.needsUpdate = true;

        this._rippleState = texture(blankState);
        this._rippleTexelSize = uniform(new THREE.Vector2());
        this._baseSize = uniform(3.5);
        // Converts a size in device pixels into parent-quad local units, per
        // axis. The parent is scaled non-uniformly by fitToVideo() (and
        // flipped by mirror()), which would otherwise stretch every particle
        // into an ellipse -- dividing it back out keeps them round and a
        // constant size on screen, which is what gl_PointSize used to do for
        // free. Refreshed each frame in update().
        this._pixelToLocal = uniform(new THREE.Vector2(0, 0));
        // Both zero for now: particles spawn and hold station. Raising these
        // is what turns on the wave response -- displacement pushes particles
        // along the surface slope, waveScale swells them where the wave is high.
        this._waveScale = uniform(0);
        this._displacement = uniform(0);
        this._opacity = uniform(0.55);

        const { position, color, opacity } = particleNodes({
            rippleState: this._rippleState,
            rippleTexelSize: this._rippleTexelSize,
            baseSize: this._baseSize,
            waveScale: this._waveScale,
            displacement: this._displacement,
            opacity: this._opacity,
            pixelToLocal: this._pixelToLocal,
        });

        this.material = new THREE.NodeMaterial();
        this.material.positionNode = position;
        this.material.opacityNode = opacity;
        this.material.colorNode = color;
        this.material.transparent = true;
        // Additive so particles read as glints of light on the water rather
        // than opaque specks pasted over the video.
        this.material.blending = THREE.AdditiveBlending;
        this.material.depthTest = false;
        this.material.depthWrite = false;

        this.mesh = new THREE.Mesh(geometry, this.material);
        this.mesh.visible = this.enabled;
        // positionNode places every instance from an attribute, so the
        // bounding volume three infers from the base quad is meaningless --
        // without this the whole field pops out of view.
        this.mesh.frustumCulled = false;
    }

    setEnabled(enabled) {
        this.enabled = enabled;
        this.mesh.visible = enabled;
    }

    // Feeds the current wave field and the parent's on-screen scale. Skipped
    // when off so the toggle is genuinely free.
    update(rippleSim, sceneRenderer) {
        if (!this.enabled) return;
        this._rippleState.value = rippleSim.state.read.texture;
        this._rippleTexelSize.value.copy(rippleSim.texelSize);

        // The orthographic camera spans 2 world units vertically across the
        // full canvas height, so one device pixel is 2/height world units --
        // then divided by the parent's scale to land in local units. abs()
        // because mirror() makes scale.x negative, and a negative size would
        // fold each quad inside out.
        const { scale } = sceneRenderer.quad;
        const height = sceneRenderer.renderer.domElement.height || 1;
        this._pixelToLocal.value.set(
            2 / (Math.abs(scale.x) * height),
            2 / (Math.abs(scale.y) * height),
        );
    }
}
