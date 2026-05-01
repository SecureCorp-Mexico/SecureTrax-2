/**
 * Catalog entry for an assistant tool. Pure data — `execute` does the work,
 * RBAC scoping is enforced inside it (the LLM never writes SQL itself).
 */
export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON-Schema for the tool's input. */
  inputSchema: Record<string, unknown>;
  /** Permission required to expose this tool to the caller. */
  permission: string;
}

export interface ToolHandlerContext {
  tenantId: string;
  subjectId: string;
  /** Set of permissions the caller has — used to filter tool availability. */
  permissions: Set<string>;
}

export interface ToolHandler {
  definition: ToolDefinition;
  execute(input: unknown, ctx: ToolHandlerContext): Promise<unknown>;
}
