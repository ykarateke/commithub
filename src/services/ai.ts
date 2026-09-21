import * as http from 'http';
import { FileDiff } from './git';
import { AdapterRequest, AdapterStreamEvent, getProviderAdapter, ProviderAdapter } from './adapters';
import { openJsonStream, requestJson } from './httpClient';

interface CommitSettings {
  files: FileDiff[];
  totalAdded: number;
  totalRemoved: number;
  summaryStats: string;
  language: string;
  maxLength: number;
  conventionalCommit: boolean;
  includeBody: boolean;
  includeFooter: boolean;
  emoji: boolean;
  tone: string;
  scopeDetection: boolean;
  breakingChanges: boolean;
  temperature: number;
  maxTokens: number;
  maxDiffSize: number;
  conventionalTypes: string[];
  modelProfile: 'fast' | 'balanced' | 'quality' | 'manual';
}

const langNames: Record<string, string> = {
  en: 'English', tr: 'Turkish', de: 'German', fr: 'French', es: 'Spanish',
  pt: 'Portuguese', it: 'Italian', nl: 'Dutch', pl: 'Polish', ru: 'Russian',
  ja: 'Japanese', ko: 'Korean', 'zh-CN': 'Chinese Simplified', 'zh-TW': 'Chinese Traditional',
  ar: 'Arabic', hi: 'Hindi', sv: 'Swedish', da: 'Danish', fi: 'Finnish',
  nb: 'Norwegian', cs: 'Czech', hu: 'Hungarian', ro: 'Romanian', uk: 'Ukrainian',
  el: 'Greek', th: 'Thai', vi: 'Vietnamese', bg: 'Bulgarian', hr: 'Croatian',
  sk: 'Slovak', sl: 'Slovenian',
};

const toneNames: Record<string, string> = {
  formal: 'professional and structured, use proper grammar',
  casual: 'friendly and conversational, but still clear',
  technical: 'precise and code-focused, use technical terminology',
};

function buildDiffSection(files: FileDiff[], maxDiffSize: number): string {
  if (!files.length) {return '(no tracked changes — see new files above)';}

  const totalSize = files.reduce((s, f) => s + f.rawDiff.length, 0);

  if (totalSize <= maxDiffSize) {
    return files.map(f => f.rawDiff).join('\n');
  }

  const fileCount = files.length;
  const excessFactor = totalSize / maxDiffSize;

  if (excessFactor >= 2 || fileCount > 20) {
    return files.map(f => {
      const funcs = [...new Set(f.hunks.map(h => h.funcName).filter(Boolean))];
      const funcStr = funcs.length ? ` (${funcs.join(', ')})` : '';
      const truncFlag = f.isTruncated ? ' [truncated]' : '';
      return `${f.filePath} | +${f.addedLines}/-${f.removedLines}${funcStr}${truncFlag}`;
    }).join('\n');
  }

  let budget = maxDiffSize;
  const included = files.filter(f => {
    if (f.rawDiff.length <= budget) { budget -= f.rawDiff.length; return true; }
    return false;
  });
  const skipped = files.filter(f => !included.includes(f));

  if (!skipped.length) {return included.map(f => f.rawDiff).join('\n');}

  return [
    included.map(f => f.rawDiff).join('\n'),
    '',
    '# Additional changed files (full diff omitted)',
    ...skipped.map(f => {
      const funcs = [...new Set(f.hunks.map(h => h.funcName).filter(Boolean))];
      const funcStr = funcs.length ? ` (${funcs.join(', ')})` : '';
      return `# ${f.filePath} | +${f.addedLines}/-${f.removedLines}${funcStr}`;
    }),
  ].join('\n');
}

