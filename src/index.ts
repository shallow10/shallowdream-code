import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig } from './config.js';
import { ToolRegistry } from './tools/index.js';
import { ReadFileTool, WriteFileTool, EditFileTool, LSFileTool, DeleteFileTool } from './tools/file.js';
import { BashTool } from './tools/shell.js';
import { GrepTool, GlobTool, SearchCodebaseTool } from './tools/search.js';
import { WebSearchTool, WebFetchTool } from './tools/web.js';
import { MCPTool } from './tools/mcp.js';
import { createLLMProvider } from './llm/index.js';
import { PlanningAgent } from './agent/planner.js';
import { enableDangerousMode } from './tools/safety.js';
import { createInterface } from 'readline';
import { existsSync } from 'fs';

function createToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(new ReadFileTool());
  registry.register(new WriteFileTool());
  registry.register(new EditFileTool());
  registry.register(new LSFileTool());
  registry.register(new DeleteFileTool());
  registry.register(new BashTool());
  registry.register(new GrepTool());
  registry.register(new GlobTool());
  registry.register(new SearchCodebaseTool());
  registry.register(new WebSearchTool());
  registry.register(new WebFetchTool());
  registry.register(new MCPTool());
  return registry;
}

async function runSingleTask(task: string, config: ReturnType<typeof loadConfig>): Promise<void> {
  const toolRegistry = createToolRegistry();
  const llmProvider = createLLMProvider(config);

  const agent = new PlanningAgent(toolRegistry, llmProvider, config, {
    onToolCall: (tc) => {
      process.stdout.write(chalk.yellow(`  → ${tc.name}\n`));
    },
    onToolResult: (r) => {
      const icon = r.isError ? chalk.red('✗') : chalk.green('✓');
      const preview = r.content.slice(0, 150).replace(/\n/g, ' ');
      console.log(`  ${icon} ${chalk.dim(preview)}\n`);
    },
  });

  await agent.run(task);
}

