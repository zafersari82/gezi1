import sharp from "sharp";

import { AppError } from "../../core/errors";

/** Limits decompression cost even for tiny, maliciously crafted files. */
export const BUSINESS_IMAGE_MAX_PIXELS = 20_000_000;
export const BUSINESS_IMAGE_MAX_EDGE = 1600;

/**
 * Every storefront upload becomes a bounded, single-frame WebP. Re-encoding drops
 * embedded EXIF (including GPS), IPTC and XMP rather than copying arbitrary bytes.
 * The shared chat/avatar upload contract remains unchanged.
 */
export async function processBusinessImage(input: Buffer): Promise<Buffer> {
  try {
    const source = sharp(input, {
      limitInputPixels: BUSINESS_IMAGE_MAX_PIXELS,
      failOn: "error",
      animated: false,
    });
    const metadata = await source.metadata();
    if (
      !["jpeg", "png", "webp"].includes(metadata.format ?? "") ||
      !metadata.width || !metadata.height ||
      metadata.width * metadata.height > BUSINESS_IMAGE_MAX_PIXELS ||
      (metadata.pages ?? 1) !== 1
    ) throw new AppError("media_invalid");
    return await source
      .rotate() // use EXIF orientation before discarding its metadata
      .resize(BUSINESS_IMAGE_MAX_EDGE, BUSINESS_IMAGE_MAX_EDGE, {
        fit: "inside", withoutEnlargement: true,
      })
      .webp({ quality: 82, effort: 4 })
      .toBuffer();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("media_invalid");
  }
}
