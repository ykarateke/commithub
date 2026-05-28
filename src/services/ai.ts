import * as https from 'https';
import * as http from 'http';
import { FileDiff } from './git';

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
  if (!files.length) return '(no tracked changes — see new files above)';

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

  if (!skipped.length) return included.map(f => f.rawDiff).join('\n');

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
    if (s.scopeDetection) parts.push(`- Scope from file paths`);
    if (s.includeBody) parts.push(`- Body after blank line, wrap at 72`);
    if (s.breakingChanges) parts.push(`- BREAKING CHANGE: footer if breaking`);
  } else {
    parts.push('', `## Rules`);
    parts.push(`- Subject line only`);
    if (s.includeBody) parts.push(`- Body after blank line`);
  }

  parts.push(`- Subject max: ${s.maxLength} chars`);
  if (s.emoji) parts.push(`- Emoji prefix`);
  if (s.tone !== 'auto' && toneNames[s.tone]) parts.push(`- Tone: ${toneNames[s.tone]}`);
  parts.push('', `Output ONLY the commit message. No markdown.`);

  return parts.join('\n');
}

function postJson(url: string, body: any, headers: Record<string, string>, timeout = 60000, signal?: AbortSignal): Promise<any> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const data = JSON.stringify(body);
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      timeout,
    };
    const req = mod.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const bodyText = Buffer.concat(chunks).toString();
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`HTTP ${res.statusCode}: ${bodyText.slice(0, 200)}`));
          return;
        }
        try { resolve(JSON.parse(bodyText)); }
        catch { reject(new Error(`Invalid JSON: ${bodyText.slice(0, 200)}`)); }
      });
    });
    req.on('error', (e) => {
      if (e.name === 'AbortError') { reject(new Error('Canceled')); return; }
      reject(e);
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
    if (signal) {
      signal.addEventListener('abort', () => { req.destroy(); }, { once: true });
    }
    req.write(data);
    req.end();
  });
}

async function makeStreamRequest(url: string, body: any, headers: Record<string, string>, signal?: AbortSignal): Promise<http.IncomingMessage> {
  const mod = url.startsWith('https') ? https : http;
  const data = JSON.stringify(body);
  const urlObj = new URL(url);
  const options = {
    hostname: urlObj.hostname,
    port: urlObj.port,
    path: urlObj.pathname + urlObj.search,
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    timeout: 120000,
  };

  return new Promise<http.IncomingMessage>((resolve, reject) => {
    const req = mod.request(options, (res) => { resolve(res); });
    req.on('error', (e) => { if (e.name === 'AbortError') { reject(new Error('Canceled')); } else { reject(e); } });
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
    if (signal) { signal.addEventListener('abort', () => { req.destroy(); }, { once: true }); }
    req.write(data);
    req.end();
  });
}

async function checkStreamError(stream: http.IncomingMessage): Promise<void> {
  if (stream.statusCode && stream.statusCode >= 200 && stream.statusCode < 300) return;
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
    if (cancelled) break;
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      yield trimmed;
    }
    if (finished) break;
  }
}

async function* streamPostJson(url: string, body: any, headers: Record<string, string>, logFn: (msg: string) => void, signal?: AbortSignal): AsyncGenerator<string | '__REASONING__', void, undefined> {
  const stream = await makeStreamRequest(url, body, headers, signal);
  await checkStreamError(stream);

  let cancelled = false;
  if (signal) { signal.addEventListener('abort', () => { cancelled = true; }, { once: true }); }

  let loggedFirstLine = false;
  let reasoningChunks = 0;
  let hasContent = false;
  const MAX_REASONING_WAIT = 50;
  for await (const line of parseSseLines(stream, cancelled)) {
    if (cancelled) break;
    if (!loggedFirstLine) {
      loggedFirstLine = true;
      logFn(`[stream debug] first SSE line: "${line.slice(0, 300)}"`);
    }
    if (!line.startsWith('data:')) continue;
    const json = line.slice(5).trim();
    if (json === '[DONE]') break;
    try {
      const parsed = JSON.parse(json);
      const delta = parsed?.choices?.[0]?.delta;
      if (delta?.reasoning_content) {
        reasoningChunks++;
        if (reasoningChunks === 1) {
          logFn(`[stream debug] reasoning model detected — yielding early signal`);
          yield '__REASONING__';
        }
        if (reasoningChunks >= MAX_REASONING_WAIT && !hasContent) {
          logFn(`[stream debug] early abort after ${reasoningChunks} reasoning chunks with no content`);
          break;
        }
        continue;
      }
      const content = delta?.content || parsed?.choices?.[0]?.text || '';
      if (content) {
        hasContent = true;
        yield content;
      }
    } catch { /* skip malformed chunk */ }
  }
  if (reasoningChunks > 0) {
    logFn(`[stream debug] ${reasoningChunks} reasoning chunks, hasContent=${hasContent}`);
  }
}

