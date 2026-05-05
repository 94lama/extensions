import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';

type ProcessEnvironment = {
	env?: Record<string, string | undefined>;
};

type MiniPiSettings = {
	agentCommand: string;
};

type TerminalLauncher = {
	executable: string;
	args: string[];
};

function normalizeInput(text: string): string {
	const trimmedText = text.trim();

	if (trimmedText.startsWith('pi ')) {
		return trimmedText.slice(3).trimStart();
	}

	return trimmedText;
}

function extractMiniPiPrompt(text: string): string | null {
	const normalizedText = normalizeInput(text);

	if (!normalizedText.startsWith(':diy')) {
		return null;
	}

	return normalizedText.slice(4).trim();
}

async function getSettings(): Promise<MiniPiSettings> {
	const runtime = globalThis as typeof globalThis & { process?: ProcessEnvironment };
	const agentCommand =
		runtime.process?.env?.MiniPi_COMMAND?.trim() ||
		runtime.process?.env?.PI_MiniPi_COMMAND?.trim() ||
		'pi';

	return { agentCommand };
}

function shellQuote(value: string): string {
	if (value.length === 0) {
		return "''";
	}

	return `'${value.replace(/'/g, "'\\''")}'`;
}

function buildAgentCommand(agentCommand: string, prompt: string): string {
	const quotedPrompt = shellQuote(prompt);

	if (agentCommand.includes('{prompt}')) {
		return agentCommand.replace(/\{prompt\}/g, quotedPrompt);
	}

	return `${agentCommand} ${quotedPrompt}`;
}

async function spawnDetached(executable: string, args: string[]): Promise<void> {
	const { spawn } = await import('node:child_process');

	await new Promise<void>((resolve, reject) => {
		const child = spawn(executable, args, {
			detached: true,
			stdio: 'ignore',
		});

		child.once('spawn', () => {
			child.unref();
			resolve();
		});

		child.once('error', reject);
	});
}

async function openAgentInTerminal(prompt: string): Promise<void> {
	const settings = await getSettings();
	const command = buildAgentCommand(settings.agentCommand, prompt);
	const terminalLaunchers: TerminalLauncher[] = [
		{
			executable: 'gnome-terminal',
			args: ['--', 'bash', '-lc', command],
		},
		{
			executable: 'x-terminal-emulator',
			args: ['-e', 'bash', '-lc', command],
		},
		{
			executable: 'xterm',
			args: ['-hold', '-e', 'bash', '-lc', command],
		},
	];

	let lastError: unknown;

	for (const launcher of terminalLaunchers) {
		try {
			await spawnDetached(launcher.executable, launcher.args);
			return;
		} catch (error) {
			lastError = error;
		}
	}

	throw new Error(
		lastError instanceof Error && lastError.message
			? lastError.message
			: 'No supported terminal emulator found.',
	);
}

export default function (pi: ExtensionAPI) {
	pi.on('input', async (event) => {
		const prompt = extractMiniPiPrompt(String(event.text ?? ''));

		if (prompt === null) {
			return { action: 'continue' };
		}

		if (!prompt) {
			return {
				action: 'handled',
				response: 'Usage: :MiniPi <prompt>',
			};
		}

		try {
			await openAgentInTerminal(prompt);
			return { action: 'handled' };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to launch a new agent terminal.';
			return { action: 'handled', response: message };
		}
	});
}
