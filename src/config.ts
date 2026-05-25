import { z } from 'zod';
import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export const ConfigSchema = z.object({
  provider: z.enum(['anthropic', 'openai']).default('anthropic'),
  model: z.string().default('claude-sonnet-4-20250514'),
  maxIterations: z.number().default(50),
  apiKey: z.string().optional(),
  baseURL: z.string().optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

let cachedConfig: Config | null = null;

export function loadConfig(): Config {
  if (cachedConfig) return cachedConfig;

  const configPaths = [
    join(process.cwd(), '.sdrc.json'),
    join(homedir(), '.sdrc.json'),
  ];

  for (const configPath of configPaths) {
    if (existsSync(configPath)) {
      try {
        const raw = JSON.parse(readFileSync(configPath, 'utf-8'));
        cachedConfig = ConfigSchema.parse({
          ...raw,
          baseURL: raw.baseURL || process.env.ANTHROPIC_BASE_URL || raw.env?.ANTHROPIC_BASE_URL,
          apiKey: raw.apiKey || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY,
          model: raw.model || process.env.ANTHROPIC_MODEL || raw.env?.ANTHROPIC_MODEL,
        });
        return cachedConfig;
      } catch {
        continue;
      }
    }
  }

  cachedConfig = ConfigSchema.parse({
    baseURL: process.env.ANTHROPIC_BASE_URL,
    apiKey: process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY,
    model: process.env.ANTHROPIC_MODEL,
  });
  return cachedConfig;
}

export function getApiKey(config: Config): string {
  if (config.apiKey) return config.apiKey;

  if (config.provider === 'anthropic') {
    return process.env.ANTHROPIC_API_KEY || '';
  }
  return process.env.OPENAI_API_KEY || '';
}