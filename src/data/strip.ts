import sharp from 'sharp';

const FRAME_HEIGHT = 300;
const GAP = 16;

const sources = import.meta.glob<string>('../assets/strip/*.jpg', { query: '?inline', import: 'default', eager: true });

export interface Strip {
  body: Uint8Array<ArrayBuffer>;
  width: number;
  height: number;
  version: string;
}

const fromDataUrl = (url: string) => Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (char) => char.charCodeAt(0));

async function build(): Promise<Strip> {
  const frames = await Promise.all(
    Object.keys(sources)
      .sort()
      .map((key) => sharp(fromDataUrl(sources[key])).resize({ height: FRAME_HEIGHT }).toBuffer({ resolveWithObject: true })),
  );

  let left = 0;
  const layers = frames.map(({ data, info }) => {
    const layer = { input: data, left, top: 0 };
    left += info.width + GAP;
    return layer;
  });

  const body = new Uint8Array(
    await sharp({ create: { width: left, height: FRAME_HEIGHT, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite(layers)
      .webp({ quality: 70 })
      .toBuffer(),
  );
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', body));
  const version = Array.from(digest.slice(0, 4), (byte) => byte.toString(16).padStart(2, '0')).join('');

  return { body, width: left, height: FRAME_HEIGHT, version };
}

let strip: Promise<Strip> | undefined;

export function getStrip(): Promise<Strip> {
  strip ??= build();
  return strip;
}
