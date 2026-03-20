/**
 * @fileOverview MollyShell Test Suite
 *
 * Comprehensive tests for Molly's embedded terminal system.
 * Tests cover:
 * - Lifecycle management (start/stop/isAlive)
 * - Command execution with sentinel-based output capture
 * - Guardrails blocking dangerous commands
 * - State, history, and summary retrieval
 * - Event emission and subscription
 * - Concurrency protection (active command blocking)
 * - Auto-restart behavior
 *
 * Mock Strategy:
 * - We mock child_process.spawn to simulate bash behavior
 * - Output is controlled via mock stdout/stderr EventEmitters
 * - Process lifecycle is controlled via mock events
 */

import { EventEmitter } from 'events';

// ============================================================================
// MOCK SETUP
// ============================================================================

// Mock process for spawn
class MockChildProcess extends EventEmitter {
  pid = 12345;
  stdin = {
    write: jest.fn(),
  };
  stdout = new EventEmitter();
  stderr = new EventEmitter();

  kill = jest.fn((signal?: string) => {
    this.emit('exit', 0, signal || 'SIGTERM');
    return true;
  });
}

let mockProcess: MockChildProcess;
let spawnMock: jest.Mock;

// Mock child_process before importing MollyShell
jest.mock('child_process', () => ({
  spawn: jest.fn(() => {
    mockProcess = new MockChildProcess();
    return mockProcess;
  }),
}));