async function* streamPostAnthropic(url: string, body: any, headers: Record<string, string>, signal?: AbortSignal): AsyncGenerator<string, void, undefined> {
  const stream = await makeStreamRequest(url, { ...body, stream: true }, headers, signal);
  await checkStreamError(stream);

  let cancelled = false;
  if (signal) { signal.addEventListener('abort', () => { cancelled = true; }, { once: true }); }

  for await (const line of parseSseLines(stream, cancelled)) {
    if (cancelled) break;
    if (!line.startsWith('data:')) continue;
    const json = line.slice(5).trim();
    try {
      const parsed = JSON.parse(json);
      if (parsed?.type === 'content_block_delta') {
        const text = parsed?.delta?.text || '';
        if (text) yield text;
      }
    } catch { /* skip malformed chunk */ }
  }
}

async function* streamPostGemini(url: string, body: any, headers: Record<string, string>, signal?: AbortSignal): AsyncGenerator<string, void, undefined> {
  const streamUrl = url.replace(/:generateContent$/, ':streamGenerateContent?alt=sse');
  const stream = await makeStreamRequest(streamUrl, body, headers, signal);
  await checkStreamError(stream);

  let cancelled = false;
  if (signal) { signal.addEventListener('abort', () => { cancelled = true; }, { once: true }); }

  for await (const line of parseSseLines(stream, cancelled)) {
    if (cancelled) break;
    if (!line.startsWith('data:')) continue;
    const json = line.slice(5).trim();
    try {
      const parsed = JSON.parse(json);
      const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (text) yield text;
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

  const providerConfig = provider === 'anthropic' ? 'anthropic' : provider === 'google_gemini' ? 'gemini' : 'openai';

  try {
    let commitMsg: string;
    let usage: CommitUsage = { inputTokens: 0, outputTokens: 0 };
    let finishReason = '';

    if (providerConfig === 'anthropic') {
      const url = `${baseUrl.replace(/\/+$/, '')}/messages`;
      const body = {
        model,
        max_tokens: settings.maxTokens,
        system: prompt,
        messages: [{ role: 'user', content: 'Generate the commit message now.' }],
      };
      const headers: Record<string, string> = {
        'x-api-key': apiKey || '',
        'anthropic-version': '2023-06-01',
      };
      const data = await postJson(url, body, headers, 60000, signal);
      commitMsg = data?.content?.[0]?.text || '';
      finishReason = data?.content?.[0]?.stop_reason || data?.content?.[0]?.stop_sequence || '';
      usage = {
        inputTokens: data?.usage?.input_tokens ?? 0,
        outputTokens: data?.usage?.output_tokens ?? 0,
      };
    } else if (providerConfig === 'gemini') {
      const url = `${baseUrl.replace(/\/+$/, '')}/models/${model}:generateContent`;
      const body = {
        contents: [{ role: 'user', parts: [{ text: prompt + '\n\nGenerate the commit message now.' }] }],
      };
      const headers: Record<string, string> = { 'x-goog-api-key': apiKey || '' };
      const data = await postJson(url, body, headers, 60000, signal);
      commitMsg = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      finishReason = data?.candidates?.[0]?.finishReason || '';
      usage = {
        inputTokens: data?.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: data?.usageMetadata?.candidatesTokenCount ?? 0,
      };
    } else {
      const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
      const body = {
        model,
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: 'Generate the commit message now.' },
        ],
        temperature: settings.temperature,
        max_tokens: settings.maxTokens,
      };
      const headers: Record<string, string> = { 'Authorization': `Bearer ${apiKey || ''}` };
      const data = await postJson(url, body, headers, 60000, signal);
      commitMsg = data?.choices?.[0]?.message?.content || '';
      finishReason = data?.choices?.[0]?.finish_reason || '';
      usage = {
        inputTokens: data?.usage?.prompt_tokens ?? 0,
        outputTokens: data?.usage?.completion_tokens ?? 0,
      };
    }

    return { text: commitMsg.trim(), usage, finishReason };
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
  const promptStart = Date.now();
  const prompt = buildPrompt(settings);
  const config = provider === 'anthropic' ? 'anthropic' : provider === 'google_gemini' ? 'gemini' : 'openai';
  const cleanUrl = baseUrl.replace(/\/+$/, '');

  let fullText = '';
  let chunkCount = 0;
  let ttft = 0;

  logFn(`[stream] config=${config} model=${model} promptSize=${prompt.length} chars maxTokens=${settings.maxTokens} files=${settings.files.length}`);

  try {
    if (config === 'anthropic') {
      const url = `${cleanUrl}/messages`;
      const body = {
        model,
        max_tokens: settings.maxTokens,
        system: prompt,
        messages: [{ role: 'user', content: 'Generate the commit message now.' }],
      };
      const headers: Record<string, string> = {
        'x-api-key': apiKey || '',
        'anthropic-version': '2023-06-01',
      };
      const reqStart = Date.now();
      for await (const chunk of streamPostAnthropic(url, body, headers, signal)) {
        if (!ttft) { ttft = Date.now() - reqStart; }
        chunkCount++;
        fullText += chunk;
        yield chunk;
      }
      const totalMs = Date.now() - reqStart;
      logFn(`[stream] anthropic done — TTFT=${ttft}ms total=${totalMs}ms chunks=${chunkCount} responseLen=${fullText.length} chars`);
      return { text: fullText.trim(), usage: { inputTokens: 0, outputTokens: 0 }, finishReason: '' };
    }

    if (config === 'gemini') {
      const url = `${cleanUrl}/models/${model}:generateContent`;
      const body = {
        contents: [{ role: 'user', parts: [{ text: prompt + '\n\nGenerate the commit message now.' }] }],
      };
      const headers: Record<string, string> = { 'x-goog-api-key': apiKey || '' };
      const reqStart = Date.now();
      for await (const chunk of streamPostGemini(url, body, headers, signal)) {
        if (!ttft) { ttft = Date.now() - reqStart; }
        chunkCount++;
        fullText += chunk;
        yield chunk;
      }
      const totalMs = Date.now() - reqStart;
      logFn(`[stream] gemini done — TTFT=${ttft}ms total=${totalMs}ms chunks=${chunkCount} responseLen=${fullText.length} chars`);
      return { text: fullText.trim(), usage: { inputTokens: 0, outputTokens: 0 }, finishReason: '' };
    }

    const url = `${cleanUrl}/chat/completions`;
    const streamBody: any = {
      model,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: 'Generate the commit message now.' },
      ],
      temperature: settings.temperature,
      max_tokens: settings.maxTokens,
      stream: true,
    };
    if (provider === 'openai') {
      streamBody.stream_options = { include_usage: true };
    }
    const headers: Record<string, string> = { 'Authorization': `Bearer ${apiKey || ''}` };
    const reqStart = Date.now();
    let isReasoning = false;
    for await (const chunk of streamPostJson(url, streamBody, headers, logFn, signal)) {
      if (chunk === '__REASONING__') {
        isReasoning = true;
        continue;
      }
      if (!ttft) { ttft = Date.now() - reqStart; }
      chunkCount++;
      fullText += chunk;
      yield chunk;
    }
    const totalMs = Date.now() - reqStart;
    logFn(`[stream] openai-compat done — TTFT=${ttft}ms total=${totalMs}ms chunks=${chunkCount} responseLen=${fullText.length} chars reasoning=${isReasoning}`);

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

    return { text: fullText.trim(), usage: { inputTokens: 0, outputTokens: 0 }, finishReason: '' };
  } catch (e: any) {
    logFn(`[stream] FAILED after ${chunkCount} chunks, ${fullText.length} chars — ${e.message}`);
    if (e.message === 'Canceled') { throw e; }
    throw new Error(`AI streaming failed: ${e.message}`);
  }
}
