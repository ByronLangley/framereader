import { AssemblyAI } from "assemblyai";
import { config } from "../config";
import { logger } from "../utils/logger";
import type { DialogueEntry } from "@framereader/shared";

interface TranscriptionResult {
  dialogueEntries: DialogueEntry[];
  speakers: string[];
}

let client: AssemblyAI | null = null;

function getClient(): AssemblyAI {
  if (!client) {
    client = new AssemblyAI({ apiKey: config.assemblyaiApiKey });
  }
  return client;
}

export async function transcribeAudio(
  jobId: string,
  audioPath: string
): Promise<TranscriptionResult> {
  logger.info(`Starting transcription for job ${jobId}: ${audioPath}`);

  const assemblyai = getClient();

  const transcript = await assemblyai.transcripts.transcribe({
    audio: audioPath,
    speaker_labels: true,
  });

  if (transcript.status === "error") {
    throw new Error(`AssemblyAI transcription error: ${transcript.error}`);
  }

  logger.info(`Transcription complete for job ${jobId}`, {
    wordCount: transcript.words?.length || 0,
    utteranceCount: transcript.utterances?.length || 0,
  });

  // Map utterances to dialogue entries
  const dialogueEntries: DialogueEntry[] = [];
  const speakerSet = new Set<string>();

  if (transcript.utterances) {
    for (const utterance of transcript.utterances) {
      const speaker = utterance.speaker || "Unknown";
      speakerSet.add(speaker);

      dialogueEntries.push({
        speaker: `Speaker ${speaker}`,
        text: utterance.text,
        startTime: utterance.start,
        endTime: utterance.end,
      });
    }
  } else if (transcript.words) {
    // Fallback: group words into sentence-like chunks
    let currentChunk: typeof transcript.words = [];
    let currentSpeaker = "";

    for (const word of transcript.words) {
      const speaker = (word as Record<string, unknown>).speaker as string || "A";
      if (speaker !== currentSpeaker && currentChunk.length > 0) {
        dialogueEntries.push({
          speaker: `Speaker ${currentSpeaker}`,
          text: currentChunk.map((w) => w.text).join(" "),
          startTime: currentChunk[0].start,
          endTime: currentChunk[currentChunk.length - 1].end,
        });
        currentChunk = [];
      }
      currentSpeaker = speaker;
      speakerSet.add(speaker);
      currentChunk.push(word);
    }

    if (currentChunk.length > 0) {
      dialogueEntries.push({
        speaker: `Speaker ${currentSpeaker}`,
        text: currentChunk.map((w) => w.text).join(" "),
        startTime: currentChunk[0].start,
        endTime: currentChunk[currentChunk.length - 1].end,
      });
    }
  }

  return {
    dialogueEntries,
    speakers: Array.from(speakerSet).map((s) => `Speaker ${s}`),
  };
}
