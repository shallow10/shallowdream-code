import { Tool, ToolResult } from './index.js';
import { readFile } from 'fs/promises';
import { glob } from 'fast-glob';
import { resolve, relative } from 'path';

export class GrepTool implements Tool {
  definition = {
    name: 'Grep',
    description: 'Searches for a regex pattern in files. Returns matching lines with context.',
    parameters: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'The regular expression pattern to search for.',
        },
        path: {
          type: 'string',
          description: 'The file or directory to search in.',
        },
        glob: {
          type: 'string',
          description: 'Glob pattern to filter files.',
        },
        ignoreCase: {
          type: 'boolean',
          description: 'Case insensitive search.',
        },
      },
      required: ['pattern'],
    },
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const pattern = args.pattern as string;
    const searchPath = (args.path as string) || process.cwd();
    const fileGlob = (args.glob as string) || '**/*';
    const ignoreCase = (args.ignoreCase as boolean) || false;

    try {
      const files = await glob(fileGlob, {
        cwd: searchPath,
        ignore: ['node_modules/**', '.git/**', 'dist/**', '*.exe', '*.dll'],
        absolute: true,
        onlyFiles: true,
      });

      const results: string[] = [];
      const flags = ignoreCase ? 'gi' : 'g';
      const regex = new RegExp(pattern, flags);

      for (const file of files.slice(0, 100)) {
        try {
          const content = await readFile(file, 'utf-8');
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (regex.test(lines[i])) {
              const relPath = relative(searchPath, file);
              results.push(`${relPath}:${i + 1}: ${lines[i].trim()}`);
            }
          }
        } catch {
          continue;
        }
      }

      return {
        toolCallId: '',
        content: results.length > 0
          ? `Found ${results.length} matches:\n\n${results.slice(0, 50).join('\n')}${results.length > 50 ? '\n... (truncated)' : ''}`
          : `No matches found for pattern: ${pattern}`,
      };
    } catch (error) {
      return {
        toolCallId: '',
        content: `Search error: ${error instanceof Error ? error.message : String(error)}`,
        isError: true,
      };
    }
  }
}

export class GlobTool implements Tool {
  definition = {
    name: 'Glob',
    description: 'Finds files matching a glob pattern.',
    parameters: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'The glob pattern to match files against.',
        },
        path: {
          type: 'string',
          description: 'The directory to search in.',
        },
      },
      required: ['pattern'],
    },
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const pattern = args.pattern as string;
    const searchPath = (args.path as string) || process.cwd();

    try {
      const files = await glob(pattern, {
        cwd: searchPath,
        ignore: ['node_modules/**', '.git/**'],
        absolute: true,
        onlyFiles: true,
      });

      const relFiles = files.map((f) => relative(searchPath, f));

      return {
        toolCallId: '',
        content: `Found ${files.length} files:\n\n${relFiles.slice(0, 100).join('\n')}${files.length > 100 ? '\n... (truncated)' : ''}`,
      };
    } catch (error) {
      return {
        toolCallId: '',
        content: `Glob error: ${error instanceof Error ? error.message : String(error)}`,
        isError: true,
      };
    }
  }
}

export class SearchCodebaseTool implements Tool {
  definition = {
    name: 'SearchCodebase',
    description: 'Searches the codebase using natural language. Finds relevant code snippets.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language description of what to search for.',
        },
      },
      required: ['query'],
    },
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const query = args.query as string;

    return {
      toolCallId: '',
      content: `Semantic search for: "${query}"\n\nThis feature requires embedding-based search. For now, use Grep for pattern-based search.`,
    };
  }
}