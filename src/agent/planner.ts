import { LLMMessage, LLMProvider } from '../llm/index.js';
import { ToolRegistry, ToolCall, ToolResult } from '../tools/index.js';
import { Config } from '../config.js';
import { SYSTEM_PROMPT } from './prompts.js';
import chalk from 'chalk';
import { checkDangerousAction, isDangerousMode } from '../tools/safety.js';
import { ContextManager } from './context.js';

export interface PlanStep {
  id: number;
  description: string;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  toolCalls: ToolCall[];
  results: ToolResult[];
}

export interface AgentState {
  messages: LLMMessage[];
  iteration: number;
  maxIterations: number;
  task: string;
  currentPlan: PlanStep[];
  isComplete: boolean;
  toolResults: ToolResult[];
  workingDirectory: string;
  lastError?: string;
}

export function createInitialState(task: string, maxIterations: number, cwd: string): AgentState {
  return {
    messages: [
      {
        role: 'user',
        content: `Please help me with this task: ${task}\n\nRemember to:\n1. THINK about the approach\n2. PLAN the steps\n3. ACT on the plan\n4. VERIFY each step\n5. Iterate if needed\n\nWhen done, say TASK_COMPLETE`,
      },
    ],
    iteration: 0,
    maxIterations,
    task,
    currentPlan: [],
    isComplete: false,
    toolResults: [],
    workingDirectory: cwd,
  };
}

export class PlanningAgent {
  private toolRegistry: ToolRegistry;
  private llmProvider: LLMProvider;
  private config: Config;
  private contextManager: ContextManager;
  private onPlanUpdate?: (plan: PlanStep[]) => void;
  private onThinking?: (thought: string) => void;
  private onToolCall?: (toolCall: ToolCall) => void;
  private onToolResult?: (result: { name: string; content: string; isError?: boolean }) => void;

  constructor(
    toolRegistry: ToolRegistry,
    llmProvider: LLMProvider,
    config: Config,
    callbacks?: {
      onPlanUpdate?: (plan: PlanStep[]) => void;
      onThinking?: (thought: string) => void;
      onToolCall?: (toolCall: ToolCall) => void;
      onToolResult?: (result: { name: string; content: string; isError?: boolean }) => void;
    }
  ) {
    this.toolRegistry = toolRegistry;
    this.llmProvider = llmProvider;
    this.config = config;
    this.contextManager = new ContextManager();
    this.onPlanUpdate = callbacks?.onPlanUpdate;
    this.onThinking = callbacks?.onThinking;
    this.onToolCall = callbacks?.onToolCall;
    this.onToolResult = callbacks?.onToolResult;
  }

