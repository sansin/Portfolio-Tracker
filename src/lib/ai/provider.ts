import { generateText, generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

export type AIProvider = 'openai' | 'google' | 'anthropic';

const providers = {
  openai: () => openai('gpt-4o-mini'),
  google: () => google('gemini-2.5-flash'),
  anthropic: () => anthropic('claude-3-haiku-20240307'),
};

// Priority order for paid tier — Google Gemini 2.5 Flash is cheap and capable
// Pricing: ~$0.15 per 1M input tokens, ~$0.60 per 1M output tokens
// Cost controls: use flash model (not pro), keep prompts concise
const PROVIDER_PRIORITY: AIProvider[] = ['google', 'openai', 'anthropic'];

function getAvailableProvider(): { provider: AIProvider; model: ReturnType<typeof openai> } {
  for (const name of PROVIDER_PRIORITY) {
    const envKey = {
      openai: 'OPENAI_API_KEY',
      google: 'GOOGLE_GENERATIVE_AI_API_KEY',
      anthropic: 'ANTHROPIC_API_KEY',
    }[name];

    if (process.env[envKey]) {
      return { provider: name, model: providers[name]() as any };
    }
  }
  throw new Error('No AI provider configured. Set at least one API key in .env.local');
}

export async function aiGenerateText(prompt: string, systemPrompt?: string): Promise<{ text: string; provider: AIProvider }> {
  const { provider, model } = getAvailableProvider();

  const result = await generateText({
    model,
    system: systemPrompt,
    prompt,
  });

  return { text: result.text, provider };
}

export async function aiGenerateObject<T>(
  prompt: string,
  schema: z.ZodSchema<T>,
  systemPrompt?: string
): Promise<{ object: T; provider: AIProvider }> {
  const { provider, model } = getAvailableProvider();

  const result = await generateObject({
    model,
    system: systemPrompt,
    prompt,
    schema,
  });

  return { object: result.object, provider };
}

// For Vision (screenshot parsing) — uses Gemini 2.5 Flash (cost-effective vision)
export function getVisionProvider() {
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return google('gemini-2.5-flash');
  }
  if (process.env.OPENAI_API_KEY) {
    return openai('gpt-4o');
  }
  throw new Error('A Google Gemini or OpenAI API key is required for screenshot parsing');
}
