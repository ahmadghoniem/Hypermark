/**
 * Bridge script and srcdoc injection:
 *
 * - the srcdoc injection has ONE bridge script element: inline by default,
 *   `<script src>` on the URL path, with no `crossorigin` and no CSP meta;
 * - the real bridge, executed in an isolated window, posts a `ready` that
 *   carries `BRIDGE_PROTOCOL_VERSION`, and the parent's check accepts exactly
 *   that and rejects a stamp-less ready (a stale asset).
 */
import { describe, expect, test } from "bun:test";
import { dirname, resolve } from "node:path";
import { BRIDGE_PROTOCOL_VERSION, BRIDGE_SCRIPT } from "./bridge-script";
import {
  buildBridgeScriptTag,
  buildSrcdocInjection,
  injectIntoHead,
  resolveBridgeScriptUrl,
} from "./srcdoc";
import { checkBridgeProtocolVersion, formatBridgeProtocolWarning } from "./useHtmlAnnotation";

const uiRoot = resolve(import.meta.dir, "../..");

describe("srcdoc bridge script tag", () => {
  const base = { tokens: {}, isLight: true, hostTheme: false, diffActive: false };

  test("default (no URL): the inline literal, exactly one script element, no src", () => {
    const injection = buildSrcdocInjection(base);
    expect(injection.endsWith(`<script>${BRIDGE_SCRIPT}</script>`)).toBe(true);
    expect(injection.split("<script").length - 1).toBe(1);
    expect(buildBridgeScriptTag()).toBe(`<script>${BRIDGE_SCRIPT}</script>`);
    // An empty string is "absent": a host misconfiguration must not produce
    // <script src=""> (which would load the host page itself as a script).
    expect(buildBridgeScriptTag("")).toBe(`<script>${BRIDGE_SCRIPT}</script>`);
  });

  test("URL path: a classic <script src> takes the inline script's place, without crossorigin", () => {
    const url = "https://host.example/assets/bridge-script.abc123.js";
    const injection = buildSrcdocInjection({ ...base, bridgeScriptUrl: url });
    const inline = buildSrcdocInjection(base);
    // Same prefix (the style block), same position: the tag replaces the
    // inline element rather than being added beside it.
    const stylePrefix = inline.slice(0, inline.indexOf("<script"));
    expect(injection.startsWith(stylePrefix)).toBe(true);
    expect(injection.slice(stylePrefix.length)).toBe(`<script src="${url}"></script>`);
    expect(injection).not.toContain(BRIDGE_SCRIPT);
    expect(injection).not.toContain("crossorigin");
  });

  test("the URL is attribute-escaped so it cannot break out of the tag", () => {
    const tag = buildBridgeScriptTag('/b.js" onerror="alert(1)');
    expect(tag).toBe('<script src="/b.js&quot; onerror=&quot;alert(1)"></script>');
  });

  test("the URL resolves against the parent base, never the framed page's <base href>", () => {
    const parent = "https://host.example/workspace/doc/42";
    expect(resolveBridgeScriptUrl("/assets/bridge.abc.js", parent)).toBe("https://host.example/assets/bridge.abc.js");
    expect(resolveBridgeScriptUrl("./bridge.js", parent)).toBe("https://host.example/workspace/doc/bridge.js");
    expect(resolveBridgeScriptUrl("https://cdn.example/b.js", parent)).toBe("https://cdn.example/b.js");
    // Unparsable input is passed through rather than thrown at render.
    expect(resolveBridgeScriptUrl("http://[bad", "not a url")).toBe("http://[bad");

    // A page carrying its own <base href> still precedes the injected tag
    // (end of <head>); the resolved src is absolute and unaffected by it.
    const page = '<html><head><base href="https://attacker.example/"><title>t</title></head><body></body></html>';
    const doc = injectIntoHead(page, buildSrcdocInjection({
      ...base,
      bridgeScriptUrl: resolveBridgeScriptUrl("/assets/bridge.abc.js", parent),
    }));
    expect(doc).toContain('<script src="https://host.example/assets/bridge.abc.js"></script>');
    expect(doc.indexOf("<base href")).toBeLessThan(doc.indexOf("<script src="));
  });

  test("the package adds no CSP meta to the srcdoc document on either path", () => {
    const page = "<html><head><title>t</title></head><body><p>x</p></body></html>";
    for (const bridgeScriptUrl of [undefined, "/assets/bridge.js"]) {
      const doc = injectIntoHead(page, buildSrcdocInjection({ ...base, bridgeScriptUrl }));
      expect(doc).not.toMatch(/<meta[^>]*http-equiv/i);
    }
    // Nor does the bridge itself write one at runtime.
    expect(BRIDGE_SCRIPT).not.toMatch(/http-equiv/i);
    expect(BRIDGE_SCRIPT).not.toMatch(/content-security-policy/i);
  });
});

