import chalk from 'chalk';
import { ToolCall } from '../tools/index.js';

export class TerminalUI {
  private isInteractive: boolean;

  constructor(interactive: boolean = true) {
    this.isInteractive = interactive;
  }

  printBanner(): void {
    console.log('');
    console.log(chalk.cyan('  ╔══════════════════════════════════════════╗'));
    console.log(chalk.cyan('  ║') + chalk.bold.cyan('     ShallowDream Code v1.0.0') + chalk.cyan('           ║'));
    console.log(chalk.cyan('  ║') + chalk.dim('     AI coding agent in your terminal') + chalk.cyan('  ║'));
    console.log(chalk.cyan('  ╚══════════════════════════════════════════╝'));
    console.log('');
  }

  printHelp(): void {
    console.log(chalk.bold('\nCommands:'));
    console.log('  ' + chalk.cyan('/help') + '     - Show this help');
    console.log('  ' + chalk.cyan('/clear') + '    - Clear conversation');
    console.log('  ' + chalk.cyan('/exit') + '     - Exit ShallowDream Code');
    console.log('  ' + chalk.cyan('/config') + '   - Show current configuration');
    console.log('  ' + chalk.cyan('/tools') + '    - List available tools');
    console.log('');
  }

  printPrompt(): void {
    process.stdout.write(chalk.green('\n❯ '));
  }

  printThinking(): void {
    process.stdout.write(chalk.dim('  Thinking...'));
  }

  clearThinking(): void {
    process.stdout.write('\r\x1b[K');
  }

  printToolCall(toolCall: ToolCall): void {
    const argsStr = JSON.stringify(toolCall.arguments).slice(0, 80);
    console.log(chalk.yellow(`  ⚙ ${toolCall.name}`) + chalk.dim(` ${argsStr}`));
  }

  printToolResult(name: string, content: string, isError?: boolean): void {
    const prefix = isError ? chalk.red('  ✗') : chalk.green('  ✓');
    const truncated = content.slice(0, 200).replace(/\n/g, ' ');
    console.log(`${prefix} ${chalk.dim(truncated)}${content.length > 200 ? '...' : ''}`);
  }

  printToken(token: string): void {
    process.stdout.write(token);
  }

  printAssistantHeader(): void {
    console.log(chalk.cyan('\n  ShallowDream:'));
    console.log('');
  }

  printSeparator(): void {
    console.log(chalk.dim('\n' + '─'.repeat(60)));
  }

  printError(message: string): void {
    console.log(chalk.red(`\n  Error: ${message}`));
  }

  printInfo(message: string): void {
    console.log(chalk.blue(`  ℹ ${message}`));
  }

  printSuccess(message: string): void {
    console.log(chalk.green(`  ✓ ${message}`));
  }

  printConfig(config: Record<string, unknown>): void {
    console.log(chalk.bold('\nConfiguration:'));
    for (const [key, value] of Object.entries(config)) {
      const displayValue = key === 'apiKey' && value ? '***' : value;
      console.log(`  ${chalk.cyan(key)}: ${displayValue}`);
    }
    console.log('');
  }

  printTools(tools: Array<{ name: string; description: string }>): void {
    console.log(chalk.bold('\nAvailable Tools:'));
    for (const tool of tools) {
      console.log(`  ${chalk.cyan(tool.name.padEnd(18))} ${chalk.dim(tool.description)}`);
    }
    console.log('');
  }

  printGoodbye(): void {
    console.log(chalk.cyan('\n  Goodbye! Thanks for using ShallowDream Code.\n'));
  }
}