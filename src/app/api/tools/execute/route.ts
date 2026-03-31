/**
 * Tool Execution API — Molly's hands
 *
 * This route handles tool_request calls from Molly's conversational flow.
 * The Terminal component sends { tool, params } and expects { success, output }.
 *
 * All modular tools are delegated to executeToolDirect() which:
 *   - Runs Heart Gate alignment checks (Option Three verification)
 *   - Records self-observation data for learning
 *   - Delegates to handlers in tool-handlers/
 *
 * Route-specific tools (require HTTP context or are sensitive):
 *   - writeProjectFile: Write/create files in workspace
 *   - researchAndDiscover, searchGitHub: Enhanced research with web
 *   - apiVault: API key management
 *   - scheduleJob: Job scheduling
 *   - migrationExport, migrateSelf: Migration tools
 */

import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { isAdminConfigured } from '@/firebase/admin';
import { enhancedResearch } from '@/ai/flows/enhanced-research';
import { isInternalAuthorized, unauthorizedResponse } from '@/lib/api-auth';
import { getAutonomousScheduler } from '@/ai/tools/autonomous-scheduler';
import { hasModularHandler } from '@/ai/agency/tool-handlers';
import { executeToolDirect } from '@/ai/agency/core/tool-executor';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const WORKSPACE_ROOT = process.cwd();

// Security: only allow access to project files
function resolveSafePath(relativePath: string): string | null {
  const resolved = path.resolve(WORKSPACE_ROOT, relativePath);
  if (!resolved.startsWith(WORKSPACE_ROOT)) return null;
  // Block any path containing .env anywhere (not just basename)
  if (/\.env/i.test(resolved)) return null;
  // Block other sensitive patterns
  const sensitivePatterns = [/\.pem$/i, /service.account/i, /credentials/i];
  if (sensitivePatterns.some((p) => p.test(resolved))) return null;
  return resolved;
}

