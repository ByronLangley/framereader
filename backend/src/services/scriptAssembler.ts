import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config";
import { logger } from "../utils/logger";
import type { DialogueEntry, ActionEntry, Scene, Platform } from "@framereader/shared";

interface AssemblyInput {
  title: string;
  duration: number;
  sourceUrl: string;
  platform: Platform;
  dialogueEntries: DialogueEntry[];
  actionEntries: ActionEntry[];
  speakers: string[];
  characters: string[];
  scenes: Scene[];
  transcriptionFailed: boolean;
  visualFailed: boolean;
}

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  return client;
}

const ASSEMBLY_SYSTEM_PROMPT = `You are a professional screenwriter and script supervisor. Your task is to convert raw video analysis data — a combination of audio transcription and visual frame descriptions — into a properly formatted screenplay.

RULES:
1. Scene headings: ALL CAPS, "INT." or "EXT.", location, time of day
   Example: INT. OFFICE - DAY
2. Character names: ALL CAPS, centered above their dialogue
   - Match speaker labels (Speaker A, Speaker B) to visual character descriptions using timing
   - Use recognized names when identifiable (e.g., "KEEGAN", "PEELE")
   - Fall back to descriptive labels ("MAN IN HAT", "WOMAN AT DESK")
   - Keep names CONSISTENT throughout
3. Dialogue: indented, below character name
4. Action lines: present tense, describe what we see, full width
5. Parentheticals: (in parentheses) between character name and dialogue for delivery notes
6. Include timestamp markers as comments every ~30 seconds: // [00:01:30]
7. Mark uncertain elements with [check this]
8. Note background music once at the metadata header if detected
9. Sound effects noted inline when narratively meaningful

OUTPUT: Return the complete screenplay as plain text. Do NOT wrap in JSON or code blocks. Start with the metadata header, then the screenplay body.`;

export async function assembleScript(
  jobId: string,
  input: AssemblyInput
): Promise<string> {
  logger.info(`Assembling script for job ${jobId}`);

  const anthropic = getClient();

  // Build the merged timeline
  const timeline = buildTimeline(input);

  const prompt = `Merge the following video analysis data into a professional screenplay.

VIDEO METADATA:
- Title: ${input.title}
- Duration: ${formatDuration(input.duration)}
- Source: ${input.sourceUrl}
- Platform: ${input.platform}
${input.transcriptionFailed ? "\nNOTE: Audio transcription failed. Script will be visual descriptions only." : ""}
${input.visualFailed ? "\nNOTE: Visual analysis failed. Script will be dialogue/transcript only." : ""}

SPEAKERS DETECTED: ${input.speakers.length > 0 ? input.speakers.join(", ") : "None"}
CHARACTERS SEEN: ${input.characters.length > 0 ? input.characters.join(", ") : "None"}

MERGED TIMELINE (chronological):
${timeline}

Start with this metadata header:
TITLE: ${input.title}
SOURCE: ${input.sourceUrl}
PLATFORM: ${input.platform.charAt(0).toUpperCase() + input.platform.slice(1)}
DURATION: ${formatDuration(input.duration)}
PROCESSED: ${new Date().toISOString().split("T")[0]}
BACKGROUND MUSIC: [Note if detected from descriptions, or "None detected"]

Then write the screenplay.`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8192,
    system: ASSEMBLY_SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
  });

  const script = response.content[0].type === "text" ? response.content[0].text : "";

  // Strip any code fences Claude may have wrapped it in
  const cleaned = script
    .replace(/^```[a-z]*\n?/gm, "")
    .replace(/```$/gm, "")
    .trim();

  logger.info(`Script assembled for job ${jobId}: ${cleaned.length} chars`);
  return cleaned;
}

function buildTimeline(input: AssemblyInput): string {
  type TimelineEntry = {
    timestamp: number;
    type: "dialogue" | "action";
    content: string;
  };

  const entries: TimelineEntry[] = [];

  for (const d of input.dialogueEntries) {
    entries.push({
      timestamp: d.startTime,
      type: "dialogue",
      content: `[DIALOGUE] ${d.speaker}: "${d.text}"`,
    });
  }

  for (const a of input.actionEntries) {
    const parts = [`[ACTION @ ${formatTimestamp(a.timestamp)}]`, a.action];
    if (a.characters.length > 0) parts.push(`Characters: ${a.characters.join(", ")}`);
    if (a.onScreenText) parts.push(`On-screen text: "${a.onScreenText}"`);
    if (a.significantProps) parts.push(`Props: ${a.significantProps.join(", ")}`);
    if (a.cameraNotes) parts.push(`Camera: ${a.cameraNotes}`);
    if (a.confidence === "uncertain") parts.push("[uncertain]");

    entries.push({
      timestamp: a.timestamp,
      type: "action",
      content: parts.join(" | "),
    });
  }

  // Sort by timestamp
  entries.sort((a, b) => a.timestamp - b.timestamp);

  return entries.map((e) => `${formatTimestamp(e.timestamp)} ${e.content}`).join("\n");
}

export function formatBasicScript(input: {
  title: string;
  duration: number;
  sourceUrl: string;
  platform: Platform;
  dialogueEntries: DialogueEntry[];
  actionEntries: ActionEntry[];
  transcriptionFailed: boolean;
  visualFailed: boolean;
}): string {
  const lines: string[] = [];

  lines.push(`TITLE: ${input.title}`);
  lines.push(`SOURCE: ${input.sourceUrl}`);
  lines.push(`PLATFORM: ${input.platform.charAt(0).toUpperCase() + input.platform.slice(1)}`);
  lines.push(`DURATION: ${formatDuration(input.duration)}`);
  lines.push(`PROCESSED: ${new Date().toISOString().split("T")[0]}`);
  lines.push(`BACKGROUND MUSIC: None detected`);
  lines.push("");
  lines.push("NOTE: Script formatting was simplified due to a processing issue.");
  lines.push("");
  lines.push("---");
  lines.push("");

  if (input.transcriptionFailed) {
    lines.push("[Audio transcription was unavailable for this video]");
    lines.push("");
  }

  if (input.visualFailed) {
    lines.push("[Visual analysis was unavailable for this video]");
    lines.push("");
  }

  // Merge timeline
  type Entry = { timestamp: number; text: string };
  const entries: Entry[] = [];

  for (const d of input.dialogueEntries) {
    entries.push({
      timestamp: d.startTime,
      text: `${d.speaker}: ${d.text}`,
    });
  }

  for (const a of input.actionEntries) {
    entries.push({
      timestamp: a.timestamp,
      text: `[${a.action}]${a.confidence === "uncertain" ? " [check this]" : ""}`,
    });
  }

  entries.sort((a, b) => a.timestamp - b.timestamp);

  for (const entry of entries) {
    lines.push(`${formatTimestamp(entry.timestamp)}  ${entry.text}`);
  }

  return lines.join("\n");
}

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
