// src/utils/shell/command-classifier.ts
// Classifies shell commands for audit logging purposes.
// Used by sessionHooks.ts to annotate hook executions — observability only,
// never used to block execution.

export type CommandClassification =
  | 'safe'
  | 'network'
  | 'filesystem'
  | 'process'
  | 'privileged'
  | 'unknown';

const PRIVILEGED = /\b(sudo|su|chmod|chown|chroot|pkexec|doas)\b/;
const NETWORK =
  /\b(curl|wget|nc|netcat|ssh|scp|rsync|nmap|ping|dig|nslookup|telnet|ftp)\b/;
const FILESYSTEM =
  /\b(rm|mv|cp|mkdir|rmdir|find|ls|cat|touch|ln|mount|umount|dd)\b/;
const PROCESS =
  /\b(kill|killall|pkill|ps|top|htop|nohup|bg|fg|jobs|exec|eval)\b/;

/**
 * Returns a broad classification of what a shell command does.
 * Used for audit trail logging — does not gate execution.
 */
export function classifyCommand(command: string): CommandClassification {
  if (!command || typeof command !== 'string') return 'unknown';
  const cmd = command.trim();
  if (PRIVILEGED.test(cmd)) return 'privileged';
  if (NETWORK.test(cmd)) return 'network';
  if (FILESYSTEM.test(cmd)) return 'filesystem';
  if (PROCESS.test(cmd)) return 'process';
  // Simple single-word or flag-only commands are generally safe
  if (/^[a-zA-Z0-9_\-\.\/]+(\s+--?[\w\-]+(=\S+)?)*$/.test(cmd)) return 'safe';
  return 'unknown';
}
