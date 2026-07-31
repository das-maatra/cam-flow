export class CameraFeed {
  constructor(video) {
    this.video = video;
    this.isFrontFacing = false;
    this.hasFacingInfo = false;
    this.facingMode = 'environment';
    this.onSwitch = null;
  }

  // A desktop webcam sits in the screen you're facing, so it wants the same
  // mirror treatment as a phone's front camera -- without it, moving your
  // hand right pushes the fluid left. A phone's rear camera points away from
  // you and must stay unflipped, which is the one case left unmirrored.
  get shouldMirror() {
    return this.isFrontFacing || !this.hasFacingInfo;
  }

  async start() {
    await this._openStream(this.facingMode);
  }

  async switchCamera() {
    this.facingMode = this.facingMode === 'environment' ? 'user' : 'environment';
    await this._openStream(this.facingMode);
    this.onSwitch?.();
  }

  async _openStream(facingMode) {
    try {
      // Release the previous camera before requesting a new one -- otherwise
      // some phones hold both open and the second getUserMedia() call hangs.
      this.video.srcObject?.getTracks().forEach((track) => track.stop());

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode },
      });
      this.video.srcObject = stream;
      await this.video.play();

      // On some phones videoWidth/videoHeight are still 0 right after play()
      // resolves -- anything computing an aspect ratio from them too early
      // divides by zero and gets NaN, which then poisons the fluid sim from
      // frame one. Wait for real dimensions before returning.
      if (this.video.videoWidth === 0) {
        await new Promise((resolve) => {
          this.video.addEventListener('loadedmetadata', resolve, { once: true });
        });
      }

      const track = stream.getVideoTracks()[0];
      const settings = track.getSettings();
      this.isFrontFacing = settings.facingMode === 'user';
      // Phones always report which way the camera points; desktop webcams
      // don't report facingMode at all (some browsers omit the key, others
      // return ''), so its absence is what identifies a desktop machine --
      // more reliable than sniffing the user agent, and it comes from the
      // same call we already make.
      this.hasFacingInfo = Boolean(settings.facingMode);
    } catch (err) {
      document.body.innerText = `Camera error: ${err.message}`;
    }
  }
}
