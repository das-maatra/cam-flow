const TAP_WINDOW_MS = 500; // taps must land within this window of each other to count as one gesture

export class ModeToggle {
  constructor({ initialMode = 'ripple', onChange } = {}) {
    this.mode = initialMode;
    this.onChange = onChange;

    this._tapCount = 0;
    this._tapTimer = null;

    this._panel = document.getElementById('mode-panel');
    this._fluidBtn = document.getElementById('mode-fluid');
    this._rippleBtn = document.getElementById('mode-ripple');

    this._fluidBtn.addEventListener('click', () => this._select('fluid'));
    this._rippleBtn.addEventListener('click', () => this._select('ripple'));
    document.addEventListener('pointerdown', () => this._registerTap());

    this._updateButtons();
  }

  _registerTap() {
    this._tapCount++;
    clearTimeout(this._tapTimer);
    this._tapTimer = setTimeout(() => { this._tapCount = 0; }, TAP_WINDOW_MS);

    if (this._tapCount >= 3) {
      this._tapCount = 0;
      this._panel.classList.toggle('visible');
    }
  }

  _select(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this._updateButtons();
    this._panel.classList.remove('visible');
    this.onChange?.(mode);
  }

  _updateButtons() {
    this._fluidBtn.classList.toggle('active', this.mode === 'fluid');
    this._rippleBtn.classList.toggle('active', this.mode === 'ripple');
  }
}
