import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHtmlAssetRegistry } from "./html-assets";

// Every fixture directory is torn down together; see scripts/install.test.ts
// for why leaving them behind costs more on Windows than the bytes suggest.
const tempDirs: string[] = [];
function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}
afterAll(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("annotate raw HTML assets", () => {
  test("rewrites raw HTML support assets and serves them from the source directory", async () => {
    const dir = makeTempDir("hypermark-html-assets-");
    const htmlPath = join(dir, "page.html");
    const cssPath = join(dir, "style.css");
    const imagePath = join(dir, "logo.png");
    const html = '<!doctype html><html><head><link rel="stylesheet" href="./style.css"></head><body><img src="./logo.png"></body></html>';
    writeFileSync(htmlPath, html, "utf-8");
    writeFileSync(cssPath, "body { color: red; }", "utf-8");
    writeFileSync(imagePath, "png-bytes", "utf-8");

    const assets = createHtmlAssetRegistry();
    const rawHtml = assets.rewriteHtml(html, htmlPath);

    expect(rawHtml).toContain("/api/html-assets/");

    const cssUrl = rawHtml.match(/href="([^"]+style\.css)"/)?.[1];
    const imageUrl = rawHtml.match(/src="([^"]+logo\.png)"/)?.[1];
    expect(cssUrl).toBeTruthy();
    expect(imageUrl).toBeTruthy();

    const cssRequestUrl = new URL(cssUrl!, "http://localhost");
    const cssResponse = await assets.handle(new Request(String(cssRequestUrl)), cssRequestUrl);
    expect(cssResponse?.status).toBe(200);
    expect(cssResponse?.headers.get("content-type")).toContain("text/css");
    expect(cssResponse?.headers.get("access-control-allow-origin")).toBe("*");
    expect(await cssResponse?.text()).toBe("body { color: red; }");

    const imageRequestUrl = new URL(imageUrl!, "http://localhost");
    const imageResponse = await assets.handle(new Request(String(imageRequestUrl)), imageRequestUrl);
    expect(imageResponse?.status).toBe(200);
    expect(imageResponse?.headers.get("content-type")).toBe("image/png");
    expect(await imageResponse?.text()).toBe("png-bytes");
  });

  test("does not serve a symlinked asset that escapes the source directory", async () => {
    // Attacker bundle: a symlink inside the HTML's dir pointing at a secret outside it.
    const base = makeTempDir("hypermark-html-symlink-");
    const htmlDir = join(base, "site");
    mkdirSync(htmlDir);
    const secretPath = join(base, "secret.css");
    writeFileSync(secretPath, "SECRET_OUTSIDE_CONTENT", "utf-8");
    symlinkSync(secretPath, join(htmlDir, "evil.css"));
    const htmlPath = join(htmlDir, "page.html");
    const html = '<!doctype html><html><head><link rel="stylesheet" href="./evil.css"></head><body></body></html>';
    writeFileSync(htmlPath, html, "utf-8");

    const assets = createHtmlAssetRegistry();
    const rawHtml = assets.rewriteHtml(html, htmlPath);
    const cssUrl = rawHtml.match(/href="([^"]+evil\.css)"/)?.[1];
    expect(cssUrl).toBeTruthy();

    const requestUrl = new URL(cssUrl!, "http://localhost");
    const response = await assets.handle(new Request(String(requestUrl)), requestUrl);
    expect(response?.status).toBe(403);
    expect(await response?.text()).not.toContain("SECRET_OUTSIDE_CONTENT");
  });
});