function buildPrompt(s: CommitSettings): string {
  const lang = s.language === 'auto' ? 'same as the codebase' : (langNames[s.language] || 'English');
  const diffSection = buildDiffSection(s.files, s.maxDiffSize);
  const types = s.conventionalCommit
    ? (s.conventionalTypes.length ? s.conventionalTypes : ['feat', 'fix', 'chore', 'docs', 'style', 'refactor', 'perf', 'test', 'ci', 'build', 'revert']).join(', ')
    : '';

  const parts = [
    `Generate a ${lang} commit message for the changes below.`,
    '',
    `## Files`,
    s.summaryStats,
    '',
    `## Diff`,
    diffSection,
  ];

  if (s.conventionalCommit) {
    parts.push('', `## Rules`);
    parts.push(`- Format: type(scope): subject`);
    parts.push(`- Types: ${types}`);
    if (s.scopeDetection) {parts.push(`- Scope from file paths`);}
    if (s.includeBody) {parts.push(`- Body after blank line, wrap at 72`);}
    if (s.breakingChanges) {parts.push(`- BREAKING CHANGE: footer if breaking`);}
  } else {
    parts.push('', `## Rules`);
    parts.push(`- Subject line only`);
    if (s.includeBody) {parts.push(`- Body after blank line`);}
  }

  parts.push(`- Subject max: ${s.maxLength} chars`);
  if (s.emoji) {parts.push(`- Emoji prefix`);}
  if (s.tone !== 'auto' && toneNames[s.tone]) {parts.push(`- Tone: ${toneNames[s.tone]}`);}
  parts.push('', `Output ONLY the commit message. No markdown.`);

  return parts.join('\n');
}

async function checkStreamError(stream: http.IncomingMessage): Promise<void> {
  if (stream.statusCode && stream.statusCode >= 200 && stream.statusCode < 300) {return;}
  const errBody = await new Promise<string>(resolve => {
    const parts: Buffer[] = [];
    stream.on('data', (c: Buffer) => parts.push(c));
    stream.on('end', () => resolve(Buffer.concat(parts).toString()));
  });
  throw new Error(`HTTP ${stream.statusCode}: ${errBody.slice(0, 200)}`);
}

async function* parseSseLines(stream: http.IncomingMessage, cancelled: boolean): AsyncGenerator<string, void, undefined> {
  let buffer = '';
  let finished = false;
  for await (const chunk of stream) {
    if (cancelled) {break;}
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {continue;}
      yield trimmed;
    }
    if (finished) {break;}
  }
}

async function* streamAdapterEvents(
  request: AdapterRequest,
  adapter: ProviderAdapter,
  logFn: (msg: string) => void,
  signal?: AbortSignal,
): AsyncGenerator<AdapterStreamEvent, void, undefined> {
  const stream = await openJsonStream(request.url, request.body, request.headers, 120000, signal);
  await checkStreamError(stream);

  let loggedFirstLine = false;
  for await (const line of parseSseLines(stream, false)) {
    if (signal?.aborted) {break;}
    if (!loggedFirstLine) {
      loggedFirstLine = true;
      logFn(`[stream debug] first SSE line: "${line.slice(0, 300)}"`);
    }
    if (!line.startsWith('data:')) {continue;}
    const json = line.slice(5).trim();
    if (json === '[DONE]') {break;}
    try {
      yield adapter.parseStreamEvent(JSON.parse(json));
    } catch { /* skip malformed chunk */ }
  }
}

export interface CommitUsage {
  inputTokens: number;
  outputTokens: number;
}

export async function generateCommitMessage(
  provider: string,
  baseUrl: string,
  model: string,
  apiKey: string | undefined,
  settings: CommitSettings,
  signal?: AbortSignal,
): Promise<{ text: string; usage: CommitUsage; finishReason: string }> {
  const prompt = buildPrompt(settings);

  try {
    const adapter = getProviderAdapter(provider);
    const request = adapter.createRequest({ provider, baseUrl, model, apiKey, prompt, temperature: settings.temperature, maxTokens: settings.maxTokens, stream: false, modelProfile: settings.modelProfile });
    const data = await requestJson(request.url, request.body, request.headers, 60000, signal);
    const parsed = adapter.parseResponse(data);
    return {
      text: parsed.text.trim(),
      usage: { inputTokens: parsed.inputTokens, outputTokens: parsed.outputTokens },
      finishReason: parsed.finishReason,
    };
  } catch (e: any) {
    if (e.message === 'Canceled') { throw e; }
    throw new Error(`AI request failed: ${e.message}`);
  }
}