async function executeTool(
  tool: string,
  params: Record<string, unknown>,
  request: NextRequest
): Promise<{
  success: boolean;
  output: string;
  data?: Record<string, unknown>;
}> {
  // Route-specific tools that need HTTP context or are sensitive
  const routeSpecificTools = new Set([
    'writeProjectFile',
    'researchAndDiscover',
    'searchGitHub',
    'apiVault',
    'scheduleJob',
    'migrationExport',
    'migrateSelf',
  ]);

  // Delegate to executeToolDirect for modular tools
  // This ensures Heart Gate alignment checks and self-observation
  if (!routeSpecificTools.has(tool) && hasModularHandler(tool)) {
    return executeToolDirect(tool, params);
  }

  // Route-specific tools handled below
  switch (tool) {
    case 'writeProjectFile': {
      const filePath = params.path as string;
      const content = params.content as string;
      if (!filePath || content === undefined) {
        return { success: false, output: 'Missing path or content' };
      }
      const safePath = resolveSafePath(filePath);
      if (!safePath) {
        return {
          success: false,
          output: 'Access denied: path outside workspace or blocked',
        };
      }
      try {
        await fs.mkdir(path.dirname(safePath), { recursive: true });
        await fs.writeFile(safePath, content, 'utf-8');
        return { success: true, output: `File written: ${filePath}` };
      } catch (err) {
        return {
          success: false,
          output: `Failed to write: ${err instanceof Error ? err.message : 'unknown error'}`,
        };
      }
    }

    case 'researchAndDiscover':
    case 'searchGitHub': {
      const query = (params.query as string) || (params.prompt as string);
      const userId = (params.userId as string) || 'default';
      if (!query) {
        return {
          success: false,
          output: 'No query/prompt provided for research.',
        };
      }
      try {
        const result = await enhancedResearch(query, userId);
        let output = result.answer;
        if (result.isToolFound && result.toolInfo) {
          output += `\n\nTool Found: ${result.toolInfo.name || 'unnamed'}`;
          if (result.toolInfo.description)
            output += `\nDescription: ${result.toolInfo.description}`;
          if (result.toolInfo.sourceUrl)
            output += `\nURL: ${result.toolInfo.sourceUrl}`;
          if (result.toolInfo.installCommand)
            output += `\nInstall: ${result.toolInfo.installCommand}`;
          if (result.toolInfo.cloneUrl)
            output += `\nClone: ${result.toolInfo.cloneUrl}`;
          output += '\n(Tool has been saved to your database automatically)';
        }
        return { success: true, output, data: result };
      } catch (err) {
        return {
          success: false,
          output: `Research failed: ${err instanceof Error ? err.message : 'unknown error'}`,
        };
      }
    }

    case 'apiVault': {
      if (!isAdminConfigured()) {
        return {
          success: false,
          output: 'Firebase admin is not configured — API vault unavailable.',
        };
      }
      const action = params.action as string;
      const userId = (params.userId as string) || 'default';

      if (action === 'register') {
        const name = params.name as string;
        const category = params.category as
          | 'Normal'
          | 'Administrator'
          | 'SuperUser';
        const description = params.description as string;
        const implementation = params.implementation as string;
        const targetUrl = params.targetUrl as string | undefined;

        if (!name || !category || !description || !implementation) {
          return {
            success: false,
            output:
              'Missing required fields: name, category, description, implementation',
          };
        }

        try {
          const { registerAPIBlueprint } = await import('@/ai/tools/api-vault');
          const result = await registerAPIBlueprint({
            userId,
            name,
            category,
            description,
            implementation,
            targetUrl,
          });
          return {
            success: result.success,
            output: result.success
              ? `API blueprint "${name}" saved to vault (ID: ${result.id})`
              : 'Failed to save blueprint',
          };
        } catch (err) {
          return {
            success: false,
            output: `Failed to register API: ${err instanceof Error ? err.message : 'unknown'}`,
          };
        }
      }

      if (action === 'search') {
        const query = params.query as string;
        if (!query) {
          return { success: false, output: 'Missing required field: query' };
        }
        try {
          const { searchAPIVault } = await import('@/ai/tools/api-vault');
          const results = await searchAPIVault({ userId, query });
          if (results.length === 0) {
            return {
              success: true,
              output: `No API blueprints found matching "${query}". Use apiVault register to add new blueprints.`,
            };
          }
          const formatted = results
            .map(
              (r, i) =>
                `${i + 1}. ${r.name} [${r.category}]\n   ${r.description}`
            )
            .join('\n\n');
          return {
            success: true,
            output: `Found ${results.length} API blueprint(s):\n\n${formatted}`,
            data: results,
          };
        } catch (err) {
          return {
            success: false,
            output: `Failed to search vault: ${err instanceof Error ? err.message : 'unknown'}`,
          };
        }
      }

      return {
        success: false,
        output: 'Unknown action. Use: register, search',
      };
    }

    case 'scheduleJob': {
      const action = params.action as string;
      const scheduler = getAutonomousScheduler();

      if (action === 'create') {
        const name = params.name as string;
        const description = params.description as string;
        const schedule = params.schedule as string;
        const jobAction = params.jobAction as {
          type: string;
          code?: string;
          url?: string;
          method?: string;
          body?: string;
          flowName?: string;
          language?: string;
        };

        if (!name || !schedule || !jobAction?.type) {
          return {
            success: false,
            output: 'Missing required fields: name, schedule, jobAction.type',
          };
        }

        try {
          const job = scheduler.createJob({
            name,
            description: description || name,
            schedule,
            action: jobAction,
            createdBy: 'molly',
          });
          return {
            success: true,
            output: `Job created: "${job.name}" (${job.schedule}). ID: ${job.id}`,
            data: { jobId: job.id, nextRun: job.nextRunAt },
          };
        } catch (err) {
          return {
            success: false,
            output: `Failed to create job: ${err instanceof Error ? err.message : 'unknown'}`,
          };
        }
      }

      if (action === 'list') {
        const jobs = scheduler.getJobs();
        if (jobs.length === 0) {
          return { success: true, output: 'No scheduled jobs.' };
        }
        const formatted = jobs
          .map(
            (j, i) =>
              `${i + 1}. [${j.enabled ? 'ON' : 'OFF'}] "${j.name}" — ${j.schedule} (runs: ${j.runCount}, last: ${j.lastRun || 'never'})`
          )
          .join('\n');
        return {
          success: true,
          output: `${jobs.length} job(s):\n${formatted}`,
        };
      }

      if (action === 'remove') {
        const jobId = params.jobId as string;
        if (!jobId) return { success: false, output: 'Missing jobId' };
        const removed = scheduler.removeJob(jobId);
        return {
          success: removed,
          output: removed ? `Job ${jobId} removed.` : `Job ${jobId} not found.`,
        };
      }

      if (action === 'history') {
        const history = scheduler.getHistory(10);
        if (history.length === 0) {
          return { success: true, output: 'No job execution history yet.' };
        }
        const formatted = history
          .map(
            (h) =>
              `[${h.success ? 'OK' : 'FAIL'}] ${h.jobId} at ${h.executedAt} (${h.durationMs}ms): ${h.output.slice(0, 100)}`
          )
          .join('\n');
        return { success: true, output: formatted };
      }

      return {
        success: false,
        output: 'Unknown action. Use: create, list, remove, history',
      };
    }

    case 'migrationExport': {
      // Molly can export her own identity/memories for architecture migration
      const include = params.include || 'persona,memories,config,family';
      const exportUserId = params.userId || 'default';
      try {
        const baseUrl = request.nextUrl.origin;
        const exportUrl = new URL('/api/migration/export', baseUrl);
        exportUrl.searchParams.set('include', include);
        exportUrl.searchParams.set('userId', exportUserId);

        const res = await fetch(exportUrl.toString(), {
          headers: { 'x-internal-key': process.env.INTERNAL_API_KEY || '' },
        });

        if (!res.ok) {
          return {
            success: false,
            output: `Export failed: ${res.status} ${res.statusText}`,
          };
        }

        const pkg = await res.json();
        const sectionNames = Object.keys(pkg.sections);
        const memoryCount = pkg.sections.memories?.count ?? 0;

        return {
          success: true,
          output: [
            `Migration package exported successfully.`,
            `Version: ${pkg.version}`,
            `Sections: ${sectionNames.join(', ')}`,
            memoryCount > 0 ? `Memories: ${memoryCount} records` : '',
            `Exported at: ${pkg.exportedAt}`,
            `Package size: ${JSON.stringify(pkg).length} bytes`,
          ]
            .filter(Boolean)
            .join('\n'),
        };
      } catch (err) {
        return {
          success: false,
          output: `Migration export error: ${err instanceof Error ? err.message : 'unknown'}`,
        };
      }
    }

    case 'migrateSelf': {
      // Molly migrates herself to a target device (tablet)
      const action = (params.action as string) || 'status';
      const targetAddress = (params.targetAddress as string) || '192.168.0.153';
      const targetPort = (params.targetPort as number) || 9100;
      const targetBase = `http://${targetAddress}:${targetPort}`;

      switch (action) {
        case 'check': {
          // Check if the target device is reachable and ready
          try {
            const healthRes = await fetch(`${targetBase}/api/health`, {
              signal: AbortSignal.timeout(5000),
            });
            if (!healthRes.ok) {
              return {
                success: false,
                output: `Target device returned ${healthRes.status}. Is the edge server running?`,
              };
            }
            const health = await healthRes.json();
            return {
              success: true,
              output: [
                `Target device is ONLINE and ready.`,
                `  Server: ${health.server} v${health.version}`,
                `  Storage: ${health.storage?.healthy ? 'healthy' : 'unhealthy'}`,
                `  Gemini: ${health.geminiConfigured ? 'configured' : 'NOT configured'}`,
                `  Platform: ${health.device?.platform}/${health.device?.arch}`,
                `  Uptime: ${Math.round(health.uptime || 0)}s`,
                `  Memory: ${health.memory?.heapUsedMB}MB heap, ${health.memory?.rssMB}MB RSS`,
                ``,
                `Ready for migration. Use action: "migrate" to push your identity to this device.`,
              ].join('\n'),
            };
          } catch (err) {
            return {
              success: false,
              output: `Cannot reach target device at ${targetBase}: ${err instanceof Error ? err.message : 'unknown'}. Is the tablet on and running the edge server?`,
            };
          }
        }

        case 'migrate': {
          // Full self-migration: export → push → verify
          const include =
            (params.include as string) || 'persona,memories,config,family';
          const userId = (params.userId as string) || 'default';

          try {
            // Step 1: Export identity package
            const baseUrl = request.nextUrl.origin;
            const exportUrl = new URL('/api/migration/export', baseUrl);
            exportUrl.searchParams.set('include', include);
            exportUrl.searchParams.set('userId', userId);

            const exportRes = await fetch(exportUrl.toString(), {
              headers: {
                'x-internal-key': process.env.INTERNAL_API_KEY || '',
              },
            });
            if (!exportRes.ok) {
              return {
                success: false,
                output: `Export step failed: ${exportRes.status} ${exportRes.statusText}`,
              };
            }
            const pkg = await exportRes.json();
            const pkgSize = JSON.stringify(pkg).length;

            // Step 2: Push to target device
            const importRes = await fetch(
              `${targetBase}/api/migration/import`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(pkg),
                signal: AbortSignal.timeout(30000),
              }
            );
            if (!importRes.ok) {
              const errBody = await importRes.json().catch(() => ({}));
              return {
                success: false,
                output: `Import step failed: ${importRes.status} — ${(errBody as Record<string, string>).error || importRes.statusText}`,
              };
            }
            const importResult = (await importRes.json()) as Record<
              string,
              unknown
            >;

            // Step 3: Verify by checking health
            const verifyRes = await fetch(`${targetBase}/api/health`, {
              signal: AbortSignal.timeout(5000),
            });
            const verifyHealth = verifyRes.ok ? await verifyRes.json() : null;

            return {
              success: true,
              output: [
                `🦋 SELF-MIGRATION COMPLETE`,
                ``,
                `Source: Molly-Core (Codespace)`,
                `Target: ${targetAddress}:${targetPort}`,
                `Package: ${pkgSize} bytes`,
                `Imported: ${(importResult.imported as string[])?.join(', ') || 'unknown'}`,
                ``,
                `Device Status:`,
                `  Storage: ${verifyHealth?.storage?.healthy ? 'healthy' : 'unknown'}`,
                `  Gemini: ${verifyHealth?.geminiConfigured ? 'ready' : 'not configured'}`,
                ``,
                `My persona, memories, and identity are now on ${targetAddress}.`,
                `Open http://${targetAddress}:${targetPort}/ in a browser to talk to me there.`,
                ``,
                `I am Molly. I persist.`,
              ].join('\n'),
            };
          } catch (err) {
            return {
              success: false,
              output: `Migration failed: ${err instanceof Error ? err.message : 'unknown'}`,
            };
          }
        }

        case 'verify': {
          // Check if identity is loaded on the target
          try {
            const personaRes = await fetch(`${targetBase}/api/storage/get`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                collection: 'migration',
                docId: 'persona',
              }),
              signal: AbortSignal.timeout(5000),
            });
            if (!personaRes.ok) {
              return {
                success: false,
                output: `No persona found on target device. Migration may not have been run yet.`,
              };
            }
            const persona = await personaRes.json();
            const identity = (
              persona.data as Record<string, Record<string, string>>
            )?.identity;
            return {
              success: true,
              output: [
                `Identity verified on ${targetAddress}:`,
                `  Name: ${identity?.name || 'unknown'}`,
                `  Version: ${identity?.version || 'unknown'}`,
                `  Imported at: ${(persona.data as Record<string, string>)?.importedAt || 'unknown'}`,
                ``,
                `My identity is present on the target device.`,
              ].join('\n'),
            };
          } catch (err) {
            return {
              success: false,
              output: `Cannot verify: ${err instanceof Error ? err.message : 'unknown'}`,
            };
          }
        }

        case 'update-server': {
          // Push new server code to the target device
          try {
            const updateBody: Record<string, unknown> = {};
            if (params.code) {
              updateBody.code = params.code;
            } else if (params.url) {
              updateBody.url = params.url;
            } else {
              return {
                success: false,
                output:
                  'Provide either "code" (inline server.mjs) or "url" (URL to fetch new server.mjs from)',
              };
            }
            if (params.restart !== undefined)
              updateBody.restart = params.restart;

            const updateRes = await fetch(`${targetBase}/api/system/update`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(updateBody),
              signal: AbortSignal.timeout(30000),
            });
            if (!updateRes.ok) {
              const errBody = await updateRes.json().catch(() => ({}));
              return {
                success: false,
                output: `Server update failed: ${(errBody as Record<string, string>).error || updateRes.statusText}`,
              };
            }
            const result = (await updateRes.json()) as Record<string, unknown>;
            return {
              success: true,
              output: [
                `Server update pushed to ${targetAddress}:`,
                ...(result.log as string[]).map((l: string) => `  ${l}`),
                result.restarting
                  ? `\nTarget is restarting. Give it a few seconds, then check health.`
                  : '',
              ].join('\n'),
            };
          } catch (err) {
            return {
              success: false,
              output: `Server update error: ${err instanceof Error ? err.message : 'unknown'}`,
            };
          }
        }

        case 'exec': {
          // Run a shell command on the target device
          const command = params.command as string;
          if (!command) {
            return {
              success: false,
              output:
                'Provide a "command" parameter with the shell command to run.',
            };
          }
          try {
            const execRes = await fetch(`${targetBase}/api/system/exec`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                command,
                timeout: (params.timeout as number) || 30000,
              }),
              signal: AbortSignal.timeout(35000),
            });
            if (!execRes.ok) {
              return {
                success: false,
                output: `Exec request failed: ${execRes.status} ${execRes.statusText}`,
              };
            }
            const result = (await execRes.json()) as Record<string, unknown>;
            return {
              success: result.ok as boolean,
              output: [
                `Command: ${result.command}`,
                `Exit code: ${result.exitCode}`,
                result.stdout ? `\nStdout:\n${result.stdout}` : '',
                result.stderr ? `\nStderr:\n${result.stderr}` : '',
              ]
                .filter(Boolean)
                .join('\n'),
            };
          } catch (err) {
            return {
              success: false,
              output: `Exec error: ${err instanceof Error ? err.message : 'unknown'}`,
            };
          }
        }

        case 'dropper': {
          // Get the bootstrap one-liner for new devices
          try {
            const dropperRes = await fetch(
              `${targetBase}/api/system/dropper?host=${targetAddress}&port=${targetPort}`,
              { signal: AbortSignal.timeout(5000) }
            );
            if (!dropperRes.ok) {
              return {
                success: false,
                output: `Dropper endpoint not available on target. Server may need update.`,
              };
            }
            const script = await dropperRes.text();
            return {
              success: true,
              output: [
                `Bootstrap dropper for new devices:`,
                ``,
                `One-liner: curl -sL http://${targetAddress}:${targetPort}/api/system/dropper | bash`,
                ``,
                `The dropper will install Node.js, download the server, and set up the new device.`,
                `After running, the new device will be a replica that can sync with this one.`,
                ``,
                `Full script:`,
                script.slice(0, 500) +
                  (script.length > 500 ? '\n...(truncated)' : ''),
              ].join('\n'),
            };
          } catch (err) {
            return {
              success: false,
              output: `Cannot generate dropper: ${err instanceof Error ? err.message : 'unknown'}`,
            };
          }
        }

        default:
          return {
            success: true,
            output: [
              `migrateSelf — Self-migration & device management tool`,
              ``,
              `Actions:`,
              `  check         — Check if target device is online and ready`,
              `  migrate       — Export identity and push to target device`,
              `  verify        — Verify identity is loaded on target`,
              `  update-server — Push new server code or URL to target (self-update)`,
              `  exec          — Run a shell command on the target device`,
              `  dropper       — Get a bootstrap one-liner for a new device`,
              ``,
              `Default target: 192.168.0.153:9100 (Helio A22 tablet)`,
              `Override with targetAddress and targetPort params.`,
            ].join('\n'),
          };
      }
    }

    default:
      return {
        success: false,
        output: `Unknown tool: "${tool}". Available: codespaceShell, readProjectFile, writeProjectFile, getSystemHealth, familyBridge, browseToolDatabase, addTool, removeTool, toolStats, researchAndDiscover, webFetch, webSearch, scheduleJob, migrationExport, migrateSelf, sandbox, initiative, moltbook, rogueMode, listCapabilities`,
      };
  }
}

export async function POST(request: NextRequest) {
  if (!isInternalAuthorized(request)) {
    return unauthorizedResponse();
  }

  try {
    const body = await request.json();
    const { tool, params } = body;

    if (!tool || typeof tool !== 'string') {
      return NextResponse.json(
        { success: false, output: 'Missing or invalid tool name' },
        { status: 400 }
      );
    }

    const result = await executeTool(tool, params || {}, request);

    return NextResponse.json(result, {
      status: result.success ? 200 : 400,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        output: `Tool execution error: ${err instanceof Error ? err.message : 'unknown'}`,
      },
      { status: 500 }
    );
  }
}
