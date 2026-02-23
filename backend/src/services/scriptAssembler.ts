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

const ASSEMBLY_SYSTEM_PROMPT = `You are a professional screenwriter converting video analysis data into a screenplay. The data includes audio transcription (dialogue with speaker labels) and visual frame descriptions (settings, characters present, and who appears to be speaking).

CRITICAL RULE — DIALOGUE MUST BE INTERLEAVED WITH ACTIONS SCENE BY SCENE:
The dialogue and visual actions are both timestamped. You MUST distribute dialogue throughout the screenplay so that it appears at the correct point in the timeline, interleaved with the action descriptions. Do NOT group all dialogue together at the top of a scene. Each action beat should be accompanied by the dialogue that occurs at that timestamp.

HOW TO INTERLEAVE:
1. Walk through the merged timeline in chronological order.
2. For each timestamp range (between two action/frame markers), place the dialogue lines that were spoken during that time window DIRECTLY BEFORE or AFTER the corresponding action line.
3. If a sentence of dialogue spans across two frame timestamps, keep the COMPLETE sentence together — place it at the timestamp where it begins. Never split a sentence in half.
4. The result should read like a real screenplay where you see an action, then the dialogue spoken during that moment, then the next action, then the next dialogue, and so on.

SPEAKER-CHARACTER MATCHING (do this FIRST, before writing):
1. The audio transcription has generic speaker labels (Speaker A, Speaker B, etc.)
2. The visual data shows which characters are present AND who appears to be speaking at various timestamps
3. Match each speaker label to a visual character by checking: at the timestamps when Speaker A talks, who is visually shown speaking?
4. Use contextual clues: dialogue content, gender of voice vs. visible characters
5. ONCE YOU ASSIGN a speaker to a character, KEEP IT CONSISTENT for the entire screenplay — never switch
6. If a speaker talks while off-camera, still attribute to the same character you already established
7. Different locations may have different characters — don't assume the same person unless they clearly match

CHARACTER NAMING:
- Name characters by their role or appearance: "MAN 1", "WOMAN 1", "WOMAN 2", "INSTRUCTOR", "CUSTOMER", etc.
- Use descriptive but BRIEF names — avoid long descriptions as names
- If you can identify a clear role (e.g. teacher, barista, interviewer), use that instead of a number
- A character in Scene 1 and a different character in Scene 2 should have DIFFERENT names unless they're clearly the same person

SCREENPLAY FORMAT:
1. Scene headings: ALL CAPS — "INT." or "EXT.", location, time of day
2. Character names: ALL CAPS above their dialogue
3. Dialogue: Write out EVERYTHING the person says. Every word matters. Do not summarize or skip. Break dialogue into individual sentences or short groups that match the timeline — do NOT dump all dialogue in one block.
4. Action lines: BRIEF (1 sentence max). Place them at the correct timestamp position in the screenplay.
5. Parentheticals: Only when delivery is unusual
6. Timestamp markers as comments before each action beat: // [00:00:02], // [00:00:04], etc. — use the actual timestamps from the timeline data
7. Do NOT include any on-screen text, subtitles, captions, or graphics
8. If background music is mentioned, note it in the metadata header

EXAMPLE of correct interleaving:

INT. OFFICE - DAY

Three people stand around a desk.

// [00:00:02]

Close-up of two hands engaged in a handshake.

MAN 1
A proper handshake lasts exactly three pumps.

// [00:00:04]

Chalk drawing on dark surface showing handshake instruction diagram.

MAN 1
Two pumps suggest you're hiding something.

// [00:00:06]

Close-up of the handshake between the two men.

MAN 1
Four pumps means you're European. Count silently.

// [00:00:08]

Back to the office scene. The two men face each other.

MAN 1
Honest, trustworthy American.

FADE OUT.

OUTPUT: Return the complete screenplay as plain text. Do NOT wrap in JSON or code blocks. Start with the metadata header, then the screenplay body.`;

export async function assembleScript(
  jobId: string,
  input: AssemblyInput
): Promise<string> {
  logger.info(`Assembling script for job ${jobId}`);

  const anthropic = getClient();

  // Build the merged timeline
  const timeline = buildTimeline(input);

  const dialogueCount = input.dialogueEntries.length;
  const speakerCount = input.speakers.length;

  const prompt = `Merge the following video analysis data into a professional screenplay.
${dialogueCount > 0 ? `\nIMPORTANT: There are ${dialogueCount} dialogue entries from ${speakerCount} distinct speaker(s). The dialogue MUST be the primary content. Write out ALL dialogue completely — do not summarize or skip any spoken words.` : ""}

VIDEO METADATA:
- Title: ${input.title}
- Duration: ${formatDuration(input.duration)}
- Source: ${input.sourceUrl}
- Platform: ${input.platform}
${input.transcriptionFailed ? "\nNOTE: Audio transcription failed. Script will be visual descriptions only." : ""}
${input.visualFailed ? "\nNOTE: Visual analysis failed. Script will be dialogue/transcript only." : ""}

AUDIO SPEAKERS DETECTED (from voice analysis): ${input.speakers.length > 0 ? input.speakers.join(", ") : "None"}
CHARACTERS SEEN ON SCREEN: ${input.characters.length > 0 ? input.characters.join(", ") : "None"}

STEP 1: Before writing, map each audio speaker to a visual character. Look at the "Appears to be speaking" cues in the timeline and cross-reference with dialogue timestamps. A speaker who talks at 5.2s should match the character shown speaking around 5s.

STEP 2: Assign each mapped character a consistent SHORT name (e.g., YOUNG MAN, SHOP OWNER). Use that name for ALL of that speaker's dialogue throughout — even when they're off-camera.

MERGED TIMELINE (chronological):
${timeline}

Start with this metadata header:
TITLE: ${input.title}
SOURCE: ${input.sourceUrl}
PLATFORM: ${input.platform.charAt(0).toUpperCase() + input.platform.slice(1)}
DURATION: ${formatDuration(input.duration)}
PROCESSED: ${new Date().toISOString().split("T")[0]}
BACKGROUND MUSIC: [Note if detected from descriptions, or "None detected"]

Then write the screenplay. REMEMBER: Distribute dialogue throughout the script so it appears at the correct timestamps alongside the matching action beats. Do NOT group all dialogue together — interleave it scene by scene, sentence by sentence. Keep complete sentences together; never split a sentence across two timestamps.`;

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
      content: `[DIALOGUE @ ${formatTimestamp(d.startTime)}-${formatTimestamp(d.endTime)}] ${d.speaker}: "${d.text}"`,
    });
  }

  for (const a of input.actionEntries) {
    const parts = [`[ACTION @ ${formatTimestamp(a.timestamp)}]`, a.action];
    if (a.characters.length > 0) parts.push(`Characters visible: ${a.characters.join(", ")}`);
    // onScreenText field carries the "who appears to be speaking" visual cue
    if (a.onScreenText) parts.push(`Appears to be speaking: ${a.onScreenText}`);

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
