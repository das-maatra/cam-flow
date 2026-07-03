export class CameraFeed {
  constructor(video) {
    this.video = video;
  }

  async start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      this.video.srcObject = stream;
      await this.video.play();
    } catch (err) {
      document.body.innerText = `Camera error: ${err.message}`;
    }
  }
}
