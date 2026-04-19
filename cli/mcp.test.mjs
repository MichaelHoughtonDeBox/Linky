import { describe, expect, it, vi } from "vitest";
import { McpError } from "@modelcontextprotocol/sdk/types.js";

import { forwardToolCall } from "./mcp.mjs";

// ============================================================================
// linky mcp bridge — forwarder tests (Sprint 2.8 Chunk B).
//
// The bridge itself is ~100 lines of MCP-SDK wiring; most of it is
// un-unit-testable (StdioServerTransport binds process.stdin/stdout and
// StreamableHTTPClientTransport needs a live HTTP server). The only
// logic with branches is `forwardToolCall`, so that's what we cover.
//
// Contract verified here:
//   1. Happy path returns the upstream's result verbatim. Content blocks
//      round-trip byte-for-byte — a stdio client MUST see the same text
//      blocks the upstream emitted.
//   2. An upstream-thrown McpError is rethrown with its code unchanged.
//      That means a -32002 "missing scope" error from the hosted
//      endpoint surfaces as -32002 over stdio, not wrapped in a generic
//      internal error.
//   3. Any non-McpError thrown (network failure, TypeError, …) becomes
//      a -32603 InternalError with a message prefix that lets ops
//      pinpoint where the failure came from.
// ============================================================================

function mockUpstream({ callTool }) {
  return { callTool: vi.fn(callTool) };
}

describe("forwardToolCall", () => {
  it("returns the upstream's CallToolResult verbatim", async () => {
    const upstreamResult = {
      content: [{ type: "text", text: '{"slug":"abc123"}' }],
    };
    const upstream = mockUpstream({ callTool: async () => upstreamResult });

    const result = await forwardToolCall(upstream, {
      name: "linky_get",
      arguments: { slug: "abc123" },
    });

    expect(result).toBe(upstreamResult);
    expect(upstream.callTool).toHaveBeenCalledWith({
      name: "linky_get",
      arguments: { slug: "abc123" },
    });
  });

  it("defaults missing arguments to an empty object", async () => {
    const upstream = mockUpstream({
      callTool: async () => ({ content: [] }),
    });

    await forwardToolCall(upstream, { name: "whoami" });

    const [arg] = upstream.callTool.mock.calls[0];
    expect(arg.arguments).toEqual({});
  });

  it("rethrows an upstream McpError with its code preserved", async () => {
    const upstreamError = new McpError(
      -32002,
      "This API key does not carry the 'links:write' scope.",
    );
    const upstream = mockUpstream({
      callTool: async () => {
        throw upstreamError;
      },
    });

    let caught;
    try {
      await forwardToolCall(upstream, {
        name: "linky_delete",
        arguments: { slug: "abc123" },
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBe(upstreamError);
    expect(caught.code).toBe(-32002);
  });

  it("wraps non-McpError failures in a -32603 InternalError", async () => {
    const upstream = mockUpstream({
      callTool: async () => {
        throw new TypeError("fetch failed: ECONNREFUSED");
      },
    });

    let caught;
    try {
      await forwardToolCall(upstream, {
        name: "linky_list",
        arguments: {},
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(McpError);
    expect(caught.code).toBe(-32603);
    expect(caught.message).toContain("Upstream /api/mcp request failed");
    expect(caught.message).toContain("fetch failed");
  });
});
