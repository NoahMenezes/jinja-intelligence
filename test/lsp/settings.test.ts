import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, resolveSettings } from "../../src/config/settings.js";
import { createLogger } from "../../src/utils/logging.js";
import { DocumentSync } from "../../src/lsp/document-sync.js";
import type { UriString } from "../../src/types/index.js";

describe("settings", () => {
  it("returns defaults for missing or invalid input", () => {
    expect(resolveSettings()).toEqual(DEFAULT_SETTINGS);
    expect(resolveSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(resolveSettings("nope" as unknown as Record<string, unknown>)).toEqual(DEFAULT_SETTINGS);
  });

  it("merges partial settings and ignores unknown keys", () => {
    const merged = resolveSettings({ maxLogLines: 10, unknown: true } as Record<string, unknown>);
    expect(merged.maxLogLines).toBe(10);
    expect(merged.templateExtensions).toEqual(DEFAULT_SETTINGS.templateExtensions);
    expect("unknown" in merged).toBe(false);
  });

  it("rejects non-positive maxLogLines", () => {
    expect(resolveSettings({ maxLogLines: -5 }).maxLogLines).toBe(DEFAULT_SETTINGS.maxLogLines);
  });
});

describe("logging", () => {
  it("never throws, even with a broken console", () => {
    const logger = createLogger({
      console: {
        info(): void {
          throw new Error("boom");
        },
        warn(): void {
          throw new Error("boom");
        },
        error(): void {
          throw new Error("boom");
        },
      },
    });
    expect(() => {
      logger.info("a");
      logger.warn("b");
    }).not.toThrow();
    // error() mirrors to stderr; silence it for a clean test run.
    const write = process.stderr.write.bind(process.stderr);
    process.stderr.write = (() => true) as typeof process.stderr.write;
    try {
      expect(() => logger.error("c")).not.toThrow();
    } finally {
      process.stderr.write = write;
    }
  });
});

describe("document-sync", () => {
  it("opens, updates, and closes without throwing", () => {
    const sync = new DocumentSync(createLogger());
    sync.didOpen("file:///a.html", "hello", 1);
    expect(sync.manager.get("file:///a.html" as UriString)?.text).toBe("hello");
    sync.didChange("file:///a.html", "bye", 2);
    expect(sync.manager.get("file:///a.html" as UriString)?.version).toBe(2);
    // Change for an untracked document opens it instead of crashing.
    sync.didChange("file:///b.html", "b", 1);
    expect(sync.manager.has("file:///b.html" as UriString)).toBe(true);
    sync.didClose("file:///a.html");
    expect(sync.manager.has("file:///a.html" as UriString)).toBe(false);
  });

  it("falls back to local versions when the client sends null", () => {
    const sync = new DocumentSync(createLogger());
    sync.didOpen("file:///a.html", "hello", null);
    expect(sync.manager.get("file:///a.html" as UriString)?.version).toBe(1);
  });
});
