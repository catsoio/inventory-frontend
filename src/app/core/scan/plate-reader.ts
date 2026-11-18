import { Capacitor, registerPlugin } from '@capacitor/core';

/** Textraderna i en bildruta. Pluginet ligger i själva appen (iOS: Vision, Android: ML Kit). */
interface PlateReaderPlugin {
  /** `image` är en JPEG som base64 utan "data:"-prefix. */
  recognize(options: { image: string }): Promise<{ lines: string[] }>;
}

const plugin = registerPlugin<PlateReaderPlugin>('PlateReader');

/** Skyltläsning finns bara i appen; i webbläsaren läser kameran streckkoder och QR som förut. */
export const plateReaderAvailable = () =>
  Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('PlateReader');

/** Läser textraderna ur det kameran ser just nu. */
export async function readLines(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return [];
  // Skyltens text är stor nog i 1280 px; mer ger bara långsammare läsning över bryggan.
  const scale = Math.min(1, 1280 / w);
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
  const image = canvas.toDataURL('image/jpeg', 0.7).split(',')[1];
  const { lines } = await plugin.recognize({ image });
  return lines;
}
