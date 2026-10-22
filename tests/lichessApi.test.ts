import { describe, it, expect } from "vitest";
import { parseNdjson } from "../src/data/api/lichessApi";

describe("parseNdjson", () => {
  it("parses empty stream correctly", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close();
      },
    });
    const response = new Response(stream);
    const items = await parseNdjson(response);
    expect(items).toEqual([]);
  });

  it("parses single chunk containing multiple NDJSON objects", async () => {
    const jsonLines = JSON.stringify({ id: "1", name: "game1" }) + "\n" +
      JSON.stringify({ id: "2", name: "game2" }) + "\n";
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(jsonLines));
        controller.close();
      },
    });
    const response = new Response(stream);
    const items = await parseNdjson<{ id: string; name: string }>(response);
    expect(items).toHaveLength(2);
    expect(items[0].id).toBe("1");
    expect(items[1].id).toBe("2");
  });

  it("handles chunks split across object boundaries", async () => {
    const part1 = '{"id":"game1",';
    const part2 = '"speed":"blitz"}\n{"id":"game2","speed":"rapid"}\n';
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(part1));
        controller.enqueue(encoder.encode(part2));
        controller.close();
      },
    });
    const response = new Response(stream);
    const items = await parseNdjson<{ id: string; speed: string }>(response);
    expect(items).toEqual([
      { id: "game1", speed: "blitz" },
      { id: "game2", speed: "rapid" },
    ]);
  });

  it("ignores empty lines and extra whitespace", async () => {
    const content = "\n\n  \n" + JSON.stringify({ id: "test" }) + "\n\n";
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(content));
        controller.close();
      },
    });
    const response = new Response(stream);
    const items = await parseNdjson<{ id: string }>(response);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("test");
  });
});
