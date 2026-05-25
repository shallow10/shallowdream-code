import { AgentState, createInitialState, addAssistantMessage, addToolResults, incrementIteration, markComplete } from './state.js';
import { ToolRegistry, ToolCall } from '../tools/index.js';
import { LLMProvider, LLMMessage } from '../llm/index.js';
import { Config } from '../config.js';

const SYSTEM_PROMPT = `You are ShallowDream Code, a powerful AI coding assistant that operates in the terminal. You help users with software engineering tasks.

## Your Capabilities
- Read, write, and edit files on the filesystem
- Execute shell commands (build, test, git, etc.)
- Search code with grep and glob patterns
- Search the web for information
- Connect to MCP servers for extended capabilities

## How You Work
1. Analyze the user's request carefully
2. Use tools to gather information about the codebase
3. Plan your approach
4. Execute changes using the available tools
5. Verify your work

## Important Rules
- Always use absolute paths for file operations
- Read files before editing them
- Execute commands to verify changes
- Be thorough and complete tasks fully
- When you have completed the task, say "TASK_COMPLETE" to signal completion

## Working Directory
The current working directory is provided at the start of each conversation.`;

export class AgentLoop {
  private toolRegistry: ToolRegistry;
  private llmProvider: LLMProvider;
  private config: Config;
  private onToken?: (token: string) => void;
  private onToolCall?: (toolCall: ToolCall) => void;
  private onToolResult?: (result: { name: string; content: string; isError?: boolean }) => void;

  constructor(
    toolRegistry: ToolRegistry,
    llmProvider: LLMProvider,
    config: Config,
    callbacks?: {
      onToken?: (token: string) => void;
      onToolCall?: (toolCall: ToolCall) => void;
      onToolResult?: (result: { name: string; content: string; isError?: boolean }) => void;
    }
  ) {
    this.toolRegistry = toolRegistry;
    this.llmProvider = llmProvider;
    this.config = config;
    this.onToken = callbacks?.onToken;
    this.onToolResult = callbacks?.onToolResult;
    this.onToolCall = callbacks?.onToolCall;
  }

  async run(task: string, cwd?: string): Promise<AgentState> {
    const state = createInitialState(
      task,
      this.config.maxIterations,
      cwd || process.cwd()
    );

    const systemPrompt = `${SYSTEM_PROMPT}\n\nCurrent working directory: ${state.workingDirectory}`;

    while (!state.isComplete && state.iteration < state.maxIterations) {
      const response = await this.llmProvider.chat(
        state.messages,
        this.toolRegistry.getAllDefinitions(),
        systemPrompt,
        this.onToken
      );

      if (response.content.includes('TASK_COMPLETE')) {
        addAssistantMessage(state, response.content.replace('TASK_COMPLETE', '').trim());
        markComplete(state);
        break;
      }

      if (response.toolCalls.length > 0) {
        addAssistantMessage(state, response.content, response.toolCalls);

        const results = [];
        for (const toolCall of response.toolCalls) {
          this.onToolCall?.(toolCall);
          const result = await this.toolRegistry.execute(toolCall);
          result.toolCallId = toolCall.id;
          results.push(result);
          this.onToolResult?.({
            name: toolCall.name,
            content: result.content,
            isError: result.isError,
          });
        }

        addToolResults(state, results);
      } else {
        addAssistantMessage(state, response.content);
        markComplete(state);
        break;
      }

      if (!incrementIteration(state)) {
        addAssistantMessage(state, '\n\n[Maximum iterations reached. Task may be incomplete.]');
        markComplete(state);
        break;
      }
    }

    return state;
  }
}