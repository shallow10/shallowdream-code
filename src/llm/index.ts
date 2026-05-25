import { ToolDefinition, ToolCall, ToolResult } from '../tools/index.js';
import { Config, getApiKey } from '../config.js';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

export interface LLMResponse {
  content: string;
  toolCalls: ToolCall[];
  finishReason: 'stop' | 'tool_calls' | 'length';
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface LLMProvider {
  chat(
    messages: LLMMessage[],
    tools: ToolDefinition[],
    systemPrompt: string,
    onToken?: (token: string) => void
  ): Promise<LLMResponse>;
}

export function createLLMProvider(config: Config): LLMProvider {
  const apiKey = getApiKey(config);

  if (config.provider === 'anthropic') {
    return new AnthropicProvider(apiKey, config);
  }
  return new OpenAIProvider(apiKey, config);
}

class AnthropicProvider implements LLMProvider {
  private apiKey: string;
  private model: string;
  private baseURL?: string;

  constructor(apiKey: string, config: Config) {
    this.apiKey = apiKey;
    this.model = config.model;
    this.baseURL = config.baseURL;
  }

  async chat(
    messages: LLMMessage[],
    tools: ToolDefinition[],
    systemPrompt: string,
    onToken?: (token: string) => void
  ): Promise<LLMResponse> {
    const Anthropic = await import('@anthropic-ai/sdk');
    const client = new Anthropic.default({
      apiKey: this.apiKey,
      baseURL: this.baseURL,
    });

    const systemMessages = messages.filter((m) => m.role === 'system');
    const conversationMessages = messages.filter((m) => m.role !== 'system');

    const anthropicMessages = conversationMessages.map((m) => {
      if (m.role === 'tool') {
        return {
          role: 'user' as const,
          content: [
            {
              type: 'tool_result' as const,
              tool_use_id: m.tool_call_id || '',
              content: m.content,
            },
          ],
        };
      }
      if (m.role === 'assistant' && m.tool_calls) {
        return {
          role: 'assistant' as const,
          content: m.tool_calls.map((tc) => ({
            type: 'tool_use' as const,
            id: tc.id,
            name: tc.function.name,
            input: JSON.parse(tc.function.arguments),
          })),
        };
      }
      return {
        role: m.role as 'user' | 'assistant',
        content: m.content,
      };
    });

    const anthropicTools = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: {
        type: 'object' as const,
        ...t.parameters,
        properties: t.parameters.properties || {},
      },
    }));

    const fullSystemPrompt = [
      systemPrompt,
      ...systemMessages.map((m) => m.content),
    ].join('\n\n');

    if (onToken) {
      const stream = await client.messages.create({
        model: this.model,
        max_tokens: 8192,
        system: fullSystemPrompt,
        messages: anthropicMessages,
        tools: anthropicTools,
        stream: true,
      });

      let fullContent = '';
      const toolCalls: ToolCall[] = [];
      const toolUseBlocks: Map<number, { id: string; name: string; input: string }> = new Map();

      for await (const event of stream) {
        if (event.type === 'content_block_delta') {
          const delta = event.delta as { type: string; text?: string; partial_json?: string };
          if (delta.text) {
            fullContent += delta.text;
            onToken(delta.text);
          } else if (delta.partial_json) {
            const block = toolUseBlocks.get(0);
            if (block) {
              block.input += delta.partial_json;
            }
          }
        } else if (event.type === 'content_block_start') {
          const block = event.content_block as { type: string; name?: string; id?: string };
          if (block.type === 'tool_use') {
            toolUseBlocks.set(0, {
              id: block.id || '',
              name: block.name || '',
              input: '',
            });
          }
        }
      }

      for (const [, block] of toolUseBlocks) {
        try {
          toolCalls.push({
            id: block.id,
            name: block.name,
            arguments: JSON.parse(block.input || '{}'),
          });
        } catch {
          toolCalls.push({
            id: block.id,
            name: block.name,
            arguments: {},
          });
        }
      }

      return {
        content: fullContent,
        toolCalls,
        finishReason: toolCalls.length > 0 ? 'tool_calls' : 'stop',
      };
    }

    const response = await client.messages.create({
      model: this.model,
      max_tokens: 8192,
      system: fullSystemPrompt,
      messages: anthropicMessages,
      tools: anthropicTools,
      stream: false,
    });

    const textContent = response.content
      .filter((c) => c.type === 'text')
      .map((c) => c.text || '')
      .join('');

    const toolCalls: ToolCall[] = response.content
      .filter((c) => c.type === 'tool_use')
      .map((c) => ({
        id: c.id || '',
        name: c.name || '',
        arguments: (c.input as Record<string, unknown>) || {},
      }));

    return {
      content: textContent,
      toolCalls,
      finishReason: toolCalls.length > 0 ? 'tool_calls' : 'stop',
      usage: response.usage ? {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      } : undefined,
    };
  }
}

