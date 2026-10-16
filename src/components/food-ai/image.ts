"use client";

// Client-side photo preparation: decode (including HEIC where the browser can), honour
// EXIF orientation, downscale to ≤1600 px and re-encode as JPEG ≈0.82 before upload.

export const MAX_ORIGINAL_BYTES = 25 * 1024 * 1024;
const MAX_DATA_URL = 8_500_000;

export class ImagePrepError extends Error {}

export interface PreparedImage {
  dataUrl: string;
  width: number;
  height: number;
  bytes: number;
}

function loadViaImg(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode"));
    };
    img.src = url;
  });
}

function canvasToDataUrl(canvas: HTMLCanvasElement, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error("encode"));
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(new Error("read"));
        r.readAsDataURL(blob);
      },
      "image/jpeg",
      quality,
    );
  });
}

export async function prepareImage(file: File, maxDim = 1600, quality = 0.82): Promise<PreparedImage> {
  const looksLikeImage = file.type.startsWith("image/") || /\.(heic|heif|jpe?g|png|webp|avif)$/i.test(file.name);
  if (!looksLikeImage) throw new ImagePrepError("That file isn't a photo. Choose a JPEG, PNG or HEIC image.");
  if (file.size > MAX_ORIGINAL_BYTES) {
    throw new ImagePrepError(`That photo is ${(file.size / 1024 / 1024).toFixed(0)} MB. The limit is 25 MB — take a new photo or pick a smaller one.`);
  }

  let source: ImageBitmap | HTMLImageElement;
  let w: number;
  let h: number;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    source = bmp;
    w = bmp.width;
    h = bmp.height;
  } catch {
    try {
      const img = await loadViaImg(file);
      source = img;
      w = img.naturalWidth;
      h = img.naturalHeight;
    } catch {
      throw new ImagePrepError(
        /heic|heif/i.test(file.type + file.name)
          ? "This browser can't open HEIC photos. Use Safari, or set iPhone Camera › Formats to Most Compatible."
          : "That photo couldn't be opened. Try a JPEG or PNG.",
      );
    }
  }
  if (!w || !h) throw new ImagePrepError("That photo looks empty. Try another one.");

  const scale = Math.min(1, maxDim / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ImagePrepError("Your browser couldn't process the photo.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, cw, ch);
  if ("close" in source) source.close();

  let dataUrl = await canvasToDataUrl(canvas, quality);
  if (dataUrl.length > MAX_DATA_URL) dataUrl = await canvasToDataUrl(canvas, 0.68);
  if (dataUrl.length > MAX_DATA_URL) throw new ImagePrepError("That photo is still too large after resizing. Try another one.");
  return { dataUrl, width: cw, height: ch, bytes: Math.round((dataUrl.length * 3) / 4) };
}

/** data URL → Blob (for private storage upload). */
export function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(",");
  const mime = /data:([^;]+)/.exec(head)?.[1] ?? "image/jpeg";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