describe("bridge protocol version", () => {
  /** Run the real bridge in an isolated happy-dom window whose `parent` is a
   * spy, so the test sees exactly what a srcdoc frame would post. happy-dom
   * is reached through the registrator's own dependency so no new package
   * dependency is needed; the global document (if any) is untouched. */
  async function runBridgeIsolated(): Promise<unknown[]> {
    const registrator = Bun.resolveSync("@happy-dom/global-registrator", uiRoot);
    const happyDom = Bun.resolveSync("happy-dom", dirname(registrator));
    const { Window } = (await import(happyDom)) as { Window: new (o: { url: string }) => Record<string, unknown> };
    const win = new Window({ url: "about:srcdoc" });
    (win.document as { write: (s: string) => void }).write("<html><body><p>hi</p></body></html>");
    const posted: unknown[] = [];
    const parent = { postMessage: (message: unknown) => posted.push(message) };
    const names = [
      "window", "document", "parent", "top", "self", "globalThis", "location",
      "ResizeObserver", "MutationObserver", "getComputedStyle", "requestAnimationFrame",
      "cancelAnimationFrame", "setTimeout", "clearTimeout", "Node", "Element",
      "HTMLElement", "performance", "getSelection", "navigator",
    ];
    const values = names.map((name) =>
      name === "parent" ? parent
        : name === "top" || name === "self" || name === "globalThis" ? win
        : win[name],
    );
    try {
      new Function(...names, BRIDGE_SCRIPT)(...values);
    } finally {
      const happy = win.happyDOM as { close?: () => Promise<void> } | undefined;
      await happy?.close?.();
    }
    return posted;
  }

  test("the executed bridge posts a ready stamped with BRIDGE_PROTOCOL_VERSION", async () => {
    const posted = await runBridgeIsolated();
    const ready = posted.find(
      (m) => typeof m === "object" && m !== null && (m as { type?: unknown }).type === "hypermark-bridge-ready",
    ) as { protocolVersion?: unknown } | undefined;
    expect(ready).toBeDefined();
    expect(ready!.protocolVersion).toBe(BRIDGE_PROTOCOL_VERSION);
    // The parent's check accepts the real bridge's ready as-is.
    expect(checkBridgeProtocolVersion(ready).ok).toBe(true);
  });

  test("a stale asset's ready (no stamp, or another version) is a detected mismatch naming both versions", () => {
    const stale = checkBridgeProtocolVersion({ type: "hypermark-bridge-ready" });
    expect(stale).toEqual({ ok: false, expected: BRIDGE_PROTOCOL_VERSION, reported: undefined });
    const other = checkBridgeProtocolVersion({
      type: "hypermark-bridge-ready",
      protocolVersion: BRIDGE_PROTOCOL_VERSION + 1,
    });
    expect(other.ok).toBe(false);
    expect(other.reported).toBe(BRIDGE_PROTOCOL_VERSION + 1);
    // Non-numeric stamps are not a version.
    expect(checkBridgeProtocolVersion({ type: "hypermark-bridge-ready", protocolVersion: "1" }).ok).toBe(false);

    const warning = formatBridgeProtocolWarning(other, "https://h/bridge.js");
    expect(warning).toContain(`expects ${BRIDGE_PROTOCOL_VERSION}`);
    expect(warning).toContain(`reported ${BRIDGE_PROTOCOL_VERSION + 1}`);
    expect(warning).toContain("https://h/bridge.js");
    expect(formatBridgeProtocolWarning(stale)).toContain("reported none");
  });
});
