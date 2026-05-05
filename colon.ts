import type { ExtensionAPI } from '@pi/extension-api';

type ParsedInput = {
  command: string;
  filePath: string;
  options: string[];
};

function resolveRequestedFilePath(input: string): string {
  const trimmedInput = input.trim();
  return trimmedInput.startsWith('@') ? trimmedInput.slice(1) : trimmedInput;
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

export default function (pi: ExtensionAPI) {
  pi.on('input', async (event, ctx) => {
    const input = parseInput(event.text || '');
    if (input?.command && input.command.startsWith(":")) {
      const [command, ...args] = input.command.slice(1).split(/\s+/);
      let modulePath: string | null = null;

      if (['diy', 'minipi'].includes(command)) {
        return import('./miniPi.ts').then(module => module.default(pi));
      } else if (['read', 'edit'].includes(command)) {
        return import('./editor/editor.ts').then(module => module.default(pi));
      } else return { action: 'error', response: `Unknown command: ${command}` };

    } else return { action: 'continue' };
  });
}