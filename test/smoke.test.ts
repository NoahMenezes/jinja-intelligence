import { describe, expect, it } from "vitest";
import { SERVER_NAME } from "../src/index.js";

describe("bootstrap", () => {
  it("exposes server name", () => {
    expect(SERVER_NAME).toBe("jinja-intelligence");
  });
});
