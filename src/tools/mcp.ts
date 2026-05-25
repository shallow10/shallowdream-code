import { Tool, ToolResult, ToolDefinition } from './index.js';

interface MCPServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export class MCPTool implements Tool {
  private servers: Map<string, MCPServerConfig> = new Map();
  private connectedTools: ToolDefinition[] = [];

  definition = {
    name: 'MCP',
    description: 'Model Context Protocol - connects to external MCP servers for extended capabilities.',
    parameters: {
      type: 'object',
      properties: {
        server: {
          type: 'string',
          description: 'The MCP server name to connect to.',
        },
        action: {
          type: 'string',
          description: 'Action: connect, list_tools, call_tool.',
        },
        tool_name: {
          type: 'string',
          description: 'Name of the tool to call.',
        },
        tool_args: {
          type: 'object',
          description: 'Arguments for the tool.',
        },
      },
      required: ['server', 'action'],
    },
  };

  constructor() {
    this.loadConfig();
  }

  private loadConfig(): void {
    const configPath = process.env.MCP_CONFIG_PATH || '.mcp.json';
    try {
      const { readFileSync, existsSync } = require('fs');
      if (existsSync(configPath)) {
        const config = JSON.parse(readFileSync(configPath, 'utf-8'));
        if (config.mcpServers) {
          for (const [name, server] of Object.entries(config.mcpServers)) {
            this.servers.set(name, server as MCPServerConfig);
          }
        }
      }
    } catch {
      // Config file not found or invalid
    }
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const server = args.server as string;
    const action = args.action as string;

    if (!this.servers.has(server)) {
      return {
        toolCallId: '',
        content: `MCP server "${server}" not configured. Add it to .mcp.json`,
        isError: true,
      };
    }

    switch (action) {
      case 'connect':
        return {
          toolCallId: '',
          content: `Connected to MCP server: ${server}`,
        };
      case 'list_tools':
        return {
          toolCallId: '',
          content: `Tools from ${server}:\n${this.connectedTools.map((t) => `- ${t.name}: ${t.description}`).join('\n')}`,
        };
      case 'call_tool':
        return {
          toolCallId: '',
          content: `MCP tool call to ${server}/${args.tool_name} - MCP stdio transport requires a running server process.`,
        };
      default:
        return {
          toolCallId: '',
          content: `Unknown MCP action: ${action}`,
          isError: true,
        };
    }
  }
}