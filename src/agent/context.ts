import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { homedir } from 'os';
import chalk from 'chalk';

export interface CacheEntry {
  key: string;
  result: string;
  timestamp: number;
  hitCount: number;
}

export interface ConversationContext {
  sessionId: string;
  messages: Array<{
    role: 'user' | 'assistant' | 'tool';
    content: string;
    tool_call_id?: string;
    tool_calls?: Array<{
      id: string;
      type: 'function';
      function: { name: string; arguments: string };
    }>;
  }>;
  toolResults: Array<{
    toolCallId: string;
    content: string;
    isError: boolean;
  }>;
  createdAt: number;
  lastActiveAt: number;
}

export class ContextManager {
  private cache: Map<string, CacheEntry> = new Map();
  private context: ConversationContext;
  private cacheDir: string;
  private maxCacheAge: number = 24 * 60 * 60 * 1000;
  private maxContextMessages: number = 100;

  constructor(sessionId?: string) {
    this.cacheDir = path.join(homedir(), '.shallowdream', 'cache');
    this.ensureCacheDir();
    this.loadCache();

    this.context = {
      sessionId: sessionId || this.generateSessionId(),
      messages: [],
      toolResults: [],
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
    };
  }

  private ensureCacheDir(): void {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  private generateSessionId(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  private getCacheFilePath(key: string): string {
    const hash = crypto.createHash('md5').update(key).digest('hex');
    return path.join(this.cacheDir, `${hash}.json`);
  }

  private loadCache(): void {
    try {
      const files = fs.readdirSync(this.cacheDir);
      const now = Date.now();

      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        const filePath = path.join(this.cacheDir, file);
        const stat = fs.statSync(filePath);

        if (now - stat.mtimeMs > this.maxCacheAge) {
          fs.unlinkSync(filePath);
          continue;
        }

        try {
          const entry: CacheEntry = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          this.cache.set(entry.key, entry);
        } catch {}
      }
    } catch {}
  }

  private saveCacheEntry(entry: CacheEntry): void {
    try {
      const filePath = this.getCacheFilePath(entry.key);
      fs.writeFileSync(filePath, JSON.stringify(entry));
    } catch {}
  }

  getCacheKey(toolName: string, args: Record<string, unknown>): string {
    return crypto
      .createHash('md5')
      .update(`${toolName}:${JSON.stringify(args)}`)
      .digest('hex');
  }

  getCached(toolName: string, args: Record<string, unknown>): string | null {
    const key = this.getCacheKey(toolName, args);
    const entry = this.cache.get(key);

    if (entry) {
      entry.hitCount++;
      entry.timestamp = Date.now();
      this.saveCacheEntry(entry);
      console.log(`  ${chalk.green('[Cache Hit]')} ${toolName} (hit #${entry.hitCount})`);
      return entry.result;
    }

    return null;
  }

  setCache(toolName: string, args: Record<string, unknown>, result: string): void {
    const key = this.getCacheKey(toolName, args);
    const entry: CacheEntry = {
      key,
      result,
      timestamp: Date.now(),
      hitCount: 1,
    };

    this.cache.set(key, entry);
    this.saveCacheEntry(entry);
  }

  addMessage(
    role: 'user' | 'assistant' | 'tool',
    content: string,
    toolCallId?: string,
    toolCalls?: ConversationContext['messages'][0]['tool_calls']
  ): void {
    this.context.messages.push({
      role,
      content,
      tool_call_id: toolCallId,
      tool_calls: toolCalls,
    });
    this.context.lastActiveAt = Date.now();

    if (this.context.messages.length > this.maxContextMessages) {
      this.context.messages = this.context.messages.slice(-this.maxContextMessages);
    }
  }

  addToolResult(toolCallId: string, content: string, isError: boolean): void {
    this.context.toolResults.push({ toolCallId, content, isError });
  }

  getMessages(): ConversationContext['messages'] {
    return this.context.messages;
  }

  getToolResults(): ConversationContext['toolResults'] {
    return this.context.toolResults;
  }

  getSessionId(): string {
    return this.context.sessionId;
  }

  getCacheStats(): { size: number; hits: number } {
    let hits = 0;
    for (const entry of this.cache.values()) {
      hits += entry.hitCount;
    }
    return { size: this.cache.size, hits };
  }

  clearCache(): void {
    this.cache.clear();
    try {
      const files = fs.readdirSync(this.cacheDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          fs.unlinkSync(path.join(this.cacheDir, file));
        }
      }
    } catch {}
  }

  saveContext(): void {
    try {
      const contextDir = path.join(homedir(), '.shallowdream', 'sessions');
      if (!fs.existsSync(contextDir)) {
        fs.mkdirSync(contextDir, { recursive: true });
      }
      const filePath = path.join(contextDir, `${this.context.sessionId}.json`);
      fs.writeFileSync(filePath, JSON.stringify(this.context, null, 2));
    } catch {}
  }

  loadContext(sessionId: string): boolean {
    try {
      const contextDir = path.join(homedir(), '.shallowdream', 'sessions');
      const filePath = path.join(contextDir, `${sessionId}.json`);
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf-8');
        this.context = JSON.parse(data);
        return true;
      }
    } catch {}
    return false;
  }
}