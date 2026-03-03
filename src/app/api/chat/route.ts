import type { FileNode } from "@/lib/file-system";
import { VirtualFileSystem } from "@/lib/file-system";
import { streamText, appendResponseMessages } from "ai";
import { buildStrReplaceTool } from "@/lib/tools/str-replace";
import { buildFileManagerTool } from "@/lib/tools/file-manager";
import { getLanguageModel, isMockProvider } from "@/lib/provider";
import { generationPrompt } from "@/lib/prompts/generation";
import { saveProjectState } from "@/lib/agents/save-project";

export async function POST(req: Request) {
  const {
    messages,
    files,
    projectId,
  }: { messages: any[]; files: Record<string, FileNode>; projectId?: string } = await req.json();

  messages.unshift({
    role: "system",
    content: generationPrompt,
    providerOptions: {
      anthropic: { cacheControl: { type: "ephemeral" } },
    },
  });

  // Reconstruct the VirtualFileSystem from serialized data
  const fileSystem = new VirtualFileSystem();
  fileSystem.deserializeFromNodes(files);

  const model = getLanguageModel();
  // Use fewer steps for mock provider to prevent repetition
  const result = streamText({
    model,
    messages,
    maxTokens: 10_000,
    maxSteps: isMockProvider() ? 4 : 40,
    onError: ({ error }) => {
      console.error(error);
    },
    tools: {
      str_replace_editor: buildStrReplaceTool(fileSystem),
      file_manager: buildFileManagerTool(fileSystem),
    },
    onFinish: async ({ response }) => {
      if (projectId) {
        const responseMessages = response.messages || [];
        const allMessages = appendResponseMessages({
          messages: [...messages.filter((m) => m.role !== "system")],
          responseMessages,
        });
        await saveProjectState(projectId, allMessages, fileSystem.serialize());
      }
    },
  });

  return result.toDataStreamResponse();
}

export const maxDuration = 120;
