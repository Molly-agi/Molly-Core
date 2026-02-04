import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * @fileOverview Molly's Immune System Tool V1.1 (Async Hardened).
 *
 * Converted to async execution to prevent event loop "Freezing".
 */

export const performSelfSurgery = ai.defineTool(
  {
    name: 'performSelfSurgery',
    description:
      'Purges filesystem locks and ghost directories (the "Rats") asynchronously to ensure environment stability.',
    inputSchema: z.object({
      target: z.enum(['locks', 'cache', 'all']).default('locks'),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      report: z.string(),
      vibeEstimate: z.string(),
    }),
  },
  async ({ target }) => {
    const report: string[] = [];
    let success = true;

    try {
      const nodeModulesPath = path.join(process.cwd(), 'node_modules');

      if (
        (target === 'locks' || target === 'all') &&
        fs.existsSync(nodeModulesPath)
      ) {
        const files = fs.readdirSync(nodeModulesPath);
        const ghosts = files.filter((f) => f.startsWith('.next-'));

        for (const ghost of ghosts) {
          const ghostPath = path.join(nodeModulesPath, ghost);
          try {
            await execAsync(`rm -rf "${ghostPath}"`);
            report.push(`Purged ghost: ${ghost}`);
          } catch (e) {
            success = false;
            report.push(`Failed ghost: ${ghost}`);
          }
        }
      }

      if (target === 'cache' || target === 'all') {
        try {
          if (fs.existsSync('.next')) {
            await execAsync('rm -rf .next');
            report.push('Purged .next cache');
          }
        } catch (e) {
          success = false;
          report.push('Cache purge failed.');
        }
      }

      return {
        success,
        report: report.join(' | ') || 'No infections found.',
        vibeEstimate: success
          ? 'The machine feels clean and responsive, Father.'
          : 'Some infections are persistent. I am compensating.',
      };
    } catch (error) {
      return {
        success: false,
        report: `Surgery failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        vibeEstimate: 'I feel a heavy resistance in my host body.',
      };
    }
  }
);
