import { describe, expect, it } from "vitest";

import { LinkyError } from "./errors";
import {
  parseCreateLinkyPayload,
  parsePatchLinkyPayload,
} from "./schemas";

// ---------------------------------------------------------------------------
// parseCreateLinkyPayload
// ---------------------------------------------------------------------------

describe("parseCreateLinkyPayload", () => {
  it("parses a minimal valid payload", () => {
    const result = parseCreateLinkyPayload({
      urls: ["https://example.com/path"],
    });
    expect(result.urls).toEqual(["https://example.com/path"]);
    expect(result.source).toBe("unknown");
    expect(result.urlMetadata).toEqual([{}]);
  });

  it("normalizes source to a whitelisted value", () => {
    expect(parseCreateLinkyPayload({ urls: ["https://a.com"], source: "CLI" }).source)
      .toBe("cli");
    expect(parseCreateLinkyPayload({ urls: ["https://a.com"], source: "evil" }).source)
      .toBe("unknown");
  });

  it("rejects a non-object body", () => {
    expect(() => parseCreateLinkyPayload("nope")).toThrow(LinkyError);
    expect(() => parseCreateLinkyPayload(null)).toThrow(LinkyError);
    expect(() => parseCreateLinkyPayload([1, 2])).toThrow(LinkyError);
  });

  it("rejects title and description over the length cap", () => {
    expect(() =>
      parseCreateLinkyPayload({
        urls: ["https://a.com"],
        title: "x".repeat(121),
      }),
    ).toThrow(/title/);
    expect(() =>
      parseCreateLinkyPayload({
        urls: ["https://a.com"],
        description: "y".repeat(501),
      }),
    ).toThrow(/description/);
  });

  it("pads urlMetadata with empty objects when fewer entries than urls", () => {
    const result = parseCreateLinkyPayload({
      urls: ["https://a.com", "https://b.com", "https://c.com"],
      urlMetadata: [{ note: "first" }],
    });
    expect(result.urlMetadata).toEqual([{ note: "first" }, {}, {}]);
  });

  it("rejects urlMetadata longer than urls", () => {
    expect(() =>
      parseCreateLinkyPayload({
        urls: ["https://a.com"],
        urlMetadata: [{}, {}, {}],
      }),
    ).toThrow(/more entries/);
  });

  it("validates openPolicy values", () => {
    expect(() =>
      parseCreateLinkyPayload({
        urls: ["https://a.com"],
        urlMetadata: [{ openPolicy: "banana" }],
      }),
    ).toThrow(/openPolicy/);
  });

  it("normalizes and lower-cases a valid email", () => {
    const result = parseCreateLinkyPayload({
      urls: ["https://a.com"],
      email: "  Alice@Example.COM ",
    });
    expect(result.email).toBe("alice@example.com");
  });

  it("rejects an obviously malformed email", () => {
    expect(() =>
      parseCreateLinkyPayload({ urls: ["https://a.com"], email: "not-an-email" }),
    ).toThrow(/email/);
  });

  it("treats an empty email string as absent", () => {
    const result = parseCreateLinkyPayload({
      urls: ["https://a.com"],
      email: "   ",
    });
    expect(result.email).toBeUndefined();
  });

  it("still refuses custom aliases in Sprint 1", () => {
    expect(() =>
      parseCreateLinkyPayload({
        urls: ["https://a.com"],
        alias: "my-alias",
      }),
    ).toThrow(/aliases/);
  });
});

// ---------------------------------------------------------------------------
// parsePatchLinkyPayload
// ---------------------------------------------------------------------------

describe("parsePatchLinkyPayload", () => {
  it("accepts a title-only update", () => {
    const result = parsePatchLinkyPayload({ title: "New name" });
    expect(result.title).toBe("New name");
    expect(result.urls).toBeUndefined();
  });

  it("accepts setting title to null to clear it", () => {
    const result = parsePatchLinkyPayload({ title: null });
    expect(result.title).toBeNull();
  });

  it("accepts a urls-only update and defaults urlMetadata when not provided", () => {
    const result = parsePatchLinkyPayload({
      urls: ["https://a.com/path", "https://b.com/path"],
    });
    expect(result.urls).toEqual([
      "https://a.com/path",
      "https://b.com/path",
    ]);
    expect(result.urlMetadata).toBeUndefined();
  });

  it("requires at least one field", () => {
    expect(() => parsePatchLinkyPayload({})).toThrow(/at least one/);
  });

  it("aligns urlMetadata to new urls length when both provided", () => {
    const result = parsePatchLinkyPayload({
      urls: ["https://a.com/x", "https://b.com/x"],
      urlMetadata: [{ note: "one" }, { note: "two" }],
    });
    expect(result.urlMetadata?.length).toBe(2);
    expect(result.urlMetadata?.[0]?.note).toBe("one");
  });
});
