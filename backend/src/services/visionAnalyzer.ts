import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import { config } from "../config";
import { logger } from "../utils/logger";
import { VISION_BATCH_SIZE } from "@framereader/shared";
import type { ActionEntry, Scene } from "@framereader/shared";
import type { FrameInfo } from "./frameSampler";

interface VisualAnalysisResult {
  actionEntries: ActionEntry[];
  characters: string[];
  scenes: Scene[];
}

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  return client;
}

const VISION_SYSTEM_PROMPT = `You are a professional script supervisor analyzing video frames to create a screenplay. For each frame, describe what you see in terms of narrative significance — what matters for telling the story, not technical camera details.

Focus on:
- What characters are doing and their expressions/body language
- Significant props, costumes, or visual elements that drive the narrative
- Setting/location changes
- On-screen text, titles, or graphics
- Visual comedy elements (escalation, absurdity, contrast)
- Camera movements only when narratively meaningful (dramatic zoom, reveal)

Do NOT describe:
- Generic/obvious details (a person standing, a room with walls)
- Irrelevant background elements
- Frame-by-frame minutiae that doesn't advance understanding

Return ONLY valid JSON.`;

function buildBatchPrompt(
  frames: FrameInfo[],
  title: string,
  duration: number,
  batchIndex: number,
  previousContext: string
): string {
  return `Video: "${title}" (${Math.round(duration)}s total)
Batch ${batchIndex + 1} — frames at timestamps: ${frames.map((f) => `${f.timestamp.toFixed(1)}s`).join(", ")}
${previousContext ? `\nPrevious scene context: ${previousContext}` : ""}

Analyze each frame. Return JSON array:
[
  {
    "timestamp": <seconds as number>,
    "action": "<what is happening — narratively meaningful description>",
    "characters": ["<character descriptions>"],
    "onScreenText": "<visible text or null>",
    "significantProps": ["<notable objects/costumes>"] or null,
    "cameraNotes": "<only if narratively meaningful>" or null,
    "confidence": "high" or "uncertain"
  }
]`;
}

export async function analyzeFrames(
  jobId: string,
  frames: FrameInfo[],
  title: string,
  duration: number
): Promise<VisualAnalysisResult> {
  logger.info(`Starting visual analysis for job ${jobId}: ${frames.length} frames`);

  const anthropic = getClient();
  const allEntries: ActionEntry[] = [];
  const characterSet = new Set<string>();
  let previousContext = "";

  // Process in batches
  const batches: FrameInfo[][] = [];
  for (let i = 0; i < frames.length; i += VISION_BATCH_SIZE) {
    batches.push(frames.slice(i, i + VISION_BATCH_SIZE));
  }

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx];
    logger.debug(`Processing batch ${batchIdx + 1}/${batches.length} for job ${jobId}`);

    const imageContent: Anthropic.Messages.ImageBlockParam[] = batch
      .filter((frame) => fs.existsSync(frame.framePath))
      .map((frame) => ({
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: "image/jpeg" as const,
          data: fs.readFileSync(frame.framePath).toString("base64"),
        },
      }));

    if (imageContent.length === 0) continue;

    const textContent: Anthropic.Messages.TextBlockParam = {
      type: "text",
      text: buildBatchPrompt(batch, title, duration, batchIdx, previousContext),
    };

    let retries = 0;
    const maxRetries = 2;
    let success = false;

    while (!success && retries <= maxRetries) {
      try {
        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2048,
          system: VISION_SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: [...imageContent, textContent],
            },
          ],
        });

        const text =
          response.content[0].type === "text" ? response.content[0].text : "";

        // Parse JSON response (handle markdown code fences)
        const jsonStr = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        const parsed = JSON.parse(jsonStr) as Array<{
          timestamp: number;
          action: string;
          characters?: string[];
          onScreenText?: string | null;
          significantProps?: string[] | null;
          cameraNotes?: string | null;
          confidence?: string;
        }>;

        for (const entry of parsed) {
          const actionEntry: ActionEntry = {
            timestamp: entry.timestamp * 1000, // Convert to milliseconds
            action: entry.action,
            characters: entry.characters || [],
            onScreenText: entry.onScreenText || null,
            significantProps: entry.significantProps || null,
            cameraNotes: entry.cameraNotes || null,
            confidence: entry.confidence === "uncertain" ? "uncertain" : "high",
          };
          allEntries.push(actionEntry);

          for (const char of actionEntry.characters) {
            characterSet.add(char);
          }
        }

        // Build context for next batch
        if (parsed.length > 0) {
          const last = parsed[parsed.length - 1];
          previousContext = `At ${last.timestamp}s: ${last.action}`;
        }

        success = true;
      } catch (err) {
        retries++;
        if (retries > maxRetries) {
          logger.error(`Vision batch ${batchIdx} failed after ${maxRetries} retries`, {
            error: err,
          });
          // Continue with other batches
          break;
        }
        const delay = retries === 1 ? 5000 : 15000;
        logger.warn(`Vision batch ${batchIdx} failed, retrying in ${delay / 1000}s`, {
          error: err,
        });
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  // Build basic scenes from action entries
  const scenes = buildScenes(allEntries, duration);

  logger.info(`Visual analysis complete for job ${jobId}`, {
    actionEntries: allEntries.length,
    characters: characterSet.size,
    scenes: scenes.length,
  });

  return {
    actionEntries: allEntries,
    characters: Array.from(characterSet),
    scenes,
  };
}

function buildScenes(entries: ActionEntry[], duration: number): Scene[] {
  if (entries.length === 0) return [];

  const scenes: Scene[] = [];
  let currentScene: Scene = {
    sceneNumber: 1,
    startTime: 0,
    endTime: 0,
    heading: "INT. UNKNOWN LOCATION - DAY",
    description: "",
  };

  // Group entries into scenes based on significant time gaps (>10s)
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const prevEntry = i > 0 ? entries[i - 1] : null;

    if (prevEntry && entry.timestamp - prevEntry.timestamp > 10000) {
      // New scene
      currentScene.endTime = prevEntry.timestamp;
      currentScene.description = entries
        .filter(
          (e) => e.timestamp >= currentScene.startTime && e.timestamp <= currentScene.endTime
        )
        .map((e) => e.action)
        .join(" ");
      scenes.push(currentScene);

      currentScene = {
        sceneNumber: scenes.length + 1,
        startTime: entry.timestamp,
        endTime: 0,
        heading: `INT. LOCATION ${scenes.length + 1} - DAY`,
        description: "",
      };
    }
  }

  // Close last scene
  currentScene.endTime = entries[entries.length - 1].timestamp;
  currentScene.description = entries
    .filter(
      (e) => e.timestamp >= currentScene.startTime && e.timestamp <= currentScene.endTime
    )
    .map((e) => e.action)
    .join(" ");
  scenes.push(currentScene);

  return scenes;
}
