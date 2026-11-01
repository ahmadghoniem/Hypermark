import { describe, expect, test } from "bun:test";
import { isLoopbackHost, rejectNonLoopbackHost } from "./host-guard";

describe("isLoopbackHost", () => {
  test("accepts loopback names and addresses, with or without a port", () => {
    for (const host of [
      "localhost",
      "localhost:19432",
      "LOCALHOST:80",
      "localhost.",
      "app.localhost:3000",
      "127.0.0.1",
      "127.0.0.1:19432",
      "127.1.2.3:8080",
      "[::1]",
      "[::1]:19432",
    ]) {
      expect(isLoopbackHost(host)).toBe(true);
    }
  });

  // A rebinding page sends its own hostname, even though it resolves to
  // 127.0.0.1.
  test("rejects every other host", () => {
    for (const host of [
      "",
      "evil.example",
      "evil.example:19432",
      "localhost.evil.example",
      "127.0.0.1.evil.example",
      "128.0.0.1",
      "127.0.0.256",
      "0.0.0.0",
      "192.168.1.10:19432",
      "[::2]:19432",
      "[::1",
    ]) {
      expect(isLoopbackHost(host)).toBe(false);
    }
  });
});

describe("rejectNonLoopbackHost", () => {
  test("passes a loopback request and 403s a foreign Host", () => {
    expect(rejectNonLoopbackHost(new Request("http://localhost:4000/api/document"))).toBeNull();
    const rejected = rejectNonLoopbackHost(
      new Request("http://localhost:4000/api/document", { headers: { host: "evil.example:4000" } }),
    );
    expect(rejected?.status).toBe(403);
  });
});
