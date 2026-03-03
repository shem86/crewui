import type { FileNode } from "@/lib/file-system";
import { VirtualFileSystem } from "@/lib/file-system";
import { isMockProvider } from "@/lib/provider";
import type { AgentStreamEvent } from "@/lib/agents/types";
import { runMockMultiAgentFlow } from "@/lib/agents/mock-flow";
import { runRealMultiAgentFlow } from "@/lib/agents/real-flow";

export async function POST(req: Request) {
  let body: { messages?: unknown; files?: unknown; projectId?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON in request body" }, { status: 400 });
  }

  const { messages, files, projectId } = body;

  if (!Array.isArray(messages)) {
    return Response.json({ error: "messages must be an array" }, { status: 400 });
  }
  if (!files || typeof files !== "object") {
    return Response.json({ error: "files must be an object" }, { status: 400 });
  }

  // Reconstruct the VirtualFileSystem from serialized data
  const fileSystem = new VirtualFileSystem();
  fileSystem.deserializeFromNodes(files as Record<string, FileNode>);

  // Collect events to stream back to the client
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  // Helper to write SSE-formatted data (try-catch guards against client disconnect)
  async function sendEvent(event: AgentStreamEvent) {
    try {
      const data = JSON.stringify(event);
      await writer.write(encoder.encode(`data: ${data}\n\n`));
    } catch {
      // Writer may be closed if client disconnected
    }
  }

  // Extract the last user message
  const userMessages = messages.filter((m: any) => m.role === "user");
  const lastUserMessage = userMessages[userMessages.length - 1];
  const userContent =
    typeof lastUserMessage?.content === "string"
      ? lastUserMessage.content
      : Array.isArray(lastUserMessage?.content)
        ? lastUserMessage.content.map((p: any) => p.text || "").join(" ")
        : "Create a React component";

  if (isMockProvider()) {
    runMockMultiAgentFlow(userContent, fileSystem, sendEvent, writer, messages, projectId);
  } else {
    runRealMultiAgentFlow(userContent, fileSystem, sendEvent, writer, messages, projectId);
  }

  return new Response(stream.readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

export const maxDuration = 300;
