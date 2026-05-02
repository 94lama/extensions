import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';

type PiSettings = {
  readerTool?: string;
  editorTool?: string;
};

type ParsedInput = {
  command: string;
  filePath: string;
  options: string[];
};

type ProcessEnvironment = {
  env?: Record<string, string | undefined>;
};

function resolveRequestedFilePath(input: string): string {
  const trimmedInput = input.trim();
  return trimmedInput.startsWith('@') ? trimmedInput.slice(1) : trimmedInput;
}

async function getSettings(): Promise<PiSettings> {
  const runtime = globalThis as typeof globalThis & { process?: ProcessEnvironment };
  const reader = runtime.process?.env?.READER;
  const editor = runtime.process?.env?.EDITOR;

  return {
    readerTool: reader || undefined,
    editorTool: editor || undefined,
  };
}

function parseInput(userText: string): ParsedInput | null {
  const tokens = userText.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return null;
  }

  const offset = tokens[0] === 'pi' ? 1 : 0;
  const command = tokens[offset];
  const requestedFile = tokens[offset + 1];

  if (!command || !requestedFile) {
    return null;
  }

  return {
    command,
    filePath: resolveRequestedFilePath(requestedFile),
    options: tokens.slice(offset + 2),
  };
}

async function openAndRead(filePath: string, options: string[] = []): Promise<void> {
  const childProcessModule = 'node:child_process';
  const { spawn } = await import(childProcessModule);
  const scriptPath = decodeURIComponent(new URL('./read.sh', import.meta.url).pathname);
  const settings = await getSettings();
  const readerTool = settings.readerTool?.trim() || 'batcat';
  const useRemoteSession = options.includes('remote') || options.includes('--remote');

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      'bash',
      [scriptPath, filePath, readerTool, ...options],
      useRemoteSession
        ? { stdio: 'inherit' }
        : { stdio: ['ignore', 'ignore', 'pipe'] },
    );
    let stderr = '';

    if (child.stderr) {
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk: string) => {
        stderr += chunk;
      });
    }

    child.once('error', reject);
    child.once('close', (code: number | null) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr.trim() || `Failed to open the file with ${readerTool}.`));
    });
  });
}

async function openAndEdit(filePath: string, options: string[] = []): Promise<void> {
  const childProcessModule = 'node:child_process';
  const { spawn } = await import(childProcessModule);
  const scriptPath = decodeURIComponent(new URL('./edit.sh', import.meta.url).pathname);
  const settings = await getSettings();
  const editorTool = settings.editorTool?.trim() || 'nvim';
  const useRemoteSession = options.includes('remote') || options.includes('--remote');

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      'bash',
      [scriptPath, filePath, editorTool, ...options],
      useRemoteSession
        ? { stdio: 'inherit' }
        : { stdio: ['ignore', 'ignore', 'pipe'] },
    );
    let stderr = '';

    if (child.stderr) {
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk: string) => {
        stderr += chunk;
      });
    }

    child.once('error', reject);
    child.once('close', (code: number | null) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr.trim() || `Failed to open the file with ${editorTool}.`));
    });
  });
}

export default function (pi: ExtensionAPI) {
  pi.on('input', async (event, ctx) => {
    const parsedInput = parseInput(event.text);

    if (!parsedInput?.command.startsWith(':')) {
      return { action: 'continue' };
    }

    try {
      switch (parsedInput.command) {
        case ':read':
          await openAndRead(parsedInput.filePath, parsedInput.options);
          return { action: 'handled' };
        case ':edit':
          await openAndEdit(parsedInput.filePath, parsedInput.options);
          return { action: 'handled' };
        default:
          return { action: 'continue' };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to open the requested file.';
      return { action: 'handled', response: message };
    }
  });
}