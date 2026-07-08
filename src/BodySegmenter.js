import * as THREE from 'three';
import { ImageSegmenter, FilesetResolver } from '@mediapipe/tasks-vision';

// Segmentation is the most expensive thing running per-frame alongside hand
// tracking and the fluid solver -- only actually run inference every Nth
// frame and reuse the last mask in between. A body doesn't move fast enough
// for the staleness to be visible, and this roughly divides its cost by N.
const SEGMENT_EVERY_N_FRAMES = 6;

export class BodySegmenter {
    constructor() {
        this.imageSegmenter = null;
        this.texture = null;
        this.frameCount = 0;
        this.enabled = false; // off by default -- toggled from the UI
    }

    setEnabled(enabled) {
        this.enabled = enabled;
        if (!enabled && this.texture) {
            // Clear any mask from before it was turned off -- otherwise the
            // last-detected person shape would stay "unmasked" forever
            // instead of the effect covering everyone again.
            this.texture.image.data.fill(0);
            this.texture.needsUpdate = true;
        }
    }

    async init() {
        const assetBase = `${import.meta.env.BASE_URL}mediapipe`;
        const vision = await FilesetResolver.forVisionTasks(`${assetBase}/wasm`);

        this.imageSegmenter = await ImageSegmenter.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: `${assetBase}/selfie_segmenter.tflite`,
                // CPU rather than GPU: the GPU is already contended by the
                // fluid solver and hand tracking, and pulling a GPU-delegate
                // result back to CPU (getAsUint8Array() below) forces a
                // pipeline stall waiting on the GPU every call. CPU delegate
                // produces CPU-side output natively, avoiding that stall.
                delegate: 'CPU',
            },
            runningMode: 'VIDEO',
            outputCategoryMask: false,
            outputConfidenceMasks: true,
        });
    }

    // Runs segmentation on the current video frame and returns a texture
    // holding the person-probability mask (1 = person, 0 = background), or
    // null before the first usable frame. The texture is reused and mutated
    // in place every call -- callers must consume it before calling again,
    // not hold onto it across frames.
    segment(video) {
        if (!this.enabled || video.readyState < 2 || !this.imageSegmenter) {
            return this.texture;
        }

        this.frameCount++;
        if (this.frameCount % SEGMENT_EVERY_N_FRAMES !== 0) {
            return this.texture;
        }

        const result = this.imageSegmenter.segmentForVideo(video, performance.now());
        const mask = result.confidenceMasks?.[0];
        if (!mask) return null;

        // MPMasks are owned by the WASM heap and must be closed every call
        // or they leak -- pull the data out and close it immediately. Close
        // every mask in the result, not just the one we use, in case this
        // model ever returns more than one.
        const data = mask.getAsUint8Array();
        const { width, height } = mask;
        result.confidenceMasks.forEach((m) => m.close());

        if (!this.texture || this.texture.image.width !== width || this.texture.image.height !== height) {
            this.texture?.dispose();
            this.texture = new THREE.DataTexture(data, width, height, THREE.RedFormat, THREE.UnsignedByteType);
            // DataTexture defaults flipY to false, but VideoTexture (uVideo
            // in the composite shaders) defaults it to true -- without
            // matching that, the mask would line up upside-down against the
            // video it's meant to mask.
            this.texture.flipY = true;
        } else {
            this.texture.image.data.set(data);
        }
        this.texture.needsUpdate = true;

        return this.texture;
    }
}