class OpenAIProvider implements LLMProvider {
  private apiKey: string;
  private model: string;
  private baseURL?: string;

  constructor(apiKey: string, config: Config) {
    this.apiKey = apiKey;
    this.model = config.model;
    this.baseURL = config.baseURL;
  }

  async chat(
    messages: LLMMessage[],
    tools: ToolDefinition[],
    systemPrompt: string,
    onToken?: (token: string) => void
  ): Promise<LLMResponse> {
    const OpenAI = await import('openai');
    const client = new OpenAI.default({
      apiKey: this.apiKey,
      baseURL: this.baseURL,
    });

    const openaiMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...messages.map((m) => {
        if (m.role === 'tool') {
          return {
            role: 'tool' as const,
            content: m.content,
            tool_call_id: m.tool_call_id || '',
          };
        }
        if (m.role === 'assistant' && m.tool_calls) {
          return {
            role: 'assistant' as const,
            content: m.content || null,
            tool_calls: m.tool_calls,
          };
        }
        return {
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content,
        };
      }),
    ];

    const openaiTools = tools.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    if (onToken) {
      const stream = await client.chat.completions.create({
        model: this.model,
        messages: openaiMessages,
        tools: openaiTools,
        stream: true,
      });

      let fullContent = '';
      const toolCalls: Map<number, { id: string; name: string; arguments: string }> = new Map();

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (delta?.content) {
          fullContent += delta.content;
          onToken(delta.content);
        }
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index;
            if (!toolCalls.has(idx)) {
              toolCalls.set(idx, { id: tc.id || '', name: tc.function?.name || '', arguments: '' });
            }
            const existing = toolCalls.get(idx)!;
            if (tc.id) existing.id = tc.id;
            if (tc.function?.name) existing.name = tc.function.name;
            if (tc.function?.arguments) existing.arguments += tc.function.arguments;
          }
        }
      }

      const parsedToolCalls: ToolCall[] = [];
      for (const [, tc] of toolCalls) {
        try {
          parsedToolCalls.push({
            id: tc.id,
            name: tc.name,
            arguments: JSON.parse(tc.arguments || '{}'),
          });
        } catch {
          parsedToolCalls.push({ id: tc.id, name: tc.name, arguments: {} });
        }
      }

      return {
        content: fullContent,
        toolCalls: parsedToolCalls,
        finishReason: parsedToolCalls.length > 0 ? 'tool_calls' : 'stop',
      };
    }

    const response = await client.chat.completions.create({
      model: this.model,
      messages: openaiMessages,
      tools: openaiTools,
    });

    const choice = response.choices[0];
    const message = choice.message;

    const toolCalls: ToolCall[] = (message.tool_calls || []).map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: JSON.parse(tc.function.arguments),
    }));

    return {
      content: message.content || '',
      toolCalls,
      finishReason: toolCalls.length > 0 ? 'tool_calls' : choice.finish_reason as 'stop' | 'length',
      usage: response.usage ? {
        inputTokens: response.usage.prompt_tokens,
        outputTokens: response.usage.completion_tokens,
      } : undefined,
    };
  }
}