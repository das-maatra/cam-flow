// How long to accumulate before refreshing the readout. Per-frame numbers
// jitter far too much to read; half a second is steady enough to look at
// while still reacting fast enough to catch a drop as it happens.
const UPDATE_INTERVAL_MS = 500;

// Frame-rate thresholds for the colour of the readout.
const GOOD_FPS = 50;
const FAIR_FPS = 30;

const STAGES = ['hands', 'seg', 'sim', 'draw'];

export class FpsMeter {
    constructor(element) {
        this.element = element;
        this.enabled = true;

        this._fpsEl = element.querySelector('.fps-rate');
        this._detailEl = element.querySelector('.fps-detail');
        this._stagesEl = element.querySelector('.fps-stages');

        this._reset();
        element.classList.toggle('visible', this.enabled);
    }

    _reset() {
        this._frames = 0;
        this._intervalMs = 0;
        this._cpuMs = 0;
        this._peakMs = 0;
        this._stages = { hands: 0, seg: 0, sim: 0, draw: 0 };
    }

    setEnabled(enabled) {
        this.enabled = enabled;
        this.element.classList.toggle('visible', enabled);
    }

    // `realDt` is the unclamped gap since the previous frame, in seconds --
    // the same value HandSplatter uses. `cpuMs` is how long this frame's work
    // occupied the main thread, and `stages` breaks that down.
    //
    // Frame time and CPU time measure different things and that distinction is
    // the point: frame time is pinned to the display's refresh rate whenever
    // the app is keeping up, so it only reveals a problem once one exists. CPU
    // time keeps falling as things get cheaper, so it shows the headroom left
    // before a drop.
    //
    // Caveat on `draw`: under WebGPU that call only *encodes* commands, so
    // this is main-thread cost, not GPU execution time. A stage total well
    // below the frame time means the GPU is the one behind.
    update(realDt, cpuMs, stages) {
        if (!this.enabled) return;

        const frameMs = realDt * 1000;
        this._frames++;
        this._intervalMs += frameMs;
        this._cpuMs += cpuMs;
        this._peakMs = Math.max(this._peakMs, frameMs);
        STAGES.forEach((s) => { this._stages[s] += stages[s] ?? 0; });

        if (this._intervalMs < UPDATE_INTERVAL_MS) return;

        const avgFrameMs = this._intervalMs / this._frames;
        const avgCpuMs = this._cpuMs / this._frames;
        const fps = 1000 / avgFrameMs;

        this._fpsEl.textContent = `${Math.round(fps)} fps`;
        this._detailEl.textContent =
            `frame ${avgFrameMs.toFixed(1)} · cpu ${avgCpuMs.toFixed(1)} · peak ${this._peakMs.toFixed(0)} ms`;
        this._stagesEl.textContent = STAGES
            .map((s) => `${s} ${(this._stages[s] / this._frames).toFixed(1)}`)
            .join(' · ');

        this.element.dataset.level = fps >= GOOD_FPS ? 'good' : fps >= FAIR_FPS ? 'fair' : 'poor';

        this._reset();
    }
}