async function runInteractive(config: ReturnType<typeof loadConfig>): Promise<void> {
  const toolRegistry = createToolRegistry();
  const llmProvider = createLLMProvider(config);

  console.log(chalk.cyan(`
  ╔════════════════════════════════════════════════════════╗
  ║                                                        ║
  ║     ███████╗██╗  ██╗███████╗██╗     ██╗ ██████╗      ║
  ║     ██╔════╝██║  ██║██╔════╝██║     ██║██╔════╝      ║
  ║     ███████╗███████║█████╗  ██║     ██║██║            ║
  ║     ╚════██║██╔══██║██╔══╝  ██║     ██║██║            ║
  ║     ███████║██║  ██║███████╗███████╗██║╚██████╗      ║
  ║     ╚══════╝╚═╝  ╚═╝╚══════╝╚══════╝╚═╝ ╚═════╝      ║
  ║                                                        ║
  ║           ShallowDream Code v1.0 - AI Coding Agent     ║
  ║                                                        ║
  ╚════════════════════════════════════════════════════════╝
  `));

  console.log(chalk.dim('  Type your task and press Enter. Commands:\n'));
  console.log(chalk.cyan('    /help     ') + chalk.dim('- Show this help'));
  console.log(chalk.cyan('    /exit     ') + chalk.dim('- Exit ShallowDream Code'));
  console.log(chalk.cyan('    /tools    ') + chalk.dim('- List available tools'));
  console.log(chalk.cyan('    /config   ') + chalk.dim('- Show current config\n'));
  console.log(chalk.cyan('    /plan     ') + chalk.dim('- Plan a complex task\n'));
  console.log(chalk.cyan('  ─────────────────────────────────────────────\n'));
  console.log(chalk.dim('  Tip: Multi-line input with Ctrl+J, paste with Ctrl+V\n'));

  let inputBuffer = '';
  let historyIndex = -1;
  const inputHistory: string[] = [];

  process.stdin.setRawMode?.(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf-8');

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '',
  });

  let currentInput = '';
  let cursorPos = 0;
  let isMultiLine = false;
  const lines: string[] = [''];

  const redrawInput = () => {
    process.stdout.moveCursor(0, -lines.length + 1);
    (process.stdout as any).clearLine(2);
    let output = lines.join('\n');
    if (lines.length > 1 || cursorPos < output.length) {
      process.stdout.write(chalk.green('❯ ') + output + '\x1b[0G');
      const charsToMoveBack = output.length - cursorPos;
      if (charsToMoveBack > 0) {
        process.stdout.moveCursor(-charsToMoveBack, 0);
      }
    } else {
      process.stdout.write(chalk.green('❯ ') + output);
    }
  };

  const commitLine = () => {
    if (lines.length === 1) {
      inputBuffer = lines[0].trim();
    } else {
      lines.push('');
    }
    isMultiLine = false;
  };

  const handleKeyPress = async (): Promise<string> => {
    return new Promise((resolve) => {
      const cleanup = () => {
        process.stdin.removeListener('data', onData);
      };

      const onData = (chunk: string) => {
        const s = chunk;

        for (let i = 0; i < s.length; i++) {
          const c = s[i];
          const code = s.charCodeAt(i);

          if (code === 3) {
            cleanup();
            console.log(chalk.yellow('\n  [Ctrl+C] 取消输入\n'));
            resolve('');
            return;
          }

          if (code === 13 || code === 10) {
            if (s.charCodeAt(i + 1) === 10) i++;
            if (code === 10 && !s[i - 1]) {
              isMultiLine = !isMultiLine;
              if (isMultiLine) {
                lines.push('');
                process.stdout.write('\n');
              } else {
                commitLine();
                cleanup();
                resolve(inputBuffer);
                return;
              }
            } else {
              commitLine();
              cleanup();
              resolve(inputBuffer);
              return;
            }
            continue;
          }

          if (code === 127 || code === 8) {
            if (cursorPos > 0) {
              const totalBefore = lines.slice(0, lines.length - 1).join('\n').length + (lines.length > 1 ? lines.length - 1 : 0);
              if (cursorPos <= lines[0].length) {
                lines[0] = lines[0].slice(0, cursorPos - 1) + lines[0].slice(cursorPos);
              }
              cursorPos--;
              redrawInput();
            }
            continue;
          }

          if (c === '\t') {
            continue;
          }

          if (c >= ' ' || c === '\x1b') {
            if (lines.length === 1) {
              lines[0] = lines[0].slice(0, cursorPos) + c + lines[0].slice(cursorPos);
            }
            cursorPos++;
            redrawInput();
          }
        }
      };

      process.stdin.on('data', onData);
    });
  };

  const askQuestion = async (): Promise<string> => {
    process.stdout.write(chalk.green('\n❯ '));
    currentInput = '';
    cursorPos = 0;
    lines[0] = '';
    inputBuffer = '';

    const input = await handleKeyPress();

    if (input.trim()) {
      inputHistory.push(input.trim());
      historyIndex = inputHistory.length;
    }

    return input.trim();
  };

  let running = true;

  while (running) {
    const input = await askQuestion();

    if (!input) continue;

    if (input.startsWith('/')) {
      const cmd = input.slice(1).toLowerCase().split(' ')[0];
      const args = input.slice(1).split(' ').slice(1).join(' ');

      switch (cmd) {
        case 'exit':
        case 'quit':
          running = false;
          console.log(chalk.cyan('\n  Goodbye! Happy coding!\n'));
          break;
        case 'help':
          console.log(chalk.dim('\n  Available commands:\n'));
          console.log(chalk.cyan('    /help     ') + chalk.dim('- Show this help'));
          console.log(chalk.cyan('    /exit     ') + chalk.dim('- Exit'));
          console.log(chalk.cyan('    /tools    ') + chalk.dim('- List tools'));
          console.log(chalk.cyan('    /config   ') + chalk.dim('- Show config'));
          console.log(chalk.cyan('    /plan     ') + chalk.dim('- Plan a task'));
          console.log('');
          break;
        case 'tools':
          console.log(chalk.dim('\n  Available Tools:\n'));
          for (const tool of toolRegistry.getAllDefinitions()) {
            console.log(`  ${chalk.cyan(tool.name.padEnd(15))} ${chalk.dim(tool.description.slice(0, 50))}`);
          }
          console.log('');
          break;
        case 'config':
          console.log(chalk.dim('\n  Current Configuration:\n'));
          console.log(`  ${chalk.cyan('provider')}:      ${config.provider}`);
          console.log(`  ${chalk.cyan('model')}:        ${config.model}`);
          console.log(`  ${chalk.cyan('baseURL')}:      ${config.baseURL || 'default'}`);
          console.log(`  ${chalk.cyan('maxIterations')}: ${config.maxIterations}`);
          console.log('');
          break;
        case 'plan':
          if (!args) {
            console.log(chalk.yellow('\n  Usage: /plan <task description>\n'));
          } else {
            console.log(chalk.dim(`\n  Planning task: ${args}\n`));
            await runSingleTask(args, config);
          }
          break;
        default:
          console.log(chalk.red(`\n  Unknown command: /${cmd}\n`));
      }
      continue;
    }

    await runSingleTask(input, config);
  }

  rl.close();
}

export async function main(): Promise<void> {
  const program = new Command();

  program
    .name('sd')
    .description('ShallowDream Code - AI coding agent with planning capabilities')
    .version('1.0.0')
    .argument('[task]', 'Task to perform (if omitted, enters interactive mode)')
    .option('-p, --provider <provider>', 'LLM provider (anthropic or openai)')
    .option('-m, --model <model>', 'Model to use')
    .option('--max-iterations <n>', 'Maximum agent iterations', '50')
    .option('-d, --dangerous', 'Enable dangerous mode (skip all confirmations)', false)
    .action(async (task, options) => {
      const config = loadConfig();

      if (options.provider) {
        (config as any).provider = options.provider;
      }
      if (options.model) {
        (config as any).model = options.model;
      }
      if (options.maxIterations) {
        (config as any).maxIterations = parseInt(options.maxIterations, 10);
      }
      if (options.dangerous) {
        enableDangerousMode();
        console.log(chalk.red('\n  ⚠️  警告: 危险模式已启用！所有操作将自动允许。\n'));
      }

      if (task) {
        await runSingleTask(task, config);
      } else {
        await runInteractive(config);
      }
    });

  await program.parseAsync(process.argv);
}

main().catch((error) => {
  console.error(chalk.red(`\nFatal error: ${error.message}\n`));
  process.exit(1);
});