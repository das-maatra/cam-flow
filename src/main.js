const video = document.getElementById('camera');

try {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment' },
  });
  video.srcObject = stream;
  await video.play();
} catch (err) {
  document.body.innerText = `Camera error: ${err.message}`;
}
