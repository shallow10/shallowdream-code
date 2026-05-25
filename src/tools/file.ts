import { readFile, writeFile, stat, access, constants } from 'fs/promises';
import { Tool, ToolResult } from './index.js';
import { resolve, relative, dirname } from 'path';

export class ReadFileTool implements Tool {
  definition = {
    name: 'Read',
    description: 'Reads a file from the local filesystem. Returns the file contents with line numbers.',
    parameters: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'The absolute path to the file to read.',
        },
        limit: {
          type: 'number',
          description: 'The number of lines to read.',
        },
        offset: {
          type: 'number',
          description: 'The line number to start reading from.',
        },
      },
      required: ['file_path'],
    },
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const filePath = args.file_path as string;
    const limit = (args.limit as number) || 500;
    const offset = (args.offset as number) || 0;

    try {
      const content = await readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      const start = Math.max(0, offset);
      const end = Math.min(lines.length, start + limit);
      const selectedLines = lines.slice(start, end);

      const numbered = selectedLines
        .map((line, i) => `${String(start + i + 1).padStart(6, ' ')}| ${line}`)
        .join('\n');

      return {
        toolCallId: '',
        content: `File: ${filePath} (lines ${start + 1}-${end} of ${lines.length})\n\n${numbered}`,
      };
    } catch (error) {
      return {
        toolCallId: '',
        content: `Error reading file: ${error instanceof Error ? error.message : String(error)}`,
        isError: true,
      };
    }
  }
}

export class WriteFileTool implements Tool {
  definition = {
    name: 'Write',
    description: 'Writes a file to the local filesystem. Overwrites existing files.',
    parameters: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'The absolute path to the file to write.',
        },
        content: {
          type: 'string',
          description: 'The content to write to the file.',
        },
      },
      required: ['file_path', 'content'],
    },
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const filePath = args.file_path as string;
    const content = args.content as string;

    try {
      await writeFile(filePath, content, 'utf-8');
      return {
        toolCallId: '',
        content: `Successfully wrote to ${filePath}`,
      };
    } catch (error) {
      return {
        toolCallId: '',
        content: `Error writing file: ${error instanceof Error ? error.message : String(error)}`,
        isError: true,
      };
    }
  }
}

export class EditFileTool implements Tool {
  definition = {
    name: 'Edit',
    description: 'Performs exact string replacements in an existing file. Searches for old_str and replaces with new_str.',
    parameters: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'The absolute path to the file to edit.',
        },
        old_str: {
          type: 'string',
          description: 'The text to search for and replace.',
        },
        new_str: {
          type: 'string',
          description: 'The text to replace with.',
        },
      },
      required: ['file_path', 'old_str', 'new_str'],
    },
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const filePath = args.file_path as string;
    const oldStr = args.old_str as string;
    const newStr = args.new_str as string;

    try {
      const content = await readFile(filePath, 'utf-8');
      if (!content.includes(oldStr)) {
        return {
          toolCallId: '',
          content: `Error: old_str not found in file. The file content may have changed.`,
          isError: true,
        };
      }
      const newContent = content.replace(oldStr, newStr);
      await writeFile(filePath, newContent, 'utf-8');
      return {
        toolCallId: '',
        content: `Successfully edited ${filePath}`,
      };
    } catch (error) {
      return {
        toolCallId: '',
        content: `Error editing file: ${error instanceof Error ? error.message : String(error)}`,
        isError: true,
      };
    }
  }
}

export class LSFileTool implements Tool {
  definition = {
    name: 'LS',
    description: 'Lists files and directories in a given path.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The absolute path to the directory to list.',
        },
      },
      required: ['path'],
    },
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const dirPath = args.path as string;

    try {
      const { readdir } = await import('fs/promises');
      const entries = await readdir(dirPath, { withFileTypes: true });
      const listing = entries
        .map((e) => `${e.isDirectory() ? 'd' : '-'}  ${e.name}`)
        .join('\n');

      return {
        toolCallId: '',
        content: `Directory listing of ${dirPath}:\n\n${listing}`,
      };
    } catch (error) {
      return {
        toolCallId: '',
        content: `Error listing directory: ${error instanceof Error ? error.message : String(error)}`,
        isError: true,
      };
    }
  }
}

export class DeleteFileTool implements Tool {
  definition = {
    name: 'Delete',
    description: 'Deletes files from the local filesystem.',
    parameters: {
      type: 'object',
      properties: {
        file_paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'The list of file paths to delete.',
        },
      },
      required: ['file_paths'],
    },
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const filePaths = args.file_paths as string[];

    try {
      const { unlink } = await import('fs/promises');
      const results: string[] = [];
      for (const fp of filePaths) {
        try {
          await unlink(fp);
          results.push(`Deleted: ${fp}`);
        } catch (e) {
          results.push(`Failed to delete ${fp}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      return {
        toolCallId: '',
        content: results.join('\n'),
      };
    } catch (error) {
      return {
        toolCallId: '',
        content: `Error deleting files: ${error instanceof Error ? error.message : String(error)}`,
        isError: true,
      };
    }
  }
}