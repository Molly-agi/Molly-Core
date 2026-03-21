/**
 * @fileOverview Common types for tool handlers
 */

export interface ToolResult {
  success: boolean;
  output: string;
}

export type ToolHandler = (
  params: Record<string, unknown>
) => Promise<ToolResult>;

export interface ToolHandlerMap {
  [toolName: string]: ToolHandler;
}
