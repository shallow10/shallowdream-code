import { Tool, ToolResult } from './index.js';

export class WebSearchTool implements Tool {
  definition = {
    name: 'WebSearch',
    description: 'Searches the web for information. Returns search results.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query.',
        },
        num: {
          type: 'number',
          description: 'Maximum number of results.',
        },
      },
      required: ['query'],
    },
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const query = args.query as string;
    const num = (args.num as number) || 5;

    try {
      const response = await fetch(
        `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`,
        { signal: AbortSignal.timeout(10000) }
      );

      if (!response.ok) {
        return {
          toolCallId: '',
          content: `Web search returned status ${response.status}`,
          isError: true,
        };
      }

      const data = await response.json() as Record<string, unknown>;
      const results = (data.RelatedTopics as Array<{ Text?: string; FirstURL?: string }> || [])
        .slice(0, num)
        .map((r, i) => `${i + 1}. ${r.Text || 'No description'}\n   ${r.FirstURL || ''}`)
        .join('\n\n');

      return {
        toolCallId: '',
        content: results || `No results found for: ${query}`,
      };
    } catch (error) {
      return {
        toolCallId: '',
        content: `Web search error: ${error instanceof Error ? error.message : String(error)}`,
        isError: true,
      };
    }
  }
}

export class WebFetchTool implements Tool {
  definition = {
    name: 'WebFetch',
    description: 'Fetches content from a URL and returns it as text.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to fetch.',
        },
      },
      required: ['url'],
    },
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const url = args.url as string;

    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(15000),
        headers: {
          'User-Agent': 'ShallowDream-Code/1.0',
        },
      });

      if (!response.ok) {
        return {
          toolCallId: '',
          content: `HTTP ${response.status}: ${response.statusText}`,
          isError: true,
        };
      }

      const text = await response.text();
      const truncated = text.slice(0, 10000);

      return {
        toolCallId: '',
        content: truncated + (text.length > 10000 ? '\n\n... (content truncated)' : ''),
      };
    } catch (error) {
      return {
        toolCallId: '',
        content: `Fetch error: ${error instanceof Error ? error.message : String(error)}`,
        isError: true,
      };
    }
  }
}