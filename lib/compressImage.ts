/**
 * Compresses an image client-side before upload.
 *
 * Why: phone photos are routinely 8-12 MB. That's a slow upload on cellular
 * (drivers are out in the field) AND a slow render later in the dispatch view.
 * This shrinks the long side to `maxDim` px and re-encodes as JPEG - typically
 * a 12 MP photo lands around ~300 KB with no visible loss for proof-of-delivery.
 *
 * We use createImageBitmap(file, { resizeWidth, resizeHeight }) so the browser's
 * native decoder downscales in one pass: peak heap is roughly the OUTPUT size,
 * not the full-res input. This matters on low-RAM phones where the old
 * readAsDataURL -> Image() path could OOM. A legacy canvas path covers browsers
 * (and HEIC files) that createImageBitmap rejects, and we always fall back to
 * the original file rather than dropping the photo.
 */
// Hard ceiling for anything we hand to fetch(). Vercel's serverless functions
// reject request bodies over 4.5MB outright (before our route code even runs),
// and the offline queue treats that failure as permanent for that photo — so a
// file that slips past this cap gets stuck retrying forever and, worse, blocks
// every photo queued behind it. Stay well under the platform limit.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

// Passes to try, in order, until the result fits under MAX_UPLOAD_BYTES.
const PASSES = [
  { dim: 1280, quality: 0.78 },
  { dim: 960, quality: 0.65 },
  { dim: 720, quality: 0.5 },
];

export async function compressImage(
  file: File,
  maxDim = 1280,
  quality = 0.78
): Promise<File> {
  // Skip non-images and files already small enough to not be worth re-encoding.
  if (!file.type.startsWith("image/")) return file;
  if (file.size < 300 * 1024) return file;

  const passes = maxDim === 1280 && quality === 0.78 ? PASSES : [{ dim: maxDim, quality }, ...PASSES];

  // Preferred path: native decode + resample, no full-res ImageData in JS heap.
  if (typeof createImageBitmap === "function") {
    try {
      const probe = await createImageBitmap(file);
      const srcW = probe.width;
      const srcH = probe.height;
      probe.close();

      if (Math.max(srcW, srcH) <= maxDim && file.size < 600 * 1024) return file;

      let best: File | null = null;
      for (const pass of passes) {
        const { width: w, height: h } = scaleToFit(srcW, srcH, pass.dim);

        const bmp = await createImageBitmap(file, {
          resizeWidth: w,
          resizeHeight: h,
          resizeQuality: "high",
        });

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          bmp.close();
          break;
        }
        ctx.drawImage(bmp, 0, 0);
        bmp.close();

        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/jpeg", pass.quality)
        );
        canvas.width = 0;
        canvas.height = 0;
        if (!blob) continue;

        const candidate = toJpegFile(blob, file.name);
        if (!best || candidate.size < best.size) best = candidate;
        if (candidate.size <= MAX_UPLOAD_BYTES) return candidate;
      }
      // Never hand back the raw file if it's over the upload cap — even our
      // smallest pass beats a guaranteed-to-fail multi-MB original.
      if (best && (best.size < file.size || file.size > MAX_UPLOAD_BYTES)) return best;
      if (file.size <= MAX_UPLOAD_BYTES) return file;
    } catch {
      // Fall through to legacy path (e.g. HEIC that createImageBitmap rejects).
    }
  }

  // Legacy fallback for older browsers / createImageBitmap failures.
  try {
    const dataUrl = await fileToDataUrl(file);
    const img = await loadImage(dataUrl);
    if (Math.max(img.width, img.height) <= maxDim && file.size < 600 * 1024)
      return file;

    let best: File | null = null;
    for (const pass of passes) {
      const { width: w, height: h } = scaleToFit(img.width, img.height, pass.dim);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) break;
      ctx.drawImage(img, 0, 0, w, h);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", pass.quality)
      );
      if (!blob) continue;

      const candidate = toJpegFile(blob, file.name);
      if (!best || candidate.size < best.size) best = candidate;
      if (candidate.size <= MAX_UPLOAD_BYTES) return candidate;
    }
    if (best && (best.size < file.size || file.size > MAX_UPLOAD_BYTES)) return best;
    return file;
  } catch {
    return file;
  }
}

function scaleToFit(w: number, h: number, maxDim: number) {
  if (w > h && w > maxDim) return { width: maxDim, height: Math.round((h * maxDim) / w) };
  if (h >= w && h > maxDim) return { width: Math.round((w * maxDim) / h), height: maxDim };
  return { width: w, height: h };
}

function toJpegFile(blob: Blob, originalName: string): File {
  return new File([blob], originalName.replace(/\.[^.]+$/, "") + ".jpg", {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
