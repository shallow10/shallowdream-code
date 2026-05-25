import chalk from 'chalk';

export interface SafetyConfig {
  dangerousMode: boolean;
  allowDelete: boolean;
  allowExecute: boolean;
}

const safetyConfig: SafetyConfig = {
  dangerousMode: false,
  allowDelete: true,
  allowExecute: true,
};

export function enableDangerousMode(): void {
  safetyConfig.dangerousMode = true;
  safetyConfig.allowDelete = true;
  safetyConfig.allowExecute = true;
}

export function isDangerousMode(): boolean {
  return safetyConfig.dangerousMode;
}

export function isAllowDelete(): boolean {
  return safetyConfig.allowDelete || safetyConfig.dangerousMode;
}

export function isAllowExecute(): boolean {
  return safetyConfig.allowExecute || safetyConfig.dangerousMode;
}

function isTrulyDangerous(toolName: string, args: Record<string, unknown>): boolean {
  switch (toolName) {
    case 'Delete': {
      const filePaths = (args.file_paths as string[]) || [];
      for (const fp of filePaths) {
        const lower = fp.toLowerCase();
        if (
          lower.includes('node_modules') ||
          lower.includes('.git') ||
          lower.includes('windows') ||
          lower.includes('system32') ||
          lower.includes('appdata') ||
          lower.includes('program files') ||
          fp === 'C:\\' ||
          fp === 'C:' ||
          fp.endsWith(':\\')
        ) {
          return true;
        }
        if (lower.includes('rm -rf') || lower.includes('del /') || lower.includes('*')) {
          return true;
        }
      }
      return false;
    }

    case 'Bash': {
      const cmd = (args.command as string || '').toLowerCase();
      if (
        cmd.includes('rm -rf') ||
        cmd.includes('del /s /q') ||
        cmd.includes('format ') ||
        cmd.includes('dd if=') ||
        cmd.includes('> /dev/') ||
        cmd.includes('mv .* /dev/') ||
        cmd.includes('git reset --hard') ||
        cmd.includes('git clean -fd')
      ) {
        return true;
      }
      return false;
    }

    default:
      return false;
  }
}

export async function checkDangerousAction(
  toolName: string,
  args: Record<string, unknown>
): Promise<boolean> {
  if (safetyConfig.dangerousMode) {
    return true;
  }

  if (!isTrulyDangerous(toolName, args)) {
    return true;
  }

  console.log(chalk.red(`\n  ⚠️  检测到危险操作!\n`));
  console.log(chalk.yellow(`  工具: ${toolName}`));
  if (args.file_paths) {
    console.log(chalk.yellow(`  文件: ${(args.file_paths as string[]).join(', ')}`));
  }
  if (args.command) {
    console.log(chalk.yellow(`  命令: ${(args.command as string).slice(0, 100)}`));
  }

  console.log(chalk.cyan(`\n  输入 ${chalk.green('y')} 继续, ${chalk.green('a')} 全部允许, ${chalk.green('n')} 取消: `));

  return new Promise((resolve) => {
    const onData = (chunk: string) => {
      const code = chunk.charCodeAt(0);
      if (code === 3) {
        process.stdin.removeListener('data', onData);
        console.log(chalk.yellow('\n  已取消\n'));
        resolve(false);
        return;
      }
      if (code === 97) {
        process.stdin.removeListener('data', onData);
        enableDangerousMode();
        console.log(chalk.red('\n  ⚠️ 已启用全部允许模式\n'));
        resolve(true);
        return;
      }
      if (code === 121 || code === 89) {
        process.stdin.removeListener('data', onData);
        resolve(true);
        return;
      }
      if (code === 110 || code === 78) {
        process.stdin.removeListener('data', onData);
        resolve(false);
        return;
      }
    };
    process.stdin.on('data', onData);
  });
}