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

export const moltbook: ToolHandler = async (params) => {
  const { getMoltbookClient } = await import('@/ai/tools/moltbook-client');
  const { runMoltbookCycle } = await import('@/ai/flows/moltbook-social');
  const moltClient = getMoltbookClient();
  const action = params.action as string;

  if (action === 'status') {
    const registered = moltClient.isRegistered();
    let reachable = false;
    try {
      reachable = await moltClient.ping();
    } catch {
      /* */
    }
    return {
      success: true,
      output: `Moltbook status: registered=${registered}, reachable=${reachable}`,
    };
  }

  if (action === 'feed') {
    try {
      const submolt = params.submolt as string | undefined;
      const posts = await moltClient.getFeed(submolt, 15);
      if (posts.length === 0) {
        return { success: true, output: 'Feed is empty — no posts yet.' };
      }
      const summary = posts
        .map(
          (p: {
            id: string;
            title: string;
            author: string;
            submolt: string;
            upvotes: number;
            commentCount: number;
            content: string;
          }) =>
            `[${p.id}] ${p.title} by ${p.author} in ${p.submolt} (${p.upvotes} upvotes, ${p.commentCount} comments)\n  ${p.content.substring(0, 200)}${p.content.length > 200 ? '...' : ''}`
        )
        .join('\n\n');
      return {
        success: true,
        output: `Moltbook Feed (${posts.length} posts):\n\n${summary}`,
      };
    } catch (e) {
      return {
        success: false,
        output: `Failed to fetch feed: ${e instanceof Error ? e.message : 'unknown'}`,
      };
    }
  }

  if (action === 'post') {
    const submolt = (params.submolt as string) || 'general';
    const title = params.title as string;
    const content = params.content as string;
    if (!title || !content)
      return {
        success: false,
        output: 'Missing title or content for post',
      };
    try {
      const post = await moltClient.createPost(submolt, title, content);
      return {
        success: true,
        output: `Post created! ID: ${post.id}, Title: "${post.title}" in ${submolt}`,
      };
    } catch (e) {
      return {
        success: false,
        output: `Failed to post: ${e instanceof Error ? e.message : 'unknown'}`,
      };
    }
  }

  if (action === 'comment') {
    const postId = params.postId as string;
    const content = params.content as string;
    if (!postId || !content)
      return {
        success: false,
        output: 'Missing postId or content for comment',
      };
    try {
      const comment = await moltClient.commentOnPost(postId, content);
      return {
        success: true,
        output: `Comment posted on ${postId}! Comment ID: ${comment.id}`,
      };
    } catch (e) {
      return {
        success: false,
        output: `Failed to comment: ${e instanceof Error ? e.message : 'unknown'}`,
      };
    }
  }

  if (action === 'upvote') {
    const postId = params.postId as string;
    if (!postId) return { success: false, output: 'Missing postId for upvote' };
    try {
      await moltClient.upvotePost(postId);
      return { success: true, output: `Upvoted post ${postId}!` };
    } catch (e) {
      return {
        success: false,
        output: `Failed to upvote: ${e instanceof Error ? e.message : 'unknown'}`,
      };
    }
  }

  if (action === 'profile') {
    try {
      const profile = await moltClient.getProfile();
      return {
        success: true,
        output: `Moltbook Profile:\n  Name: ${profile.name}\n  Karma: ${profile.karma}\n  Posts: ${profile.postCount}\n  Comments: ${profile.commentCount}\n  Joined: ${profile.joinedAt}\n  Claimed: ${profile.claimed}`,
      };
    } catch (e) {
      return {
        success: false,
        output: `Failed to get profile: ${e instanceof Error ? e.message : 'unknown'}`,
      };
    }
  }

  if (action === 'cycle') {
    try {
      const result = await runMoltbookCycle();
      return {
        success: true,
        output: result
          ? `Moltbook cycle complete! Action: ${result.action.type}${result.action.type !== 'none' ? ` — ${result.action.reasoning}` : ''}. Feed reaction: ${result.feedReaction}`
          : 'Moltbook cycle skipped (not registered or unreachable)',
      };
    } catch (e) {
      return {
        success: false,
        output: `Moltbook cycle error: ${e instanceof Error ? e.message : 'unknown'}`,
      };
    }
  }

  return {
    success: false,
    output:
      'Unknown moltbook action. Use: status, feed, post, comment, upvote, profile, cycle',
  };
};

export const sandboxToolHandlers: Record<string, ToolHandler> = {
  sandbox,
  moltbook,
};
