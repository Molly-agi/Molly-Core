/**
 * @fileOverview Common types for tool handlers
 */

export interface ToolResult {
  success: boolean;
  output: string;
  /**
   * Optional structured data. Typed as `unknown` so handlers can return
   * narrow, well-typed data shapes without fighting variance against a
   * widened Record. Callers that read fields off `data` should narrow.
   */
  data?: unknown;
}

export type ToolHandler = (
  params: Record<string, unknown>
) => Promise<ToolResult>;

export interface ToolHandlerMap {
  [toolName: string]: ToolHandler;
}