export async function* streamCommitMessage(
  provider: string,
  baseUrl: string,
  model: string,
  apiKey: string | undefined,
  settings: CommitSettings,
  logFn: (msg: string) => void,
  signal?: AbortSignal,
): AsyncGenerator<string, { text: string; usage: CommitUsage; finishReason: string }, undefined> {
  const prompt = buildPrompt(settings);
  const adapter = getProviderAdapter(provider);
  const config = adapter.protocol;
  const streamRequest = adapter.createRequest({ provider, baseUrl, model, apiKey, prompt, temperature: settings.temperature, maxTokens: settings.maxTokens, stream: true, modelProfile: settings.modelProfile });

  let fullText = '';
  let chunkCount = 0;
  let ttft = 0;

  logFn(`[stream] config=${config} model=${model} promptSize=${prompt.length} chars maxTokens=${settings.maxTokens} files=${settings.files.length}`);

  try {
    const reqStart = Date.now();
    let isReasoning = false;
    let reasoningChunks = 0;
    let usage: CommitUsage = { inputTokens: 0, outputTokens: 0 };
    let finishReason = '';
    for await (const event of streamAdapterEvents(streamRequest, adapter, logFn, signal)) {
      if (event.inputTokens !== undefined) {usage.inputTokens = event.inputTokens;}
      if (event.outputTokens !== undefined) {usage.outputTokens = event.outputTokens;}
      if (event.finishReason) {finishReason = event.finishReason;}
      if (event.reasoning) {
        isReasoning = true;
        reasoningChunks++;
        if (reasoningChunks === 1) {
          logFn('[stream debug] reasoning model detected');
          yield '__REASONING__';
        }
        if (reasoningChunks >= 50 && !fullText) {
          logFn(`[stream debug] early abort after ${reasoningChunks} reasoning chunks with no content`);
          break;
        }
        continue;
      }
      const chunk = event.text || '';
      if (!chunk) {continue;}
      if (!ttft) { ttft = Date.now() - reqStart; }
      chunkCount++;
      fullText += chunk;
      yield chunk;
    }
    const totalMs = Date.now() - reqStart;
    logFn(`[stream] ${config} done — TTFT=${ttft}ms total=${totalMs}ms chunks=${chunkCount} responseLen=${fullText.length} chars reasoning=${isReasoning}`);

    if (isReasoning && !fullText.trim()) {
      const wastedMs = Date.now() - reqStart;
      logFn(`[stream] reasoning model emptied token budget in ${wastedMs}ms — fast-falling back to non-streaming`);
      let fallback = await generateCommitMessage(provider, baseUrl, model, apiKey, settings, signal);
      fullText = fallback.text;

      if (!fullText.trim()) {
        logFn(`[stream] non-streaming also empty (${fallback.usage.outputTokens} tokens used) — retrying with maxTokens=2000`);
        const expandedSettings = { ...settings, maxTokens: 2000 };
        fallback = await generateCommitMessage(provider, baseUrl, model, apiKey, expandedSettings, signal);
        fullText = fallback.text;
      }

      if (fullText.trim()) {
        yield fullText;
      }
      return fallback;
    }

    if (!fullText.trim()) {
      logFn(`[stream] empty response — falling back to non-streaming`);
      const fallback = await generateCommitMessage(provider, baseUrl, model, apiKey, settings, signal);
      fullText = fallback.text;
      yield fullText;
      return fallback;
    }

    return { text: fullText.trim(), usage, finishReason };
  } catch (e: any) {
    logFn(`[stream] FAILED after ${chunkCount} chunks, ${fullText.length} chars — ${e.message}`);
    if (e.message === 'Canceled') { throw e; }
    throw new Error(`AI streaming failed: ${e.message}`);
  }
}
