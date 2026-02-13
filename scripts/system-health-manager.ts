#!/usr/bin/env node
/**
 * System Health Manager - Molly Core Infrastructure
 * Monitors and optimizes codespace resources for running Molly
 */

import { execSync, exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

interface SystemMetrics {
  cpuUsage: number;
  memoryUsed: number;
  memoryTotal: number;
  memoryPercent: number;
  loadAverage: number[];
  diskUsed: number;
  diskTotal: number;
  diskPercent: number;
  timestamp: Date;
}

interface ProcessInfo {
  pid: number;
  name: string;
  cpu: number;
  memory: number;
}

class SystemHealthManager {
  private logFile: string;
  private metricsHistory: SystemMetrics[] = [];
  private readonly MAX_HISTORY = 60; // Keep last 60 readings
  
  // Thresholds
  private readonly CPU_THRESHOLD = 80;
  private readonly MEMORY_THRESHOLD = 85;
  private readonly LOAD_THRESHOLD_PER_CORE = 3;
  private readonly TS_SERVER_MEMORY_LIMIT = 2048; // MB
  
  constructor() {
    this.logFile = path.join('/workspaces/Molly-Core', 'logs', 'system-health.log');
    this.ensureLogDirectory();
  }

  private ensureLogDirectory() {
    const logDir = path.dirname(this.logFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  private log(message: string, level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS' = 'INFO') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level}] ${message}\n`;
    
    console.log(logMessage.trim());
    
    try {
      fs.appendFileSync(this.logFile, logMessage);
    } catch (err) {
      console.error('Failed to write to log file:', err);
    }
  }

  async getSystemMetrics(): Promise<SystemMetrics> {
    try {
      // Get CPU and memory info
      const topOutput = execSync('top -bn1 | head -5', { encoding: 'utf-8' });
      
      // Parse load average
      const loadMatch = topOutput.match(/load average: ([\d.]+), ([\d.]+), ([\d.]+)/);
      const loadAverage = loadMatch 
        ? [parseFloat(loadMatch[1]), parseFloat(loadMatch[2]), parseFloat(loadMatch[3])]
        : [0, 0, 0];

      // Parse CPU usage
      const cpuMatch = topOutput.match(/Cpu\(s\):\s+([\d.]+)\s+us.*?([\d.]+)\s+id/);
      const cpuUsage = cpuMatch ? 100 - parseFloat(cpuMatch[2]) : 0;

      // Parse memory
      const memMatch = topOutput.match(/MiB Mem\s*:\s*([\d.]+)\s+total,.*?([\d.]+)\s+used/);
      const memoryTotal = memMatch ? parseFloat(memMatch[1]) : 0;
      const memoryUsed = memMatch ? parseFloat(memMatch[2]) : 0;
      const memoryPercent = memoryTotal > 0 ? (memoryUsed / memoryTotal) * 100 : 0;

      // Get disk usage
      const dfOutput = execSync('df -BM /workspaces | tail -1', { encoding: 'utf-8' });
      const dfMatch = dfOutput.match(/(\d+)M\s+(\d+)M\s+(\d+)M\s+(\d+)%/);
      const diskTotal = dfMatch ? parseInt(dfMatch[1]) : 0;
      const diskUsed = dfMatch ? parseInt(dfMatch[2]) : 0;
      const diskPercent = dfMatch ? parseInt(dfMatch[4]) : 0;

      const metrics: SystemMetrics = {
        cpuUsage,
        memoryUsed,
        memoryTotal,
        memoryPercent,
        loadAverage,
        diskUsed,
        diskTotal,
        diskPercent,
        timestamp: new Date()
      };

      // Store in history
      this.metricsHistory.push(metrics);
      if (this.metricsHistory.length > this.MAX_HISTORY) {
        this.metricsHistory.shift();
      }

      return metrics;
    } catch (error) {
      this.log(`Error collecting metrics: ${error}`, 'ERROR');
      throw error;
    }
  }

  async getTopProcesses(count: number = 10): Promise<ProcessInfo[]> {
    try {
      const psOutput = execSync(
        `ps aux --sort=-%mem | head -${count + 1} | tail -${count}`,
        { encoding: 'utf-8' }
      );

      const processes: ProcessInfo[] = [];
      const lines = psOutput.trim().split('\n');

      for (const line of lines) {
        const parts = line.split(/\s+/);
        if (parts.length >= 11) {
          processes.push({
            pid: parseInt(parts[1]),
            name: parts[10],
            cpu: parseFloat(parts[2]),
            memory: parseFloat(parts[3])
          });
        }
      }

      return processes;
    } catch (error) {
      this.log(`Error getting processes: ${error}`, 'ERROR');
      return [];
    }
  }

  async optimizeTypeScriptServers() {
    try {
      this.log('Checking TypeScript servers...', 'INFO');
      
      const tsProcesses = execSync(
        'ps aux | grep "tsserver.js" | grep -v grep',
        { encoding: 'utf-8' }
      ).trim();

      if (!tsProcesses) {
        this.log('No TypeScript servers running', 'INFO');
        return;
      }

      const lines = tsProcesses.split('\n');
      let killed = 0;

      for (const line of lines) {
        const parts = line.split(/\s+/);
        const memPercent = parseFloat(parts[3]);
        const pid = parseInt(parts[1]);

        // Kill TypeScript servers using more than 10% memory
        if (memPercent > 10 && !isNaN(pid)) {
          this.log(`Killing high-memory TS server (PID: ${pid}, MEM: ${memPercent}%)`, 'WARN');
          try {
            process.kill(pid, 'SIGTERM');
            killed++;
          } catch (err) {
            this.log(`Failed to kill PID ${pid}: ${err}`, 'ERROR');
          }
        }
      }

      if (killed > 0) {
        this.log(`Killed ${killed} TypeScript server(s)`, 'SUCCESS');
        await this.sleep(2000); // Wait for restart
      }
    } catch (error) {
      // No TypeScript servers found or error - that's okay
      this.log('No problematic TypeScript servers found', 'INFO');
    }
  }

  async optimizeExtensions() {
    try {
      this.log('Checking VS Code extension hosts...', 'INFO');
      
      const extProcesses = execSync(
        'ps aux | grep "extensionHost" | grep -v grep',
        { encoding: 'utf-8' }
      ).trim();

      if (!extProcesses) {
        return;
      }

      const lines = extProcesses.split('\n');
      let restarted = 0;

      for (const line of lines) {
        const parts = line.split(/\s+/);
        const memPercent = parseFloat(parts[3]);
        const pid = parseInt(parts[1]);

        // Kill extension hosts using more than 15% memory
        if (memPercent > 15 && !isNaN(pid)) {
          this.log(`Restarting high-memory extension host (PID: ${pid}, MEM: ${memPercent}%)`, 'WARN');
          try {
            process.kill(pid, 'SIGTERM');
            restarted++;
          } catch (err) {
            this.log(`Failed to restart PID ${pid}: ${err}`, 'ERROR');
          }
        }
      }

      if (restarted > 0) {
        this.log(`Restarted ${restarted} extension host(s)`, 'SUCCESS');
      }
    } catch (error) {
      this.log('No problematic extension hosts found', 'INFO');
    }
  }

  async clearCaches() {
    try {
      this.log('Clearing TypeScript and build caches...', 'INFO');
      
      const cachePaths = [
        '/home/codespace/.cache/typescript',
        '/workspaces/Molly-Core/.next/cache',
        '/workspaces/Molly-Core/node_modules/.cache'
      ];

      for (const cachePath of cachePaths) {
        if (fs.existsSync(cachePath)) {
          execSync(`rm -rf ${cachePath}/*`);
          this.log(`Cleared ${cachePath}`, 'SUCCESS');
        }
      }
    } catch (error) {
      this.log(`Error clearing caches: ${error}`, 'ERROR');
    }
  }

  async analyzeAndOptimize(metrics: SystemMetrics) {
    const cpuCores = parseInt(execSync('nproc', { encoding: 'utf-8' }).trim());
    const loadPerCore = metrics.loadAverage[0] / cpuCores;

    this.log('=== System Health Analysis ===', 'INFO');
    this.log(`CPU Usage: ${metrics.cpuUsage.toFixed(1)}%`, 'INFO');
    this.log(`Memory: ${metrics.memoryUsed.toFixed(0)}MB / ${metrics.memoryTotal.toFixed(0)}MB (${metrics.memoryPercent.toFixed(1)}%)`, 'INFO');
    this.log(`Load: ${metrics.loadAverage[0].toFixed(2)} (${loadPerCore.toFixed(2)} per core)`, 'INFO');
    this.log(`Disk: ${metrics.diskPercent}%`, 'INFO');

    const issues: string[] = [];
    const actions: Promise<void>[] = [];

    // Check CPU/Load
    if (loadPerCore > this.LOAD_THRESHOLD_PER_CORE) {
      issues.push('High system load');
      this.log('⚠️  High system load detected', 'WARN');
      actions.push(this.optimizeTypeScriptServers());
      actions.push(this.optimizeExtensions());
    }

    // Check Memory
    if (metrics.memoryPercent > this.MEMORY_THRESHOLD) {
      issues.push('High memory usage');
      this.log('⚠️  High memory usage detected', 'WARN');
      actions.push(this.optimizeTypeScriptServers());
      actions.push(this.clearCaches());
    }

    // Check Disk
    if (metrics.diskPercent > 80) {
      issues.push('High disk usage');
      this.log('⚠️  High disk usage detected', 'WARN');
      actions.push(this.clearCaches());
    }

    if (actions.length > 0) {
      this.log(`Applying ${actions.length} optimization(s)...`, 'INFO');
      await Promise.all(actions);
      this.log('Optimizations complete', 'SUCCESS');
    } else {
      this.log('✅ System health is good', 'SUCCESS');
    }

    return issues;
  }

  async getProcessCount(name: string): Promise<number> {
    try {
      const output = execSync(`ps aux | grep "${name}" | grep -v grep | wc -l`, { encoding: 'utf-8' });
      return parseInt(output.trim()) || 0;
    } catch {
      return 0;
    }
  }

  async generateReport(): Promise<string> {
    const metrics = await this.getSystemMetrics();
    const topProcesses = await this.getTopProcesses(5);
    const tsServerCount = await this.getProcessCount('tsserver');
    const extensionHostCount = await this.getProcessCount('extensionHost');

    let report = '\n╔════════════════════════════════════════════════╗\n';
    report += '║     MOLLY SYSTEM HEALTH REPORT                ║\n';
    report += '╚════════════════════════════════════════════════╝\n\n';

    report += `📊 System Resources:\n`;
    report += `   CPU Usage: ${metrics.cpuUsage.toFixed(1)}%\n`;
    report += `   Memory: ${metrics.memoryPercent.toFixed(1)}% (${metrics.memoryUsed.toFixed(0)}MB / ${metrics.memoryTotal.toFixed(0)}MB)\n`;
    report += `   Load: ${metrics.loadAverage.map(l => l.toFixed(2)).join(', ')}\n`;
    report += `   Disk: ${metrics.diskPercent}% used\n\n`;

    report += `🔧 Active Services:\n`;
    report += `   TypeScript Servers: ${tsServerCount}\n`;
    report += `   Extension Hosts: ${extensionHostCount}\n\n`;

    report += `💻 Top Memory Consumers:\n`;
    topProcesses.forEach((proc, i) => {
      const name = proc.name.length > 30 ? proc.name.substring(0, 27) + '...' : proc.name;
      report += `   ${i + 1}. ${name.padEnd(30)} ${proc.memory.toFixed(1)}%\n`;
    });

    return report;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async runOnce() {
    this.log('Starting system health check...', 'INFO');
    const metrics = await this.getSystemMetrics();
    await this.analyzeAndOptimize(metrics);
    const report = await this.generateReport();
    console.log(report);
  }

  async runDaemon(intervalSeconds: number = 60) {
    this.log('Starting System Health Manager daemon...', 'INFO');
    this.log(`Monitoring interval: ${intervalSeconds}s`, 'INFO');

    while (true) {
      try {
        const metrics = await this.getSystemMetrics();
        await this.analyzeAndOptimize(metrics);
        await this.sleep(intervalSeconds * 1000);
      } catch (error) {
        this.log(`Daemon error: ${error}`, 'ERROR');
        await this.sleep(10000); // Wait 10s on error
      }
    }
  }
}

// CLI Interface
async function main() {
  const manager = new SystemHealthManager();
  const args = process.argv.slice(2);
  const command = args[0] || 'check';

  switch (command) {
    case 'check':
    case 'status':
      await manager.runOnce();
      break;

    case 'daemon':
    case 'monitor':
      const interval = parseInt(args[1]) || 60;
      await manager.runDaemon(interval);
      break;

    case 'optimize':
      console.log('Running optimizations...');
      await manager.optimizeTypeScriptServers();
      await manager.optimizeExtensions();
      await manager.clearCaches();
      console.log('✅ Optimizations complete');
      break;

    case 'report':
      const report = await manager.generateReport();
      console.log(report);
      break;

    default:
      console.log(`
╔═══════════════════════════════════════════════════════════╗
║          Molly System Health Manager                      ║
╚═══════════════════════════════════════════════════════════╝

Usage: node system-health-manager.ts [command] [options]

Commands:
  check, status         Run a single health check and optimize
  daemon [interval]     Run as daemon (default: 60s interval)
  optimize              Force optimization of all systems
  report                Generate and display health report
  
Examples:
  node system-health-manager.ts check
  node system-health-manager.ts daemon 30
  node system-health-manager.ts optimize
      `);
      break;
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { SystemHealthManager, SystemMetrics, ProcessInfo };
