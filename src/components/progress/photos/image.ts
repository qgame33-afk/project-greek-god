"use client";

// Client-side image preparation: decode (EXIF orientation applied), downscale to ≤2000px
// and re-encode as JPEG, plus a ≤600px preview. Large phone photos never leave the device
// at full size, and EXIF metadata (location, device) is stripped by the re-encode.

import { MAX_EDGE, MAX_INPUT_BYTES, THUMB_EDGE, fitWithin } from "@/lib/progress/photos";

export interface PreparedImage {
  main: Blob;
  thumb: Blob | null;
  width: number;
  height: number;
}

type Source = ImageBitmap | HTMLImageElement;

async function decode(file: Blob): Promise<{ src: Source; release: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { src: bmp, release: () => bmp.close() };
    } catch {
      /* fall back to <img> (older Safari, some formats) */
    }
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  try {
    await img.decode();
  } catch {
    URL.revokeObjectURL(url);
    throw new Error("This photo format can't be read in this browser. Export it as JPEG and try again.");
  }
  return { src: img, release: () => URL.revokeObjectURL(url) };
}

function sizeOf(src: Source) {
  return src instanceof HTMLImageElement ? { w: src.naturalWidth, h: src.naturalHeight } : { w: src.width, h: src.height };
}

function encode(src: Source, width: number, height: number, quality: number): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Couldn't prepare the photo on this device."));
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(src, 0, 0, width, height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't prepare the photo on this device."))), "image/jpeg", quality),
  );
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  if (file.size > MAX_INPUT_BYTES) throw new Error("That file is over 40 MB. Choose a smaller photo.");
  if (file.type && !file.type.startsWith("image/")) throw new Error("That file isn't an image.");
  const { src, release } = await decode(file);
  try {
    const { w, h } = sizeOf(src);
    if (!w || !h) throw new Error("That image looks empty. Try another photo.");
    const m = fitWithin(w, h, MAX_EDGE);
    const main = await encode(src, m.width, m.height, 0.86);
    const t = fitWithin(w, h, THUMB_EDGE);
    const thumb = await encode(src, t.width, t.height, 0.78).catch(() => null);
    return { main, thumb, width: m.width, height: m.height };
  } finally {
    release();
  }
}
