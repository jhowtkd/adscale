import { z } from "zod";
import type { WorkspaceMemberRole } from "@/server/auth/workspace";
import { getThreadContextTool } from "./stubs/get-thread-context";
import { proposeActionTool } from "./stubs/propose-action";

export interface ToolHandlerContext {
  workspaceId: string;
  clientProfileId: string;
  threadId: string;
  userId: string;
}

export interface ToolHandlerResult {
  summary: string;
  actionRecordId?: string;
}

export type ToolHandler = (
  ctx: ToolHandlerContext,
  args: unknown
) => Promise<ToolHandlerResult>;

export interface RegisteredTool {
  name: string;
  description: string;
  parametersSchema: z.ZodType;
  allowedRoles: WorkspaceMemberRole[];
  requiresConfirmation: boolean;
  handler: ToolHandler;
}

export const TOOL_REGISTRY: Record<string, RegisteredTool> = {
  [getThreadContextTool.name]: getThreadContextTool,
  [proposeActionTool.name]: proposeActionTool,
};

export function registerTool(tool: RegisteredTool): void {
  TOOL_REGISTRY[tool.name] = tool;
}

export function getToolDefinition(name: string): RegisteredTool | undefined {
  return TOOL_REGISTRY[name];
}

export function listToolsForProvider(): Array<{
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}> {
  return Object.values(TOOL_REGISTRY).map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: zodToJsonSchema(tool.parametersSchema),
  }));
}

function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodTypeToJson(value as z.ZodType);
      if (!(value instanceof z.ZodOptional)) {
        required.push(key);
      }
    }

    return {
      type: "object",
      properties,
      ...(required.length > 0 ? { required } : {}),
      additionalProperties: false,
    };
  }

  return { type: "object", properties: {} };
}

function zodTypeToJson(schema: z.ZodType): Record<string, unknown> {
  if (schema instanceof z.ZodString) return { type: "string" };
  if (schema instanceof z.ZodRecord) return { type: "object", additionalProperties: true };
  if (schema instanceof z.ZodOptional) {
    return zodTypeToJson(schema.unwrap() as z.ZodType);
  }
  return { type: "string" };
}
