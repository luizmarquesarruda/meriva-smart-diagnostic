# Meriva Dev Bridge

Local MCP server for the Meriva Smart Diagnostic project.

## First milestone

This version uses **stdio**. A local MCP host starts the Bridge as a child process. The Bridge then uses normal Node.js processes to inspect and build the Android project.

This keeps the first stage local. Nothing is exposed to the internet.

## Requirements

- Termux
- Node.js 20+
- Git
- The Meriva Smart Diagnostic repository
- Java and Android SDK for Android builds

The official MCP TypeScript SDK v2 uses `@modelcontextprotocol/server`. The current v2 line implements the 2026-07-28 MCP specification.

## Install

From the repository root:

```bash
cd ~/meriva-smart-diagnostic/tools/meriva-dev-bridge
npm install
npm run build
```

Set the application directory:

```bash
export MERIVA_PROJECT_DIR="$HOME/meriva-smart-diagnostic"
```

Run the local MCP Inspector:

```bash
npx @modelcontextprotocol/inspector node dist/server.js
```

The Inspector can list and call the Bridge tools.

## Safety model

The Bridge does not expose an unrestricted shell.

The `run_command` tool accepts only predefined development operations:

- Node/npm version checks
- Git status, log and diff
- TypeScript check
- tests
- Expo doctor
- Gradle check and test

The APK build has its own tool.

No arbitrary shell command string is accepted.

## Tools

- `get_environment`
- `git_status`
- `git_log`
- `git_diff`
- `run_command`
- `build_debug_apk`
- `get_build_log`

## Build

After the local MCP test succeeds, the next step is the same server behind **Streamable HTTP**, bound to loopback first.

For a remote connection, use an authenticated gateway. Do not expose the Termux process directly to the public internet.

Keep GitHub credentials outside the Bridge.

## Stdout rule

With stdio, stdout is the MCP JSON-RPC channel. Server diagnostics therefore use stderr.

