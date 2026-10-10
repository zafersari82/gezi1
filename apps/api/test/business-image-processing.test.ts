import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { processBusinessImage, BUSINESS_IMAGE_MAX_EDGE } from "../src/modules/media/image-processing";

/** No database required: pure image decoding, resizing and metadata removal. */
describe("business image processing", () => {
  it("normalises image, auto-orients and strips embedded EXIF", async () => {
    const source = await sharp({ create: {
      width: 1800, height: 1200, channels: 3, background: "#aabbcc",
    } }).jpeg().withExif({ IFD0: { Copyright: "PRIVATE OWNER DATA" } }).toBuffer();
    const before = await sharp(source).metadata();
    expect(before.exif).toBeDefined();
    const result = await processBusinessImage(source);
    const after = await sharp(result).metadata();
    expect(after.format).toBe("webp");
    expect(after.width).toBeLessThanOrEqual(BUSINESS_IMAGE_MAX_EDGE);
    expect(after.height).toBeLessThanOrEqual(BUSINESS_IMAGE_MAX_EDGE);
    expect(after.exif).toBeUndefined();
    expect(after.icc).toBeUndefined();
  });

  it("rejects a forged image header or corrupted file", async () => {
    await expect(processBusinessImage(Buffer.from([0xff,0xd8,0xff,0xe0,0x00])))
      .rejects.toMatchObject({ code: "media_invalid" });
  });
});
