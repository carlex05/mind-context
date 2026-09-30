import { describe, expect, it } from "vitest";
import {
  appendJsonCanvasTextNode,
  parseJsonCanvas,
  serializeJsonCanvas,
  updateJsonCanvasNode,
} from "../src/index";

describe("JSON Canvas format boundary", () => {
  it("parses the open JSON Canvas shape", () => {
    const result = parseJsonCanvas(JSON.stringify({
      nodes: [{
        id: "n1",
        type: "text",
        x: 10,
        y: 20,
        width: 200,
        height: 120,
        text: "# Hello",
      }],
      edges: [],
    }));
    expect(result.ok).toBe(true);
  });

  it("preserves unknown fields while editing known node fields", () => {
    const parsed = parseJsonCanvas(JSON.stringify({
      customTopLevel: { future: true },
      nodes: [{
        id: "n1",
        type: "text",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        text: "before",
        pluginSpecific: "keep-me",
      }],
      edges: [],
    }));
    if (!parsed.ok) throw new Error(parsed.error);

    const updated = updateJsonCanvasNode(parsed.canvas, "n1", {
      text: "after",
      x: 50,
    });
    const serialized = JSON.parse(serializeJsonCanvas(updated));

    expect(serialized.customTopLevel).toEqual({ future: true });
    expect(serialized.nodes[0].pluginSpecific).toBe("keep-me");
    expect(serialized.nodes[0].text).toBe("after");
    expect(serialized.nodes[0].x).toBe(50);
  });

  it("appends portable JSON Canvas text nodes", () => {
    const next = appendJsonCanvasTextNode({}, {
      id: "new",
      x: 40,
      y: 80,
      text: "New note",
    });
    expect(next.nodes?.[0]).toMatchObject({
      id: "new",
      type: "text",
      width: 280,
      height: 160,
      text: "New note",
    });
  });

  it("rejects malformed node records", () => {
    const result = parseJsonCanvas(JSON.stringify({
      nodes: [{ id: "broken", type: "text" }],
    }));
    expect(result.ok).toBe(false);
  });
});
