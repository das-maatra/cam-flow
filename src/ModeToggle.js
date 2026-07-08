const TAP_WINDOW_MS = 500; // taps must land within this window of each other to count as one gesture
const DOUBLE_TAP_WINDOW_MS = 300; // max gap between two taps to count as a double-tap
const MODES = ['fluid', 'ripple', 'combined'];

export class ModeToggle {
  constructor({ initialMode = 'ripple', onChange } = {}) {
    this.mode = initialMode;
    this.onChange = onChange;
    this.doubleTapEnabled = false; // off by default -- toggled from the UI

    this._tapCount = 0;
    this._tapTimer = null;
    this._lastTapTime = 0;

    this._panel = document.getElementById('mode-panel');
    this._fluidBtn = document.getElementById('mode-fluid');
    this._rippleBtn = document.getElementById('mode-ripple');
    this._combinedBtn = document.getElementById('mode-combined');
    this._panelToggleBtn = document.getElementById('panel-toggle');
    this._doubleTapBtn = document.getElementById('double-tap-toggle');

    this._fluidBtn.addEventListener('click', () => this._select('fluid'));
    this._rippleBtn.addEventListener('click', () => this._select('ripple'));
    this._combinedBtn.addEventListener('click', () => this._select('combined'));
    this._panelToggleBtn.addEventListener('click', () => this._togglePanel());
    this._doubleTapBtn.addEventListener('click', () => {
      this.doubleTapEnabled = !this.doubleTapEnabled;
      this._doubleTapBtn.classList.toggle('active', this.doubleTapEnabled);
    });
    document.addEventListener('pointerdown', () => this._registerTap());

    this._updateButtons();
  }

  _togglePanel() {
    this._panel.classList.toggle('visible');
  }

  _registerTap() {
    // Double-tap anywhere on screen cycles fluid -> ripple -> combined, but
    // only when explicitly enabled -- independent of the
    // triple-tap-to-reveal-panel count below.
    if (this.doubleTapEnabled) {
      const now = performance.now();
      if (now - this._lastTapTime < DOUBLE_TAP_WINDOW_MS) {
        this._lastTapTime = 0;
        const next = MODES[(MODES.indexOf(this.mode) + 1) % MODES.length];
        this._select(next);
      } else {
        this._lastTapTime = now;
      }
    }

    this._tapCount++;
    clearTimeout(this._tapTimer);
    this._tapTimer = setTimeout(() => { this._tapCount = 0; }, TAP_WINDOW_MS);

    if (this._tapCount >= 3) {
      this._tapCount = 0;
      this._togglePanel();
    }
  }

  _select(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this._updateButtons();
    this.onChange?.(mode);
  }

  _updateButtons() {
    this._fluidBtn.classList.toggle('active', this.mode === 'fluid');
    this._rippleBtn.classList.toggle('active', this.mode === 'ripple');
    this._combinedBtn.classList.toggle('active', this.mode === 'combined');
  }
}
