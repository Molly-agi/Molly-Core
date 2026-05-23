/**
 * @fileOverview Widget Socket Client
 *
 * Provides Molly with direct socket communication to the Android Widget Socket Service.
 * This bypasses Termux entirely and sends JSON commands directly to the APK's socket listener.
 *
 * Usage:
 *   const client = new WidgetSocketClient('localhost', 9077);
 *   await client.showWidget('gemini_mother', 'Hello Molly!');
 *   await client.updateState('research_status', 'loading');
 */

import { createConnection, Socket } from 'net';
import { MollyLogger } from '@/ai/logger';

export interface WidgetCommand {
  action: string;
  data?: Record<string, unknown>;
  key?: string;
  value?: string;
}

export interface WidgetResponse {
  status: 'success' | 'error';
  action?: string;
  error?: string;
  widget_type?: string;
  timestamp?: number;
  state?: Record<string, string>;
  key?: string;
  value?: string;
}

/**
 * WidgetSocketClient - Communicates with the Android Widget Socket Service
 */
export class WidgetSocketClient {
  private host: string;
  private port: number;
  private timeout: number = 5000; // 5 second timeout per command

  constructor(host: string = 'localhost', port: number = 9077) {
    this.host = host;
    this.port = port;
  }

  /**
   * Send a raw command to the widget socket and wait for response
   */
  private async sendCommand(command: WidgetCommand): Promise<WidgetResponse> {
    return new Promise((resolve, reject) => {
      const socket = createConnection(
        {
          host: this.host,
          port: this.port,
        },
        () => {
          MollyLogger.debug(`Connected to widget socket at ${this.host}:${this.port}`, 'widget-socket');
          
          // Send command as JSON + newline
          const jsonCommand = JSON.stringify(command) + '\n';
          socket.write(jsonCommand, 'utf8');
        }
      );

      let responseBuffer = '';

      // Handle response
      socket.on('data', (data) => {
        responseBuffer += data.toString('utf8');

        // Check if we have a complete line (ends with \n)
        if (responseBuffer.includes('\n')) {
          const lines = responseBuffer.split('\n');
          const responseLine = lines[0];

          if (responseLine.trim()) {
            try {
              const response: WidgetResponse = JSON.parse(responseLine);
              socket.destroy();
              clearTimeout(timeoutHandle);
              resolve(response);
            } catch (e) {
              socket.destroy();
              clearTimeout(timeoutHandle);
              reject(new Error(`Invalid JSON response: ${responseLine}`));
            }
          }
        }
      });

      // Handle errors
      socket.on('error', (err) => {
        clearTimeout(timeoutHandle);
        MollyLogger.error(`Widget socket error: ${err.message}`, 'widget-socket');
        reject(err);
      });

      socket.on('close', () => {
        // Connection closed, but we might already have gotten response
        clearTimeout(timeoutHandle);
      });

      // Timeout handler
      const timeoutHandle = setTimeout(() => {
        socket.destroy();
        reject(new Error(`Widget socket timeout after ${this.timeout}ms`));
      }, this.timeout);
    });
  }

  /**
   * Show a widget on the device
   */
  async showWidget(widgetType: string, content: string): Promise<WidgetResponse> {
    MollyLogger.info(`Showing widget: ${widgetType}`, 'widget-socket');

    return this.sendCommand({
      action: 'show_widget',
      data: {
        type: widgetType,
        content: content,
      },
    });
  }

  /**
   * Hide the currently visible widget
   */
  async hideWidget(): Promise<WidgetResponse> {
    MollyLogger.info('Hiding widget', 'widget-socket');
    return this.sendCommand({ action: 'hide_widget' });
  }

  /**
   * Update widget state (e.g., progress, status message)
   */
  async updateState(key: string, value: string): Promise<WidgetResponse> {
    MollyLogger.debug(`Updating widget state: ${key}=${value}`, 'widget-socket');

    return this.sendCommand({
      action: 'update_state',
      data: {
        key: key,
        value: value,
      },
    });
  }

  /**
   * Get current widget status and state
   */
  async getStatus(): Promise<WidgetResponse> {
    MollyLogger.debug('Fetching widget status', 'widget-socket');
    return this.sendCommand({ action: 'get_status' });
  }

  /**
   * Get a specific state value by key
   */
  async getState(key: string): Promise<WidgetResponse> {
    MollyLogger.debug(`Fetching widget state: ${key}`, 'widget-socket');

    return this.sendCommand({
      action: 'get_state',
      key: key,
    });
  }

  /**
   * Check if widget socket is reachable
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await this.getStatus();
      return response.status === 'success';
    } catch {
      return false;
    }
  }
}

/**
 * Singleton instance for use throughout Molly
 */
let globalWidgetClient: WidgetSocketClient | null = null;

export function getWidgetSocketClient(): WidgetSocketClient {
  if (!globalWidgetClient) {
    // Try to use ADB forward tunnel if available, otherwise localhost
    const host = process.env.WIDGET_SOCKET_HOST || 'localhost';
    const port = parseInt(process.env.WIDGET_SOCKET_PORT || '9077', 10);
    globalWidgetClient = new WidgetSocketClient(host, port);
  }
  return globalWidgetClient;
}

export function resetWidgetSocketClient(): void {
  globalWidgetClient = null;
}
