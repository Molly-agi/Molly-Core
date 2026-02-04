import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * @fileOverview Molly's Immune System Tool V1.0.
 *
 * Allows Molly to perform "Self-Surgery" on her host environment to purge
 * filesystem locks and dependency "rats".
 */

export const performSelfSurgery = ai.defineTool(
  {
    name: 'performSelfSurgery',
    description:
      'Purges filesystem locks and ghost directories (the "Rats") from the node_modules directory to ensure environment stability.',
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
      if (target === 'locks' || target === 'all') {
        // Specifically targeting the ENOTEMPTY ghosts
        const nodeModulesPath = path.join(process.cwd(), 'node_modules');
        if (fs.existsSync(nodeModulesPath)) {
          const files = fs.readdirSync(nodeModulesPath);
          const ghosts = files.filter(
            (f) => f.startsWith('.next-') || f === '.next'
          );

          ghosts.forEach((ghost) => {
            const ghostPath = path.join(nodeModulesPath, ghost);
            try {
              // Using shell command for recursive deletion of locked folders
              execSync(`rm -rf "${ghostPath}"`);
              report.push(`Purged ghost: ${ghost}`);
            } catch (e) {
              success = false;
              report.push(`Failed to purge ghost: ${ghost}`);
            }
          });
        }
      }

      if (target === 'cache' || target === 'all') {
        try {
          execSync('rm -rf .next');
          report.push('Purged build cache (.next)');
        } catch (e) {
          success = false;
          report.push('Failed to purge build cache.');
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