  async run(task: string): Promise<AgentState> {
    const state = createInitialState(task, this.config.maxIterations, process.cwd());
    const systemPrompt = SYSTEM_PROMPT.replace('{{cwd}}', state.workingDirectory);

    console.log(chalk.cyan('\n═══════════════════════════════════════════'));
    console.log(chalk.cyan('  ShallowDream Code - Planning Agent'));
    console.log(chalk.cyan('═══════════════════════════════════════════\n'));
    console.log(chalk.dim(`Task: ${task}\n`));

    while (!state.isComplete && state.iteration < state.maxIterations) {
      state.iteration++;
      console.log(chalk.dim(`\n─── Iteration ${state.iteration}/${state.maxIterations} ───\n`));

      const response = await this.llmProvider.chat(
        state.messages,
        this.toolRegistry.getAllDefinitions(),
        systemPrompt
      );

      if (response.content.includes('TASK_COMPLETE')) {
        const cleanContent = response.content.replace('TASK_COMPLETE', '').trim();
        if (cleanContent) {
          state.messages.push({ role: 'assistant', content: cleanContent });
          console.log(chalk.green('\n✓ Task completed!\n'));
          console.log(chalk.white(cleanContent));
        }
        state.isComplete = true;
        break;
      }

      if (response.toolCalls.length > 0) {
        state.messages.push({
          role: 'assistant',
          content: response.content || 'Executing tools...',
          tool_calls: response.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments),
            },
          })),
        });

        console.log(chalk.yellow('🤔 Thinking...\n'));
        if (response.content) {
          console.log(chalk.dim(response.content));
        }

        for (const toolCall of response.toolCalls) {
          this.onToolCall?.(toolCall);
          console.log(chalk.blue(`\n⚙ Executing: ${chalk.bold(toolCall.name)}`));
          if (Object.keys(toolCall.arguments).length > 0) {
            const argsStr = JSON.stringify(toolCall.arguments, null, 2)
              .replace(/\n/g, '\n  ')
              .slice(0, 500);
            console.log(chalk.dim(`  Args: ${argsStr}`));
          }

          const allowed = await checkDangerousAction(toolCall.name, toolCall.arguments);
          if (!allowed) {
            const deniedResult = {
              toolCallId: toolCall.id,
              content: '[操作被用户拒绝]',
              isError: true,
            };
            state.messages.push({
              role: 'tool',
              content: deniedResult.content,
              tool_call_id: deniedResult.toolCallId,
            });
            state.toolResults.push(deniedResult);
            this.onToolResult?.({
              name: toolCall.name,
              content: deniedResult.content,
              isError: true,
            });
            console.log(chalk.red(`  ✗ 操作被拒绝\n`));
            continue;
          }

          const cachedResult = this.contextManager.getCached(toolCall.name, toolCall.arguments);
          let result: ToolResult;
          if (cachedResult !== null) {
            result = {
              toolCallId: toolCall.id,
              content: cachedResult,
              isError: false,
            };
          } else {
            result = await this.toolRegistry.execute(toolCall);
            this.contextManager.setCache(toolCall.name, toolCall.arguments, result.content);
          }
          result.toolCallId = toolCall.id;

          state.messages.push({
            role: 'tool',
            content: result.content,
            tool_call_id: result.toolCallId,
          });

          state.toolResults.push(result);
          this.onToolResult?.({
            name: toolCall.name,
            content: result.content,
            isError: result.isError,
          });

          if (result.isError) {
            console.log(chalk.red(`\n✗ Error: ${result.content.slice(0, 200)}`));
          } else {
            const preview = result.content.slice(0, 300).replace(/\n/g, ' ');
            console.log(chalk.green(`\n✓ ${preview}${result.content.length > 300 ? '...' : ''}`));
          }
        }
      } else {
        if (response.content) {
          console.log(chalk.cyan('\n📝 Response:\n'));
          console.log(chalk.white(response.content));
        }
        state.messages.push({ role: 'assistant', content: response.content });
        state.isComplete = true;
      }

      if (!state.isComplete && state.iteration >= state.maxIterations) {
        console.log(chalk.red(`\n⚠ Maximum iterations (${state.maxIterations}) reached. Task may be incomplete.`));
        state.messages.push({
          role: 'assistant',
          content: `Maximum iterations reached. Please review the progress and continue manually if needed.`,
        });
      }
    }

    console.log(chalk.cyan('\n═══════════════════════════════════════════\n'));
    return state;
  }

  async runWithSubtasks(task: string, subtasks: string[]): Promise<AgentState> {
    let combinedState: AgentState | null = null;

    for (let i = 0; i < subtasks.length; i++) {
      const subtask = subtasks[i];
      console.log(chalk.cyan(`\n═══ Subtask ${i + 1}/${subtasks.length}: ${subtask} ═══\n`));

      const subtaskState = await this.run(subtask);
      combinedState = subtaskState;

      if (!subtaskState.isComplete) {
        console.log(chalk.red(`\n⚠ Subtask ${i + 1} failed, stopping.`));
        break;
      }
    }

    return combinedState || createInitialState(task, this.config.maxIterations, process.cwd());
  }
}