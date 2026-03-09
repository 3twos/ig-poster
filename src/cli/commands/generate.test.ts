import { afterEach, describe, expect, it, vi } from "vitest";

import { runGenerateCommand } from "@/cli/commands/generate";

const createStreamResponse = (events: unknown[]) =>
  new Response(
    events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""),
    {
      headers: {
        "content-type": "text/event-stream",
      },
    },
  );

describe("runGenerateCommand", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prints the final generation result in json mode", async () => {
    const requestStream = vi.fn().mockResolvedValue(
      createStreamResponse([
        {
          type: "run-start",
          runId: "run-1",
          label: "Generate",
        },
        {
          type: "run-complete",
          summary: "Generated concept variants successfully.",
          fallbackUsed: false,
          result: {
            strategy: "Lead with a sharp claim and support it with proof.",
            variants: [
              {
                id: "variant-1",
                name: "Hero",
                postType: "single-image",
                hook: "Proof beats promises in public.",
                headline: "Design trust through evidence",
                supportingText: "Make the proof concrete and keep the claim tight for the reader.",
                cta: "Save this system",
                caption: "Use proof-driven positioning to turn abstract value into felt credibility for buyers.",
                hashtags: ["#Growth", "#Brand", "#Trust", "#Startups", "#Marketing"],
                layout: "hero-quote",
                textAlign: "left",
                colorHexes: ["#0F172A", "#F97316"],
                overlayStrength: 0.55,
                assetSequence: ["asset-1"],
              },
              {
                id: "variant-2",
                name: "Editorial",
                postType: "single-image",
                hook: "Credibility compounds in public.",
                headline: "Show the work, win belief",
                supportingText: "Clear evidence and strong sequencing help the audience trust the claim faster.",
                cta: "See the framework",
                caption: "Use disciplined proof moments to turn brand positioning into something buyers can feel and trust.",
                hashtags: ["#Growth", "#Brand", "#Trust", "#Startups", "#Marketing"],
                layout: "magazine",
                textAlign: "center",
                colorHexes: ["#0F172A", "#F97316"],
                overlayStrength: 0.45,
                assetSequence: ["asset-1"],
              },
              {
                id: "variant-3",
                name: "Minimal",
                postType: "single-image",
                hook: "Precision creates confidence.",
                headline: "Proof creates momentum",
                supportingText: "Compress the message, sharpen the proof, and make the next action explicit.",
                cta: "Build the next post",
                caption: "The fastest path to trust is a clear claim, concrete proof, and a crisp next step for the reader.",
                hashtags: ["#Growth", "#Brand", "#Trust", "#Startups", "#Marketing"],
                layout: "minimal-logo",
                textAlign: "center",
                colorHexes: ["#0F172A", "#F97316"],
                overlayStrength: 0.4,
                assetSequence: ["asset-1"],
              },
            ],
          },
        },
      ]),
    );
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    await runGenerateCommand(
      {
        client: { requestStream },
        globalOptions: {
          json: true,
          streamJson: false,
          jq: undefined,
          quiet: false,
          noColor: false,
          yes: false,
          dryRun: false,
        },
      } as never,
      ["run", "--post", "post-1"],
    );

    expect(requestStream).toHaveBeenCalledWith({
      method: "POST",
      path: "/api/v1/generate",
      headers: {
        accept: "text/event-stream",
      },
      body: { postId: "post-1" },
    });
    expect(stdout).toHaveBeenCalledWith(
      expect.stringContaining('"summary": "Generated concept variants successfully."'),
    );
  });

  it("prints ndjson events when stream-json is enabled", async () => {
    const requestStream = vi.fn().mockResolvedValue(
      createStreamResponse([
        {
          type: "run-start",
          runId: "run-1",
          label: "Generate",
        },
        {
          type: "run-complete",
          summary: "Generated concept variants successfully.",
          fallbackUsed: true,
          result: {
            strategy: "Fallback strategy keeps the same goal while using a safe local response.",
            variants: [
              {
                id: "variant-1",
                name: "Hero",
                postType: "single-image",
                hook: "Proof beats promises in public.",
                headline: "Design trust through evidence",
                supportingText: "Make the proof concrete and keep the claim tight for the reader.",
                cta: "Save this system",
                caption: "Use proof-driven positioning to turn abstract value into felt credibility for buyers.",
                hashtags: ["#Growth", "#Brand", "#Trust", "#Startups", "#Marketing"],
                layout: "hero-quote",
                textAlign: "left",
                colorHexes: ["#0F172A", "#F97316"],
                overlayStrength: 0.55,
                assetSequence: ["asset-1"],
              },
              {
                id: "variant-2",
                name: "Editorial",
                postType: "single-image",
                hook: "Credibility compounds in public.",
                headline: "Show the work, win belief",
                supportingText: "Clear evidence and strong sequencing help the audience trust the claim faster.",
                cta: "See the framework",
                caption: "Use disciplined proof moments to turn brand positioning into something buyers can feel and trust.",
                hashtags: ["#Growth", "#Brand", "#Trust", "#Startups", "#Marketing"],
                layout: "magazine",
                textAlign: "center",
                colorHexes: ["#0F172A", "#F97316"],
                overlayStrength: 0.45,
                assetSequence: ["asset-1"],
              },
              {
                id: "variant-3",
                name: "Minimal",
                postType: "single-image",
                hook: "Precision creates confidence.",
                headline: "Proof creates momentum",
                supportingText: "Compress the message, sharpen the proof, and make the next action explicit.",
                cta: "Build the next post",
                caption: "The fastest path to trust is a clear claim, concrete proof, and a crisp next step for the reader.",
                hashtags: ["#Growth", "#Brand", "#Trust", "#Startups", "#Marketing"],
                layout: "minimal-logo",
                textAlign: "center",
                colorHexes: ["#0F172A", "#F97316"],
                overlayStrength: 0.4,
                assetSequence: ["asset-1"],
              },
            ],
          },
        },
      ]),
    );
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    await runGenerateCommand(
      {
        client: { requestStream },
        globalOptions: {
          json: false,
          streamJson: true,
          jq: undefined,
          quiet: false,
          noColor: false,
          yes: false,
          dryRun: false,
        },
      } as never,
      ["run", "--post", "post-1"],
    );

    expect(stdout).toHaveBeenCalledWith(
      expect.stringContaining('"type":"run-start"'),
    );
    expect(stdout).toHaveBeenCalledWith(
      expect.stringContaining('"type":"run-complete"'),
    );
  });

  it("calls the refine endpoint for a post", async () => {
    const requestJson = vi.fn().mockResolvedValue({
      source: "model",
      variant: {
        id: "variant-1",
        name: "Editorial",
        postType: "single-image",
      },
    });
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    await runGenerateCommand(
      {
        client: { requestJson },
        globalOptions: {
          json: true,
          streamJson: false,
          jq: undefined,
          quiet: false,
          noColor: false,
          yes: false,
          dryRun: false,
        },
      } as never,
      [
        "refine",
        "--post",
        "post-1",
        "--instruction",
        "Make this more editorial.",
      ],
    );

    expect(requestJson).toHaveBeenCalledWith({
      method: "POST",
      path: "/api/v1/generate/refine",
      body: {
        postId: "post-1",
        instruction: "Make this more editorial.",
      },
    });
    expect(stdout).toHaveBeenCalled();
  });
});
