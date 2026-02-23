import { AssemblyAI } from "assemblyai";
import { config } from "../config";
import { logger } from "../utils/logger";
import type { DialogueEntry } from "@framereader/shared";

interface TranscriptionResult {
  dialogueEntries: DialogueEntry[];
  speakers: string[];
}

interface WordInfo {
  text: string;
  start: number;
  end: number;
  speaker?: string;
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
    speech_models: ["universal-2"],
  } as Parameters<typeof assemblyai.transcripts.transcribe>[0]);

  if (transcript.status === "error") {
    throw new Error(`AssemblyAI transcription error: ${transcript.error}`);
  }

  logger.info(`Transcription complete for job ${jobId}`, {
    wordCount: transcript.words?.length || 0,
    utteranceCount: transcript.utterances?.length || 0,
  });

  const speakerSet = new Set<string>();
  let dialogueEntries: DialogueEntry[] = [];

  // Build a word list with speaker labels
  const words: WordInfo[] = (transcript.words || []).map((w) => ({
    text: w.text,
    start: w.start,
    end: w.end,
    speaker: (w as Record<string, unknown>).speaker as string | undefined,
  }));

  if (transcript.utterances && transcript.utterances.length > 0) {
    // We have utterances — but they may be huge blocks for single-speaker videos.
    // Split them into sentences using word-level timestamps.
    for (const utterance of transcript.utterances) {
      const speaker = utterance.speaker || "Unknown";
      speakerSet.add(speaker);

      // Find the words that belong to this utterance by time range
      const utteranceWords = words.filter(
        (w) => w.start >= utterance.start && w.end <= utterance.end
      );

      if (utteranceWords.length > 0) {
        const sentences = splitWordsIntoSentences(utteranceWords, `Speaker ${speaker}`);
        dialogueEntries.push(...sentences);
      } else {
        // Fallback: split the utterance text into sentences with estimated timestamps
        const sentences = splitTextIntoSentences(
          utterance.text,
          `Speaker ${speaker}`,
          utterance.start,
          utterance.end
        );
        dialogueEntries.push(...sentences);
      }
    }
  } else if (words.length > 0) {
    // No utterances — group words by speaker, then split into sentences
    const speakerGroups = groupWordsBySpeaker(words);
    for (const group of speakerGroups) {
      speakerSet.add(group.speaker);
      const sentences = splitWordsIntoSentences(group.words, `Speaker ${group.speaker}`);
      dialogueEntries.push(...sentences);
    }
  }

  logger.info(`Dialogue entries after sentence splitting for job ${jobId}: ${dialogueEntries.length}`);

  return {
    dialogueEntries,
    speakers: Array.from(speakerSet).map((s) => `Speaker ${s}`),
  };
}

/**
 * Split words into sentence-level dialogue entries using punctuation.
 * Each sentence gets its own entry with accurate start/end timestamps from the words.
 */
function splitWordsIntoSentences(words: WordInfo[], speaker: string): DialogueEntry[] {
  const entries: DialogueEntry[] = [];
  let sentenceWords: WordInfo[] = [];

  for (const word of words) {
    sentenceWords.push(word);

    // Check if this word ends a sentence (period, exclamation, question mark)
    const trimmed = word.text.trim();
    const endsWithSentenceBreak =
      trimmed.endsWith(".") ||
      trimmed.endsWith("!") ||
      trimmed.endsWith("?");

    if (endsWithSentenceBreak && sentenceWords.length > 0) {
      entries.push({
        speaker,
        text: sentenceWords.map((w) => w.text).join(" "),
        startTime: sentenceWords[0].start,
        endTime: sentenceWords[sentenceWords.length - 1].end,
      });
      sentenceWords = [];
    }
  }

  // Don't lose any remaining words that didn't end with punctuation
  if (sentenceWords.length > 0) {
    entries.push({
      speaker,
      text: sentenceWords.map((w) => w.text).join(" "),
      startTime: sentenceWords[0].start,
      endTime: sentenceWords[sentenceWords.length - 1].end,
    });
  }

  return entries;
}

/**
 * Fallback: split a text string into sentences and estimate timestamps proportionally.
 */
function splitTextIntoSentences(
  text: string,
  speaker: string,
  startTime: number,
  endTime: number
): DialogueEntry[] {
  // Split on sentence-ending punctuation, keeping the punctuation attached
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const totalDuration = endTime - startTime;
  const totalChars = text.length;
  const entries: DialogueEntry[] = [];

  let currentTime = startTime;
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;

    const proportion = trimmed.length / totalChars;
    const sentenceDuration = totalDuration * proportion;

    entries.push({
      speaker,
      text: trimmed,
      startTime: currentTime,
      endTime: currentTime + sentenceDuration,
    });

    currentTime += sentenceDuration;
  }

  return entries;
}

/**
 * Group consecutive words by speaker label.
 */
function groupWordsBySpeaker(words: WordInfo[]): { speaker: string; words: WordInfo[] }[] {
  const groups: { speaker: string; words: WordInfo[] }[] = [];
  let currentSpeaker = "";
  let currentWords: WordInfo[] = [];

  for (const word of words) {
    const speaker = word.speaker || "A";
    if (speaker !== currentSpeaker && currentWords.length > 0) {
      groups.push({ speaker: currentSpeaker, words: currentWords });
      currentWords = [];
    }
    currentSpeaker = speaker;
    currentWords.push(word);
  }

  if (currentWords.length > 0) {
    groups.push({ speaker: currentSpeaker, words: currentWords });
  }

  return groups;
}
