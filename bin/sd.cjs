#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const distEntry = path.join(__dirname, "..", "dist", "index.js");

if (fs.existsSync(distEntry)) {
  const result = spawnSync(process.execPath, [distEntry, ...process.argv.slice(2)], {
    stdio: "inherit",
    cwd: process.cwd(),
  });
  process.exit(result.status ?? 1);
} else {
  console.error("ShallowDream Code has not been built yet. Run: npm run build");
  console.error("Or run directly with: npx tsx src/index.ts");
  process.exit(1);
}