export interface WebcamState {
  phase: 'idle' | 'requesting' | 'ready' | 'capturing' | 'error';
  message: string;
}

const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

export function webcamErrorMessage(error: unknown) {
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') return 'Camera access was declined. Allow camera access in your browser settings and try again, or upload a photo.';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'No webcam was found. Connect a camera or upload a photo.';
  if (name === 'NotReadableError' || name === 'TrackStartError') return 'The webcam is unavailable or in use by another app. Close that app and try again, or upload a photo.';
  return 'The webcam could not start. Try again or upload a photo.';
}

/** Owns one explicitly requested camera session, including late permission results. */
export class WebcamCapture {
  private stream: MediaStream | null = null;
  private version = 0;
  private state: WebcamState = { phase: 'idle', message: '' };

  constructor(
    private video: HTMLVideoElement,
    private onState: (state: WebcamState) => void,
    private getMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream> = constraints => navigator.mediaDevices.getUserMedia(constraints),
  ) {}

  private update(phase: WebcamState['phase'], message: string) {
    this.state = { phase, message };
    this.onState(this.state);
  }

  private release() {
    if (this.stream) for (const track of this.stream.getTracks()) { track.onended = null; track.stop(); }
    this.stream = null;
    this.video.pause();
    this.video.srcObject = null;
  }

  stop(message = '') {
    this.version++;
    this.release();
    this.update('idle', message);
  }

  async start() {
    this.stop();
    const version = this.version;
    this.update('requesting', 'Allow camera access to frame your photo. Your camera stays on this device until you capture and generate.');
    try {
      const stream = await this.getMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } } });
      if (version !== this.version) { stream.getTracks().forEach(track => track.stop()); return; }
      this.stream = stream;
      for (const track of stream.getVideoTracks()) track.onended = () => this.stop('The webcam disconnected. Reconnect it or upload a photo.');
      this.video.srcObject = stream;
      await this.video.play();
      if (version === this.version) this.update('ready', 'Camera is on. Step back to include your shoulders and torso, then capture your photo.');
    } catch (error) {
      if (version !== this.version) return;
      this.release();
      this.update('error', webcamErrorMessage(error));
    }
  }

  async capture(): Promise<string | null> {
    if (this.state.phase !== 'ready') return null;
    if (!this.video.videoWidth || !this.video.videoHeight || this.video.readyState < 2) {
      this.update('ready', 'The camera is still warming up. Wait a moment, then capture again.');
      return null;
    }
    const version = this.version;
    const canvas = this.video.ownerDocument.createElement('canvas');
    const scale = Math.min(1, 1600 / Math.max(this.video.videoWidth, this.video.videoHeight));
    canvas.width = Math.max(1, Math.round(this.video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(this.video.videoHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) { this.update('ready', 'Photo capture is unavailable. Stop the camera and upload a photo instead.'); return null; }
    // Save the raw frame, not the mirrored CSS preview, preserving its aspect ratio.
    try { context.drawImage(this.video, 0, 0, canvas.width, canvas.height); }
    catch { this.stop('The camera frame could not be read. Retake it or upload a photo.'); return null; }
    this.release();
    this.update('capturing', 'Saving your photo. Camera is off.');
    try {
      let blob: Blob | null = null;
      for (const quality of [0.88, 0.75, 0.6, 0.4]) {
        blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
        if (blob && blob.size <= MAX_PHOTO_BYTES) break;
      }
      if (!blob || blob.size > MAX_PHOTO_BYTES) throw new Error('Photo could not fit the upload limit.');
      const photo = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Photo could not be saved.'));
        reader.readAsDataURL(blob);
      });
      if (version !== this.version) return null;
      this.update('idle', 'Photo captured. Camera is off. Retake it or generate your try-on.');
      return photo;
    } catch {
      if (version === this.version) this.update('error', 'Photo could not be saved. Retake it or upload a photo under 2 MB.');
      return null;
    }
  }
}
