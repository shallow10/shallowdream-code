# ShallowDream Code

> An AI coding agent inspired by Claude Code, with planning capabilities and self-continuing execution.

## Features

- 🤖 **Planning Agent** - ReAct pattern with THINK → PLAN → ACT → VERIFY → ITERATE
- 🗄️ **Context Management** - Session persistence and conversation history
- 🚀 **Cache System** - Avoid redundant tool calls with smart caching
- 🔒 **Smart Safety** - Only confirm truly dangerous operations
- 📋 **Multi-line Input** - Support for paste and multi-line commands
- 🛠️ **Rich Toolset** - File operations, shell commands, search, web, MCP

## Quick Start

```bash
# Install dependencies
npm install

# Build
npm run build

# Run
./bin/sd.cmd
# or
node bin/sd.cjs
```

## Usage

```bash
# Interactive mode
sd

# Single task
sd "帮我创建一个 Python Flask 项目"

# Dangerous mode (skip all confirmations)
sd --dangerous "执行 git reset --hard"

# Specify model
sd -m "claude-sonnet-4-20250514" "分析代码"
```

## Commands

| Command | Description |
|---------|-------------|
| `/help` | Show help |
| `/exit` | Exit |
| `/tools` | List available tools |
| `/config` | Show current configuration |
| `/plan` | Plan a complex task |

## Configuration

Create `~/.sdrc.json`:

```json
{
  "provider": "anthropic",
  "model": "claude-sonnet-4-20250514",
  "apiKey": "your-api-key",
  "maxIterations": 50
}
```

Or set environment variables:

```bash
set ANTHROPIC_API_KEY=your-key
set OPENAI_API_KEY=your-key
```

## Features

### Planning Engine
The agent follows the ReAct pattern:

1. **THINK** - Analyze the task and requirements
2. **PLAN** - Create a step-by-step plan
3. **ACT** - Execute the plan using tools
4. **VERIFY** - Check if each step succeeded
5. **ITERATE** - Continue until task completion

### Tools Available
- **File Operations**: Read, Write, Edit, LS, Delete
- **Shell**: Execute bash commands
- **Search**: Grep, Glob, SearchCodebase
- **Web**: WebSearch, WebFetch
- **MCP**: Model Context Protocol support

### Safety System
- Only confirms **truly dangerous** operations
- Protects system directories (Windows, System32, Program Files)
- Protects project directories (node_modules, .git)
- Supports dangerous mode for trusted operations

## Project Structure

```
shallowdream-code/
├── bin/              # CLI entry points
│   ├── sd.cjs        # Main entry
│   ├── sd.cmd        # Windows batch script
│   └── sd.js         # Legacy entry
├── src/
│   ├── agent/        # Agent logic
│   │   ├── planner.ts    # Planning engine
│   │   ├── context.ts    # Context management
│   │   ├── state.ts      # State types
│   │   └── prompts.ts    # System prompts
│   ├── tools/        # Tool implementations
│   ├── llm/          # LLM providers
│   ├── ui/           # UI components
│   ├── config.ts     # Configuration
│   └── index.ts      # Main CLI
└── package.json
```

## License

MIT

## Acknowledgements

Inspired by Claude Code from Anthropic.