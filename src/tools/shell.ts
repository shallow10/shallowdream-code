import { exec } from 'child_process';
import { Tool, ToolResult } from './index.js';

export class BashTool implements Tool {
  definition = {
    name: 'Bash',
    description: 'Executes a shell command and returns the output. Use for running builds, tests, git commands, etc.',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The shell command to execute.',
        },
        cwd: {
          type: 'string',
          description: 'The working directory to run the command in.',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds.',
        },
      },
      required: ['command'],
    },
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const command = args.command as string;
    const cwd = (args.cwd as string) || process.cwd();
    const timeout = (args.timeout as number) || 60000;

    return new Promise((resolve) => {
      const child = exec(command, {
        cwd,
        maxBuffer: 10 * 1024 * 1024,
        timeout,
        shell: process.platform === 'win32' ? 'powershell.exe' : '/bin/bash',
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data;
      });

      child.stderr?.on('data', (data) => {
        stderr += data;
      });

      child.on('close', (code) => {
        const output = stdout + (stderr ? `\n[stderr]\n${stderr}` : '');
        resolve({
          toolCallId: '',
          content: output || `Command exited with code ${code}`,
          isError: code !== 0,
        });
      });

      child.on('error', (error) => {
        resolve({
          toolCallId: '',
          content: `Command execution error: ${error.message}`,
          isError: true,
        });
      });
    });
  }
}