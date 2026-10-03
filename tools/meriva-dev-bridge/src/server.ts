import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';

const MAX_OUTPUT = 20_000;
const MAX_TIMEOUT_MS = 15 * 60 * 1000;

const projectDir = resolve(
  process.env.MERIVA_PROJECT_DIR ??
    process.env.MERIVA_APP_DIR ??
    join(homedir(), 'meriva-smart-diagnostic')
);

const bridgeDataDir = resolve(
  process.env.MERIVA_BRIDGE_DATA_DIR ??
    join(tmpdir(), 'meriva-dev-bridge')
);

mkdirSync(bridgeDataDir, { recursive: true });

type ExecResult = {
  command: string;
  cwd: string;
  exitCode: number | null;
  signal?: string;
  stdout: string;
  stderr: string;
  durationMs: number;
};

function trimOutput(value: string): string {
  if (value.length <= MAX_OUTPUT) return value;
  return value.slice(-MAX_OUTPUT) + '\n[output truncated; showing the last 20,000 characters]';
}

function textResult(text: string, isError = false) {
  return {
    content: [{ type: 'text' as const, text: trimOutput(text) }],
    ...(isError ? { isError: true } : {})
  };
}

function ensureProject(): void {
  if (!existsSync(projectDir)) {
    throw new Error(
      `MERIVA_PROJECT_DIR does not exist: ${projectDir}. Set it to the Meriva Smart Diagnostic project directory.`
    );
  }
}

function run(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs = 60_000
): Promise<ExecResult> {
  ensureProject();

  if (timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new Error(`timeoutMs must be between 1 and ${MAX_TIMEOUT_MS}.`);
  }

  const started = Date.now();

  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
      if (stdout.length > MAX_OUTPUT * 2) stdout = stdout.slice(-MAX_OUTPUT * 2);
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.length > MAX_OUTPUT * 2) stderr = stderr.slice(-MAX_OUTPUT * 2);
    });

    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!child.killed) child.kill('SIGKILL');
      }, 2_000).unref();
    }, timeoutMs);

    child.on('error', error => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on('close', (exitCode, signal) => {
      clearTimeout(timeout);
      resolvePromise({
        command: [command, ...args].join(' '),
        cwd,
        exitCode,
        signal: signal ?? undefined,
        stdout: trimOutput(stdout),
        stderr: trimOutput(stderr),
        durationMs: Date.now() - started
      });
    });
  });
}

async function runAndFormat(
  command: string,
  args: string[],
  cwd = projectDir,
  timeoutMs = 60_000
): Promise<ReturnType<typeof textResult>> {
  const result = await run(command, args, cwd, timeoutMs);
  const body = [
    `$ ${result.command}`,
    `cwd: ${result.cwd}`,
    `exit: ${result.exitCode ?? 'null'}`,
    `duration: ${result.durationMs} ms`,
    '',
    result.stdout ? `[stdout]\n${result.stdout}` : '[stdout] (empty)',
    '',
    result.stderr ? `[stderr]\n${result.stderr}` : '[stderr] (empty)'
  ].join('\n');

  return textResult(body, result.exitCode !== 0);
}

function gradleCommand(): { command: string; cwd: string } {
  const androidDir = join(projectDir, 'android');
  const wrapper = join(androidDir, 'gradlew');

  if (existsSync(wrapper)) {
    return { command: './gradlew', cwd: androidDir };
  }

  return { command: 'gradle', cwd: androidDir };
}

async function runGradle(
  args: string[],
  timeoutMs = 15 * 60 * 1000
) {
  const { command, cwd } = gradleCommand();
  return runAndFormat(command, args, cwd, timeoutMs);
}

