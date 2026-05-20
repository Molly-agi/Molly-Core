/**
 * Sandbox and Moltbook tools
 * Works in both server (Codespace) and edge (tablet) environments
 */

import {
  sandboxExecuteCode,
  sandboxWriteFile,
  sandboxReadFile,
  sandboxListFiles,
  sandboxDeleteFile,
  getSandboxInfo,
  sandboxScaffoldProject,
} from '@/ai/sandbox/sandbox-engine';
import type { ToolHandler } from './index';

export const sandbox: ToolHandler = async (params) => {
  const action = params.action as string;

  if (action === 'execute') {
    const code = params.code as string;
    const language = params.language as string;
    if (!code || !language) {
      return {
        success: false,
        output: 'Missing required fields: code, language',
      };
    }
    try {
      const result = await sandboxExecuteCode(code, language);
      return {
        success: result.success,
        output: result.stdout || result.stderr || '(no output)',
        data: {
          exitCode: result.exitCode,
          executionTimeMs: result.executionTimeMs,
        },
      };
    } catch (err) {
      return {
        success: false,
        output: `Sandbox execution error: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'writeFile') {
    const filePath = params.path as string;
    const content = params.content as string;
    if (!filePath || content === undefined) {
      return {
        success: false,
        output: 'Missing required fields: path, content',
      };
    }
    try {
      const result = await sandboxWriteFile(filePath, content);
      if (!result.success) {
        return { success: false, output: result.error || 'Write failed' };
      }
      return {
        success: true,
        output: `File written: ${result.path} (${content.length} bytes)`,
      };
    } catch (err) {
      return {
        success: false,
        output: `Sandbox write error: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'readFile') {
    const filePath = params.path as string;
    if (!filePath) {
      return { success: false, output: 'Missing required field: path' };
    }
    try {
      const result = await sandboxReadFile(filePath);
      if (!result.success) {
        return { success: false, output: result.error || 'Read failed' };
      }
      return { success: true, output: result.content || '' };
    } catch (err) {
      return {
        success: false,
        output: `Sandbox read error: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'list') {
    try {
      const files = await sandboxListFiles();
      if (files.length === 0) {
        return {
          success: true,
          output: 'Sandbox workspace is empty. Write some code!',
        };
      }
      const formatted = files
        .map(
          (f) => `${f.isDirectory ? '📁' : '📄'} ${f.name} (${f.size} bytes)`
        )
        .join('\n');
      return { success: true, output: `Sandbox files:\n${formatted}` };
    } catch (err) {
      return {
        success: false,
        output: `Sandbox list error: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'delete') {
    const filePath = params.path as string;
    if (!filePath) {
      return { success: false, output: 'Missing required field: path' };
    }
    try {
      await sandboxDeleteFile(filePath);
      return { success: true, output: `File deleted: ${filePath}` };
    } catch (err) {
      return {
        success: false,
        output: `Sandbox delete error: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'info') {
    try {
      const info = await getSandboxInfo();
      return {
        success: true,
        output: `Sandbox Info:\n  Root: ${info.workspacePath}\n  Files: ${info.fileCount}/${info.maxFiles}\n  Languages: ${info.supportedLanguages.join(', ')}\n  Timeout: ${info.maxTimeoutMs / 1000}s\n  Memory: ${info.maxMemoryMb}MB`,
        data: info,
      };
    } catch (err) {
      return {
        success: false,
        output: `Sandbox info error: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'scaffold') {
    const projectName = params.projectName as string;
    const files = params.files as { path: string; content: string }[];
    if (!projectName || !files || !Array.isArray(files)) {
      return {
        success: false,
        output:
          'Missing required fields: projectName, files (array of {path, content})',
      };
    }
    try {
      const result = await sandboxScaffoldProject(projectName, files);
      if (result.success) {
        return {
          success: true,
          output: `Project "${projectName}" created with ${result.filesCreated.length} file(s):\n${result.filesCreated.map((f) => `  ✓ ${f}`).join('\n')}`,
          data: result,
        };
      } else {
        return {
          success: false,
          output: `Scaffold errors:\n${result.errors.join('\n')}${result.filesCreated.length > 0 ? `\nPartially created: ${result.filesCreated.join(', ')}` : ''}`,
        };
      }
    } catch (err) {
      return {
        success: false,
        output: `Scaffold error: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  return {
    success: false,
    output:
      'Unknown sandbox action. Use: execute, writeFile, readFile, list, delete, info, scaffold',
  };
};

export const sandboxToolHandlers: Record<string, ToolHandler> = {
  sandbox,
};
