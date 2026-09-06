import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { inflateSync } from "node:zlib";
import { CLASSIC_FAVICON_SVG, FAVICON_PNG_BYTES } from "../packages/core/favicon";

// The two server-served entry points declare no type/sizes: their /favicon.png
// is answered by handleFavicon(), which always serves the classic SVG, so the
// response Content-Type is the only truthful declaration. A re-added
// type="image/png" would be a lie about what the route returns.
const SERVED_FAVICON_LINK = '<link rel="icon" href="/favicon.png">';
// The portal is a static site with no Plannotator server, so its favicon really
// is always the 64px PNG the vite plugin emits and it keeps the typed hints.
const STATIC_FAVICON_LINK =
  '<link rel="icon" type="image/png" sizes="64x64" href="/favicon.png">';
const MARKETING_FAVICON_LINK =
  '<link rel="icon" type="image/png" sizes="256x256" href="/favicon.png">';

interface PngStats {
  width: number;
  height: number;
  transparentPixels: number;
  partialAlphaPixels: number;
  opaquePixels: number;
}

function paethPredictor(left: number, above: number, upperLeft: number): number {
  const prediction = left + above - upperLeft;
  const leftDistance = Math.abs(prediction - left);
  const aboveDistance = Math.abs(prediction - above);
  const upperLeftDistance = Math.abs(prediction - upperLeft);

  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  return aboveDistance <= upperLeftDistance ? above : upperLeft;
}

function inspectRgbaPng(bytes: Uint8Array): PngStats {
  const buffer = Buffer.from(bytes);
  expect(Array.from(buffer.subarray(0, 8))).toEqual([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  expect(buffer[24]).toBe(8);
  expect(buffer[25]).toBe(6);
  expect(buffer[28]).toBe(0);

  const idatChunks: Buffer[] = [];
  let offset = 8;
  while (offset < buffer.length) {
    const chunkLength = buffer.readUInt32BE(offset);
    const chunkType = buffer.toString("ascii", offset + 4, offset + 8);
    if (chunkType === "IDAT") {
      idatChunks.push(buffer.subarray(offset + 8, offset + 8 + chunkLength));
    }
    offset += chunkLength + 12;
  }

  const inflated = inflateSync(Buffer.concat(idatChunks));
  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const pixels = Buffer.alloc(stride * height);
  let inputOffset = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[inputOffset];
    inputOffset += 1;
    expect(filter).toBeLessThanOrEqual(4);

    for (let x = 0; x < stride; x += 1) {
      const left = x >= bytesPerPixel ? pixels[y * stride + x - bytesPerPixel] : 0;
      const above = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upperLeft =
        y > 0 && x >= bytesPerPixel
          ? pixels[(y - 1) * stride + x - bytesPerPixel]
          : 0;
      const predictor =
        filter === 1
          ? left
          : filter === 2
            ? above
            : filter === 3
              ? Math.floor((left + above) / 2)
              : filter === 4
                ? paethPredictor(left, above, upperLeft)
                : 0;
      pixels[y * stride + x] = (inflated[inputOffset] + predictor) & 0xff;
      inputOffset += 1;
    }
  }

  let transparentPixels = 0;
  let partialAlphaPixels = 0;
  let opaquePixels = 0;
  for (let offset = 3; offset < pixels.length; offset += bytesPerPixel) {
    const alpha = pixels[offset];
    if (alpha === 0) transparentPixels += 1;
    else if (alpha === 0xff) opaquePixels += 1;
    else partialAlphaPixels += 1;
  }

  return { width, height, transparentPixels, partialAlphaPixels, opaquePixels };
}

async function readRepoFile(path: string): Promise<Buffer> {
  return readFile(new URL(`../${path}`, import.meta.url));
}

describe("favicon surfaces", () => {
  test("every product HTML entry point references the expected favicon", async () => {
    for (const path of ["apps/hook/index.html", "apps/review/index.html"]) {
      const html = (await readRepoFile(path)).toString();
      expect(html).toContain(SERVED_FAVICON_LINK);
      expect(html).not.toContain('rel="icon" type=');
    }


  });


  test("the shared application favicon is the selected production 64px asset", () => {
    expect(createHash("sha256").update(FAVICON_PNG_BYTES).digest("hex")).toBe(
      "8467d50dba314f3b72ab73ba37d406baabd8d74ed72529e853613442a8c65073",
    );
    const stats = inspectRgbaPng(FAVICON_PNG_BYTES);
    expect(stats).toMatchObject({ width: 64, height: 64 });
    expect(stats.transparentPixels).toBeGreaterThan(0);
    expect(stats.partialAlphaPixels).toBeGreaterThan(0);
    expect(stats.opaquePixels).toBeGreaterThan(0);
  });

  test("the served classic style is the archival pre-Totman asset", () => {
    // The only thing /favicon.png answers with. Pinned to the exact bytes that
    // shipped at 5b91c543^.
    expect(createHash("sha256").update(CLASSIC_FAVICON_SVG).digest("hex")).toBe(
      "27d33cff3d4515801f48e1cbaceec777ba802a7d341b22b2c0444d82b303cb49",
    );
  });

});
