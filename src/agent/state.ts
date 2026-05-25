import { LLMMessage } from '../llm/index.js';
import { ToolCall, ToolResult } from '../tools/index.js';

export interface AgentState {
  messages: LLMMessage[];
  iteration: number;
  maxIterations: number;
  task: string;
  isComplete: boolean;
  toolResults: ToolResult[];
  workingDirectory: string;
}

export function createInitialState(task: string, maxIterations: number, cwd: string): AgentState {
  return {
    messages: [
      {
        role: 'user',
        content: task,
      },
    ],
    iteration: 0,
    maxIterations,
    task,
    isComplete: false,
    toolResults: [],
    workingDirectory: cwd,
  };
}

export function addUserMessage(state: AgentState, content: string): void {
  state.messages.push({ role: 'user', content });
}

export function addAssistantMessage(state: AgentState, content: string, toolCalls?: ToolCall[]): void {
  const msg: LLMMessage = {
    role: 'assistant',
    content,
  };
  if (toolCalls && toolCalls.length > 0) {
    msg.tool_calls = toolCalls.map((tc) => ({
      id: tc.id,
      type: 'function' as const,
      function: {
        name: tc.name,
        arguments: JSON.stringify(tc.arguments),
      },
    }));
  }
  state.messages.push(msg);
}

export function addToolResults(state: AgentState, results: ToolResult[]): void {
  for (const result of results) {
    state.messages.push({
      role: 'tool',
      content: result.content,
      tool_call_id: result.toolCallId,
    });
  }
  state.toolResults.push(...results);
}

export function incrementIteration(state: AgentState): boolean {
  state.iteration++;
  return state.iteration < state.maxIterations;
}

export function markComplete(state: AgentState): void {
  state.isComplete = true;
}