export class CameraFeed {
  constructor(video) {
    this.video = video;
    this.isFrontFacing = false;
  }

  async start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
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
      this.isFrontFacing = track.getSettings().facingMode === 'user';
    } catch (err) {
      document.body.innerText = `Camera error: ${err.message}`;
    }
  }
}