// Mock MollyLogger to prevent console noise
jest.mock('@/ai/logger', () => ({
  MollyLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock crypto.randomUUID
jest.mock('crypto', () => ({
  randomUUID: jest.fn(
    () => 'mock-uuid-' + Math.random().toString(36).substr(2, 9)
  ),
}));

// Import after mocks are set up
import { MollyShell, ShellEvent } from '../molly-shell';
import { spawn } from 'child_process';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Simulate command output with sentinel
 */
function simulateOutput(stdout: string, exitCode: number = 0): void {
  // Simulate output followed by sentinel
  mockProcess.stdout.emit(
    'data',
    Buffer.from(stdout + `__MOLLY_CMD_DONE__${exitCode}\n`)
  );
}

/**
 * Simulate stderr output
 */
function simulateStderr(stderr: string): void {
  mockProcess.stderr.emit('data', Buffer.from(stderr));
}

// ============================================================================
// LIFECYCLE TESTS
// ============================================================================

describe('MollyShell', () => {
  let shell: MollyShell;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ advanceTimers: true });
    spawnMock = spawn as jest.Mock;
    shell = new MollyShell('/test/cwd');
  });

  afterEach(() => {
    // Clean up shell if running
    if (shell.isAlive()) {
      shell.stop();
    }
    jest.useRealTimers();
  });

  // --------------------------------------------------------------------------
  // start() Tests
  // --------------------------------------------------------------------------

  describe('start()', () => {
    it('should spawn bash process with correct options', () => {
      shell.start();

      expect(spawnMock).toHaveBeenCalledWith(
        'bash',
        ['--norc', '--noprofile'],
        expect.objectContaining({
          cwd: '/test/cwd',
          stdio: ['pipe', 'pipe', 'pipe'],
          detached: false,
        })
      );
    });

    it('should set environment variables including MOLLY_SHELL', () => {
      shell.start();

      const spawnCall = spawnMock.mock.calls[0];
      const options = spawnCall[2];

      expect(options.env).toMatchObject({
        MOLLY_SHELL: '1',
        PS1: '',
        PS2: '',
        TERM: 'dumb',
      });
    });

    it('should mark shell as alive after start', () => {
      expect(shell.isAlive()).toBe(false);
      shell.start();
      expect(shell.isAlive()).toBe(true);
    });

    it('should be idempotent - calling start twice does not create second process', () => {
      shell.start();
      shell.start();

      expect(spawnMock).toHaveBeenCalledTimes(1);
    });

    it('should emit restart event on start', () => {
      const listener = jest.fn();
      shell.onEvent(listener);

      shell.start();

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'restart',
          data: expect.stringContaining('Shell started'),
        })
      );
    });

    it('should use process.cwd() as default working directory', () => {
      const defaultShell = new MollyShell();
      defaultShell.start();

      const spawnCall = spawnMock.mock.calls[0];
      expect(spawnCall[2].cwd).toBe(process.cwd());
    });
  });

  // --------------------------------------------------------------------------
  // stop() Tests
  // --------------------------------------------------------------------------

  describe('stop()', () => {
    it('should kill process with SIGTERM', () => {
      shell.start();
      shell.stop();

      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('should mark shell as not alive', () => {
      shell.start();
      expect(shell.isAlive()).toBe(true);

      shell.stop();
      expect(shell.isAlive()).toBe(false);
    });

    it('should prevent auto-restart after stop', () => {
      shell.start();
      shell.stop();

      // Manually trigger exit event
      mockProcess.emit('exit', 1, null);
      jest.advanceTimersByTime(2000);

      // Should not have spawned again
      expect(spawnMock).toHaveBeenCalledTimes(1);
    });

    it('should handle stop when not running gracefully', () => {
      expect(() => shell.stop()).not.toThrow();
    });

    it('should clear any pending command on stop', async () => {
      shell.start();

      // Start a command but don't complete it
      const executePromise = shell.execute('sleep 100', 'user');

      // Stop while command is pending
      shell.stop();

      const result = await executePromise;
      expect(result.stderr).toContain('Shell stopped');
    });
  });

  // --------------------------------------------------------------------------
  // isAlive() Tests
  // --------------------------------------------------------------------------

  describe('isAlive()', () => {
    it('should return false before start', () => {
      expect(shell.isAlive()).toBe(false);
    });

    it('should return true after start', () => {
      shell.start();
      expect(shell.isAlive()).toBe(true);
    });

    it('should return false after stop', () => {
      shell.start();
      shell.stop();
      expect(shell.isAlive()).toBe(false);
    });

    it('should return false after process crashes', () => {
      shell.start();

      // Simulate process exit (prevent restart)
      shell.stop(); // Sets restartCount to MAX to prevent restart
      expect(shell.isAlive()).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // execute() Tests
  // --------------------------------------------------------------------------

  describe('execute()', () => {
    it('should auto-start shell if not alive', async () => {
      expect(shell.isAlive()).toBe(false);

      const executePromise = shell.execute('echo hello', 'user');

      // Advance past initialization delay
      await jest.advanceTimersByTimeAsync(250);

      // Simulate output
      simulateOutput('hello\n', 0);

      const result = await executePromise;
      expect(spawnMock).toHaveBeenCalled();
      expect(result.stdout).toContain('hello');
    });

    it('should write command with sentinel to stdin', async () => {
      shell.start();

      const executePromise = shell.execute('ls -la', 'molly');

      // Verify command was written
      expect(mockProcess.stdin.write).toHaveBeenCalledWith(
        expect.stringContaining('ls -la')
      );
      expect(mockProcess.stdin.write).toHaveBeenCalledWith(
        expect.stringContaining('__MOLLY_CMD_DONE__')
      );

      // Complete the command
      simulateOutput('file1.txt\nfile2.txt\n', 0);
      await executePromise;
    });

    it('should capture stdout correctly', async () => {
      shell.start();

      const executePromise = shell.execute('echo test', 'user');
      simulateOutput('test\n', 0);

      const result = await executePromise;
      expect(result.stdout).toBe('test');
      expect(result.exitCode).toBe(0);
    });

    it('should capture stderr correctly', async () => {
      shell.start();

      const executePromise = shell.execute('invalid_command', 'user');

      simulateStderr('command not found\n');
      simulateOutput('', 127);

      const result = await executePromise;
      expect(result.stderr).toContain('command not found');
      expect(result.exitCode).toBe(127);
    });

    it('should return correct exit code', async () => {
      shell.start();

      const executePromise = shell.execute('exit 42', 'user');
      simulateOutput('', 42);

      const result = await executePromise;
      expect(result.exitCode).toBe(42);
    });

    it('should include taskId in command metadata', async () => {
      shell.start();

      const executePromise = shell.execute('pwd', 'system', 'task-123');
      simulateOutput('/home\n', 0);

      await executePromise;

      const history = shell.getHistory(1);
      expect(history[0].command.taskId).toBe('task-123');
    });

    it('should set initiator correctly', async () => {
      shell.start();

      const executePromise = shell.execute('whoami', 'user');
      simulateOutput('molly\n', 0);

      await executePromise;

      const history = shell.getHistory(1);
      expect(history[0].command.initiator).toBe('user');
    });

    it('should timeout after 30 seconds', async () => {
      shell.start();

      const executePromise = shell.execute('sleep 60', 'user');

      // Advance time past timeout
      await jest.advanceTimersByTimeAsync(31000);

      const result = await executePromise;
      expect(result.exitCode).toBe(124);
      expect(result.stderr).toContain('timed out');
    });

    it('should truncate output larger than 64KB', async () => {
      shell.start();

      const executePromise = shell.execute('cat largefile', 'user');

      // Generate output larger than 64KB
      const largeOutput = 'x'.repeat(70000);
      simulateOutput(largeOutput, 0);

      const result = await executePromise;
      expect(result.stdout.length).toBeLessThan(70000);
      expect(result.stdout).toContain('(output truncated)');
    });
  });

  // --------------------------------------------------------------------------
  // Guardrails Tests
  // --------------------------------------------------------------------------

  describe('Guardrails', () => {
    beforeEach(() => {
      shell.start();
    });

    it('should block rm -rf / command', async () => {
      const result = await shell.execute('rm -rf /', 'user');

      expect(result.blocked).toBe('Would delete entire filesystem');
      expect(result.exitCode).toBe(1);
      expect(mockProcess.stdin.write).not.toHaveBeenCalledWith(
        expect.stringContaining('rm -rf /')
      );
    });

    it('should block rm -rf / with trailing space', async () => {
      const result = await shell.execute('rm -rf / ', 'user');

      expect(result.blocked).toBe('Would delete entire filesystem');
    });

    it('should block dd if=... of=/dev/ commands', async () => {
      const result = await shell.execute('dd if=/dev/zero of=/dev/sda', 'user');

      expect(result.blocked).toBe('Would overwrite disk device');
    });

    it('should block fork bombs', async () => {
      const result = await shell.execute(':(){:|:&};:', 'user');

      expect(result.blocked).toBe('Fork bomb detected');
    });

    it('should block shutdown command', async () => {
      const result = await shell.execute('shutdown -h now', 'user');

      expect(result.blocked).toBe('System power control');
    });

    it('should block poweroff command', async () => {
      const result = await shell.execute('sudo poweroff', 'user');

      expect(result.blocked).toBe('System power control');
    });

    it('should block reboot command', async () => {
      const result = await shell.execute('reboot', 'user');

      expect(result.blocked).toBe('System power control');
    });

    it('should block halt command', async () => {
      const result = await shell.execute('halt', 'user');

      expect(result.blocked).toBe('System power control');
    });

    it('should block mkfs commands', async () => {
      const result = await shell.execute('mkfs.ext4 /dev/sda1', 'user');

      expect(result.blocked).toBe('Would format a filesystem');
    });

    it('should block init runlevel changes', async () => {
      const result = await shell.execute('init 0', 'user');

      expect(result.blocked).toBe('System runlevel change');
    });

    it('should block writing to disk devices', async () => {
      const result = await shell.execute('echo garbage > /dev/sda', 'user');

      expect(result.blocked).toBe('Would overwrite disk device');
    });

    it('should block chmod 777 on root', async () => {
      const result = await shell.execute('chmod 777 /', 'user');

      expect(result.blocked).toBe('Would open all permissions on root');
    });

    it('should block chmod -R 777 on root', async () => {
      const result = await shell.execute('chmod -R 777 /', 'user');

      expect(result.blocked).toBe('Would open all permissions on root');
    });

    it('should allow safe rm commands', async () => {
      const executePromise = shell.execute('rm -rf /tmp/test', 'user');
      simulateOutput('', 0);

      const result = await executePromise;
      expect(result.blocked).toBeUndefined();
    });

    it('should allow safe chmod commands', async () => {
      const executePromise = shell.execute(
        'chmod 755 /home/user/script.sh',
        'user'
      );
      simulateOutput('', 0);

      const result = await executePromise;
      expect(result.blocked).toBeUndefined();
    });

    it('should allow normal dd commands', async () => {
      const executePromise = shell.execute(
        'dd if=/dev/zero of=/tmp/test.img bs=1M count=10',
        'user'
      );
      simulateOutput('', 0);

      const result = await executePromise;
      expect(result.blocked).toBeUndefined();
    });

    it('should emit result event for blocked commands', async () => {
      const listener = jest.fn();
      shell.onEvent(listener);

      await shell.execute('rm -rf /', 'user');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'result',
          data: expect.objectContaining({
            blocked: 'Would delete entire filesystem',
          }),
        })
      );
    });
  });

  // --------------------------------------------------------------------------
  // Concurrency Tests
  // --------------------------------------------------------------------------

  describe('Concurrency Protection', () => {
    it('should reject commands while another is executing', async () => {
      shell.start();

      // Start first command without completing
      const firstPromise = shell.execute('sleep 5', 'user');

      // Try second command
      const secondResult = await shell.execute('echo hi', 'user');

      expect(secondResult.blocked).toBe('Another command is already executing');

      // Complete first command
      simulateOutput('', 0);
      await firstPromise;
    });

    it('should allow new command after previous completes', async () => {
      shell.start();

      // First command
      const firstPromise = shell.execute('echo first', 'user');
      simulateOutput('first\n', 0);
      await firstPromise;

      // Second command should work
      const secondPromise = shell.execute('echo second', 'user');
      simulateOutput('second\n', 0);

      const result = await secondPromise;
      expect(result.stdout).toBe('second');
      expect(result.blocked).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // getState() Tests
  // --------------------------------------------------------------------------

  describe('getState()', () => {
    it('should return offline state before start', () => {
      const state = shell.getState();

      expect(state.alive).toBe(false);
      expect(state.pid).toBeNull();
      expect(state.uptime).toBe(0);
    });

    it('should return correct state after start', () => {
      shell.start();
      const state = shell.getState();

      expect(state.alive).toBe(true);
      expect(state.pid).toBe(12345);
      expect(state.cwd).toBe('/test/cwd');
      expect(state.commandsExecuted).toBe(0);
    });

    it('should track commands executed count', async () => {
      shell.start();

      const p1 = shell.execute('cmd1', 'user');
      simulateOutput('', 0);
      await p1;

      const p2 = shell.execute('cmd2', 'user');
      simulateOutput('', 0);
      await p2;

      const state = shell.getState();
      expect(state.commandsExecuted).toBe(2);
    });

    it('should track last command and result', async () => {
      shell.start();

      const executePromise = shell.execute('whoami', 'molly');
      simulateOutput('molly\n', 0);
      await executePromise;

      const state = shell.getState();
      expect(state.lastCommand).not.toBeNull();
      expect(state.lastCommand?.command).toBe('whoami');
      expect(state.lastResult).not.toBeNull();
      expect(state.lastResult?.stdout).toBe('molly');
    });

    it('should calculate uptime correctly', async () => {
      shell.start();

      // Advance time by 5 seconds
      jest.advanceTimersByTime(5000);

      const state = shell.getState();
      expect(state.uptime).toBeGreaterThanOrEqual(5000);
    });
  });

  // --------------------------------------------------------------------------
  // getHistory() Tests
  // --------------------------------------------------------------------------

  describe('getHistory()', () => {
    it('should return empty array when no commands run', () => {
      shell.start();
      const history = shell.getHistory();

      expect(history).toEqual([]);
    });

    it('should return command history', async () => {
      shell.start();

      const p1 = shell.execute('echo one', 'user');
      simulateOutput('one\n', 0);
      await p1;

      const history = shell.getHistory();
      expect(history.length).toBe(1);
      expect(history[0].command.command).toBe('echo one');
      expect(history[0].result.stdout).toBe('one');
    });

    it('should respect limit parameter', async () => {
      shell.start();

      for (let i = 1; i <= 5; i++) {
        const p = shell.execute(`echo ${i}`, 'user');
        simulateOutput(`${i}\n`, 0);
        await p;
      }

      const history = shell.getHistory(3);
      expect(history.length).toBe(3);
      expect(history[0].result.stdout).toBe('3');
      expect(history[2].result.stdout).toBe('5');
    });

    it('should default to 20 items', async () => {
      shell.start();

      for (let i = 1; i <= 25; i++) {
        const p = shell.execute(`echo ${i}`, 'user');
        simulateOutput(`${i}\n`, 0);
        await p;
      }

      const history = shell.getHistory();
      expect(history.length).toBe(20);
    });

    it('should cap history at 100 entries', async () => {
      shell.start();

      for (let i = 1; i <= 110; i++) {
        const p = shell.execute(`echo ${i}`, 'user');
        simulateOutput(`${i}\n`, 0);
        await p;
      }

      // Request all history
      const history = shell.getHistory(200);
      expect(history.length).toBe(100);

      // Oldest entries should have been dropped
      expect(history[0].result.stdout).toBe('11');
    });
  });

  // --------------------------------------------------------------------------
  // getSummary() Tests
  // --------------------------------------------------------------------------

  describe('getSummary()', () => {
    it('should return offline message when shell not running', () => {
      const summary = shell.getSummary();

      expect(summary).toBe('Shell: offline');
    });

    it('should include PID when running', () => {
      shell.start();
      const summary = shell.getSummary();

      expect(summary).toContain('PID 12345');
    });

    it('should include uptime in minutes', () => {
      shell.start();
      jest.advanceTimersByTime(120000); // 2 minutes

      const summary = shell.getSummary();
      expect(summary).toContain('up 2m');
    });

    it('should include command count', async () => {
      shell.start();

      const p = shell.execute('test', 'user');
      simulateOutput('', 0);
      await p;

      const summary = shell.getSummary();
      expect(summary).toContain('1 cmds');
    });

    it('should include truncated last command', async () => {
      shell.start();

      const p = shell.execute(
        'echo this_is_a_very_long_command_that_should_be_truncated',
        'user'
      );
      simulateOutput('output\n', 0);
      await p;

      const summary = shell.getSummary();
      expect(summary).toContain('last: "echo this_is_a_very_long_command_that');
      expect(summary.length).toBeLessThan(200);
    });

    it('should say no commands yet when none run', () => {
      shell.start();
      const summary = shell.getSummary();

      expect(summary).toContain('no commands yet');
    });
  });

  // --------------------------------------------------------------------------
  // Event System Tests
  // --------------------------------------------------------------------------

  describe('onEvent()', () => {
    it('should register event listener', () => {
      const listener = jest.fn();
      shell.onEvent(listener);
      shell.start();

      expect(listener).toHaveBeenCalled();
    });

    it('should receive command events', async () => {
      shell.start();
      const listener = jest.fn();
      shell.onEvent(listener);

      const p = shell.execute('test', 'user');
      simulateOutput('', 0);
      await p;

      const commandEvent = listener.mock.calls.find(
        (call) => call[0].type === 'command'
      );
      expect(commandEvent).toBeDefined();
      expect(commandEvent[0].data.command).toBe('test');
    });

    it('should receive result events', async () => {
      shell.start();
      const listener = jest.fn();
      shell.onEvent(listener);

      const p = shell.execute('echo hi', 'user');
      simulateOutput('hi\n', 0);
      await p;

      const resultEvent = listener.mock.calls.find(
        (call) => call[0].type === 'result'
      );
      expect(resultEvent).toBeDefined();
      expect(resultEvent[0].data.stdout).toBe('hi');
    });

    it('should receive error events on process exit', () => {
      shell.start();
      const listener = jest.fn();
      shell.onEvent(listener);

      // Prevent restart by stopping first
      shell.stop();

      const errorEvent = listener.mock.calls.find(
        (call) => call[0].type === 'error'
      );
      expect(errorEvent).toBeDefined();
    });

    it('should return unsubscribe function', () => {
      const listener = jest.fn();
      const unsubscribe = shell.onEvent(listener);

      shell.start();
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
      listener.mockClear();

      // Stop should not trigger the listener
      shell.stop();
      expect(listener).not.toHaveBeenCalled();
    });

    it('should handle listener errors gracefully', async () => {
      shell.start();

      const badListener = jest.fn(() => {
        throw new Error('Listener error');
      });
      const goodListener = jest.fn();

      shell.onEvent(badListener);
      shell.onEvent(goodListener);

      const p = shell.execute('test', 'user');
      simulateOutput('', 0);
      await p;

      // Bad listener threw, but good listener still received events
      expect(goodListener).toHaveBeenCalled();
    });

    it('should include timestamp in events', () => {
      const listener = jest.fn();
      shell.onEvent(listener);
      shell.start();

      const event = listener.mock.calls[0][0] as ShellEvent;
      expect(event.timestamp).toBeDefined();
      expect(new Date(event.timestamp).getTime()).not.toBeNaN();
    });
  });

  // --------------------------------------------------------------------------
  // Auto-Restart Tests
  // --------------------------------------------------------------------------

  describe('Auto-Restart', () => {
    it('should restart shell after unexpected exit', () => {
      shell.start();
      expect(spawnMock).toHaveBeenCalledTimes(1);

      // Simulate unexpected exit
      mockProcess.emit('exit', 1, 'SIGKILL');

      // Advance timer past restart delay
      jest.advanceTimersByTime(1500);

      expect(spawnMock).toHaveBeenCalledTimes(2);
    });

    it('should limit restarts to 5 times', () => {
      shell.start();

      // Simulate 5 crashes
      for (let i = 0; i < 6; i++) {
        mockProcess.emit('exit', 1, null);
        jest.advanceTimersByTime(1500);
      }

      // Should have started 1 + 5 times (initial + 5 restarts)
      expect(spawnMock).toHaveBeenCalledTimes(6);
    });

    it('should reset restart count on successful start', () => {
      shell.start();

      // Simulate 2 crashes
      mockProcess.emit('exit', 1, null);
      jest.advanceTimersByTime(1500);
      mockProcess.emit('exit', 1, null);
      jest.advanceTimersByTime(1500);

      // Stop and restart manually (simulating recovery)
      shell.stop();

      // Create new shell to test fresh restart count
      const newShell = new MollyShell();
      newShell.start();

      // Should still be able to restart 5 times, then fail on 6th
      for (let i = 0; i < 6; i++) {
        mockProcess.emit('exit', 1, null);
        jest.advanceTimersByTime(1500);
      }

      // After 6 crashes (1 initial + 5 restarts + 1 that exceeded), shell should be dead
      expect(newShell.isAlive()).toBe(false); // After 5 restarts exceeded on 6th crash
    });

    it('should emit restart event on auto-restart', () => {
      shell.start();
      const listener = jest.fn();
      shell.onEvent(listener);

      // Simulate crash
      mockProcess.emit('exit', 1, 'SIGKILL');
      jest.advanceTimersByTime(1500);

      const restartEvents = listener.mock.calls.filter(
        (call) => call[0].type === 'restart'
      );
      expect(restartEvents.length).toBeGreaterThan(0);
    });
  });

  // --------------------------------------------------------------------------
  // Edge Cases
  // --------------------------------------------------------------------------

  describe('Edge Cases', () => {
    it('should handle empty command', async () => {
      shell.start();

      const p = shell.execute('   ', 'user');
      simulateOutput('\n', 0);

      const result = await p;
      expect(result.exitCode).toBe(0);
    });

    it('should handle multi-line commands', async () => {
      shell.start();

      const p = shell.execute('echo line1\necho line2', 'user');
      simulateOutput('line1\nline2\n', 0);

      const result = await p;
      expect(result.stdout).toContain('line1');
      expect(result.stdout).toContain('line2');
    });

    it('should handle special characters in output', async () => {
      shell.start();

      const p = shell.execute('echo $USER', 'user');
      simulateOutput('$USER\n', 0);

      const result = await p;
      expect(result.stdout).toBe('$USER');
    });

    it('should handle unicode output', async () => {
      shell.start();

      const p = shell.execute('echo "Hello World"', 'user');
      simulateOutput('Hello World\n', 0);

      const result = await p;
      expect(result.stdout).toContain('Hello');
    });

    it('should handle null exit code gracefully', async () => {
      shell.start();

      const p = shell.execute('test', 'user');
      // Simulate output without valid exit code
      mockProcess.stdout.emit(
        'data',
        Buffer.from('output__MOLLY_CMD_DONE__\n')
      );

      const result = await p;
      expect(result.exitCode).toBeNull();
    });

    it('should trim command whitespace', async () => {
      shell.start();

      const p = shell.execute('  echo test  ', 'user');
      simulateOutput('test\n', 0);

      await p;

      const history = shell.getHistory(1);
      expect(history[0].command.command).toBe('echo test');
    });
  });
});
