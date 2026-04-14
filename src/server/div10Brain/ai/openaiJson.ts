import OpenAI from 'openai';
import type { Div10BrainEnv } from '../env.ts';

function extractJsonObject(content: string): unknown {
  const trimmed = content.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('No JSON object in model output');
  return JSON.parse(trimmed.slice(start, end + 1)) as unknown;
}

export async function runOpenAiJsonTask<T>(input: {
  env: Div10BrainEnv;
  model: string;
  system: string;
  user: string;
  parse: (raw: unknown) => { success: true; data: T } | { success: false; error: string };
}): Promise<T> {
  const client = new OpenAI({ apiKey: input.env.openaiApiKey });
  let lastErr: string | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const completion = await client.chat.completions.create({
      model: input.model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: input.system },
        { role: 'user', content: attempt === 0 ? input.user : `${input.user}\n\nReturn ONLY valid JSON matching the schema. Previous attempt failed: ${lastErr}` },
      ],
    });
    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error('Empty model response');
    let raw: unknown;
    try {
      raw = extractJsonObject(content);
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      continue;
    }
    const parsed = input.parse(raw);
    if (parsed.success !== true) {
      lastErr = (parsed as { success: false; error: string }).error;
      continue;
    }
    return parsed.data;
  }
  throw new Error(`Invalid JSON from model after retry: ${lastErr}`);
}
