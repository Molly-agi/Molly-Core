/**
 * @fileOverview Common types for tool handlers
 */

export interface ToolResult {
  success: boolean;
  output: string;
  /** Optional structured data to include with the result */
  data?: Record<string, unknown>;
}

export type ToolHandler = (
  params: Record<string, unknown>
) => Promise<ToolResult>;

export interface ToolHandlerMap {
  [toolName: string]: ToolHandler;
}