function buildServer(): McpServer {
  const server = new McpServer({
    name: 'meriva-dev-bridge',
    version: '0.1.0'
  });

  server.registerTool(
    'get_environment',
    {
      title: 'Get Termux development environment',
      description:
        'Read-only diagnostic of the local Termux/Android development environment used by Meriva Smart Diagnostic.',
      inputSchema: z.object({})
    },
    async () => {
      ensureProject();

      const commands = [
        ['node', ['--version'], projectDir],
        ['npm', ['--version'], projectDir],
        ['git', ['--version'], projectDir],
        ['java', ['-version'], projectDir],
        ['adb', ['version'], projectDir]
      ] as const;

      const results = await Promise.all(
        commands.map(([command, args, cwd]) => run(command, [...args], cwd, 20_000).catch(error => ({
          command: [command, ...args].join(' '),
          cwd,
          exitCode: null,
          stdout: '',
          stderr: error instanceof Error ? error.message : String(error),
          durationMs: 0
        })))
      );

      const androidSdk =
        process.env.ANDROID_HOME ??
        process.env.ANDROID_SDK_ROOT ??
        '(ANDROID_HOME/ANDROID_SDK_ROOT not set)';

      const output = [
        'MERIVA DEV BRIDGE ENVIRONMENT',
        `projectDir: ${projectDir}`,
        `androidSdk: ${androidSdk}`,
        `platform: ${process.platform}`,
        `arch: ${process.arch}`,
        '',
        ...results.map(r =>
          [
            `$ ${r.command}`,
            `exit: ${r.exitCode ?? 'unavailable'}`,
            r.stdout ? r.stdout.trim() : '',
            r.stderr ? r.stderr.trim() : ''
          ].filter(Boolean).join('\n')
        )
      ].join('\n\n');

      return textResult(output);
    }
  );

  server.registerTool(
    'git_status',
    {
      title: 'Git status',
      description: 'Read-only Git status of the configured Meriva project.',
      inputSchema: z.object({})
    },
    async () => runAndFormat('git', ['status', '--short', '--branch'])
  );

  server.registerTool(
    'git_log',
    {
      title: 'Git log',
      description: 'Read the latest 15 commits from the configured Meriva project.',
      inputSchema: z.object({})
    },
    async () => runAndFormat('git', ['log', '-15', '--oneline', '--decorate'])
  );

  server.registerTool(
    'git_diff',
    {
      title: 'Git diff summary',
      description: 'Read-only summary of the current working tree changes.',
      inputSchema: z.object({})
    },
    async () =>
      runAndFormat('git', ['diff', '--stat', '--', '.'], projectDir, 30_000)
  );

  server.registerTool(
    'run_command',
    {
      title: 'Run approved development operation',
      description:
        'Run one predefined development operation. No arbitrary shell command, shell syntax, or command arguments are accepted.',
      inputSchema: z.object({
        operation: z.enum([
          'node_version',
          'npm_version',
          'git_status',
          'git_log',
          'git_diff',
          'typecheck',
          'test',
          'doctor',
          'gradle_check',
          'gradle_test'
        ])
      })
    },
    async ({ operation }) => {
      switch (operation) {
        case 'node_version':
          return runAndFormat('node', ['--version']);
        case 'npm_version':
          return runAndFormat('npm', ['--version']);
        case 'git_status':
          return runAndFormat('git', ['status', '--short', '--branch']);
        case 'git_log':
          return runAndFormat('git', ['log', '-15', '--oneline', '--decorate']);
        case 'git_diff':
          return runAndFormat('git', ['diff', '--stat', '--', '.']);
        case 'typecheck':
          return runAndFormat('npm', ['run', 'typecheck'], projectDir, 5 * 60 * 1000);
        case 'test':
          return runAndFormat('npm', ['test'], projectDir, 10 * 60 * 1000);
        case 'doctor':
          return runAndFormat('npm', ['run', 'doctor'], projectDir, 10 * 60 * 1000);
        case 'gradle_check':
          return runGradle(['--no-daemon', 'check'], 15 * 60 * 1000);
        case 'gradle_test':
          return runGradle(['--no-daemon', 'test'], 15 * 60 * 1000);
      }
    }
  );

  server.registerTool(
    'build_debug_apk',
    {
      title: 'Build debug APK',
      description:
        'Run the Android Gradle debug build for the configured Expo/React Native project and report the APK path.',
      inputSchema: z.object({
        clean: z.boolean().default(false).describe('Run clean before assembleDebug.')
      })
    },
    async ({ clean }) => {
      const args = ['--no-daemon'];
      if (clean) args.push('clean');
      args.push('assembleDebug');

      const result = await runGradle(args, 15 * 60 * 1000);

      if (!result.content?.[0] || result.isError) return result;

      const apkCandidates = [
        join(projectDir, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk'),
        join(projectDir, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug-unsigned.apk')
      ];

      const found = apkCandidates.find(existsSync);
      const extra = found
        ? `\nAPK: ${found}`
        : '\nAPK: not found at the standard debug output path.';

      const text = result.content[0].type === 'text' ? result.content[0].text : '';
      return textResult(text + extra);
    }
  );

  server.registerTool(
    'get_build_log',
    {
      title: 'Get last build log',
      description: 'Read the latest build log saved by the Bridge.',
      inputSchema: z.object({})
    },
    async () => {
      const logPath = join(bridgeDataDir, 'last-build.log');

      if (!existsSync(logPath)) {
        return textResult(`No build log found at ${logPath}`);
      }

      return textResult(readFileSync(logPath, 'utf8'));
    }
  );

  server.server.setRequestHandler('tools/call', async (request, ctx) => {
    return await server.server._defaultRequestHandler(request, ctx);
  });

  return server;
}

async function main() {
  console.error('Meriva Dev Bridge MCP running on stdio');
  console.error(`Project: ${projectDir}`);
  await serveStdio(buildServer);
}

main().catch(error => {
  console.error('Meriva Dev Bridge fatal error:', error);
  process.exitCode = 1;
});
