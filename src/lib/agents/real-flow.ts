import type { VirtualFileSystem } from "@/lib/file-system";
import { AgentRole, type AgentStreamEvent, type AgentMessage } from "@/lib/agents/types";
import { saveProjectState } from "@/lib/agents/save-project";

const MAX_TURNS = 5;
const MAX_ASSISTANT_CHARS = 500;

/**
 * Format conversation history from prior messages into a context string.
 * Keeps meaningful user/assistant turns, filters noise, and caps size.
 */
export function formatConversationHistory(messages: any[]): string {
  if (!messages || messages.length <= 1) return "";

  // Exclude the last message (the current user request)
  const prior = messages.slice(0, -1);

  const turns: { role: string; content: string }[] = [];

  for (const msg of prior) {
    const id = msg.id || "";
    const role = msg.role || "";
    const content = typeof msg.content === "string" ? msg.content.trim() : "";

    if (!content) continue;

    // Filter out assistant placeholders ("Multi-agent workflow completed...")
    if (role === "assistant" && !id.startsWith("multi-agent-")) {
      if (
        content.includes("Multi-agent workflow completed") ||
        content.includes("Multi-agent workflow failed")
      ) {
        continue;
      }
    }

    // Filter out error messages saved during failures
    if (id.startsWith("multi-agent-error-")) continue;

    if (role === "user") {
      turns.push({ role: "user", content });
    } else if (role === "assistant") {
      const truncated =
        content.length > MAX_ASSISTANT_CHARS
          ? content.slice(0, MAX_ASSISTANT_CHARS) + "..."
          : content;
      turns.push({ role: "assistant", content: truncated });
    }
  }

  if (turns.length === 0) return "";

  // Keep only the last N turns
  const recentTurns = turns.slice(-MAX_TURNS * 2);

  const formatted = recentTurns
    .map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.content}`)
    .join("\n\n");

  return `[CONVERSATION HISTORY]\n${formatted}\n[END CONVERSATION HISTORY]`;
}

function toAgentMessage(event: AgentStreamEvent): AgentMessage {
  return {
    id: `agent-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    agent: event.agent,
    type: event.type,
    content: event.content || "",
    timestamp: Date.now(),
    toolName: event.toolName,
    toolArgs: event.toolArgs,
  };
}

export function runRealMultiAgentFlow(
  userContent: string,
  fileSystem: VirtualFileSystem,
  sendEvent: (e: AgentStreamEvent) => Promise<void>,
  writer: WritableStreamDefaultWriter,
  messages: any[],
  projectId?: string
): void {
  (async () => {
    const collectedEvents: AgentMessage[] = [];

    try {
      const orchestratorStart: AgentStreamEvent = {
        type: "agent_start",
        agent: AgentRole.ORCHESTRATOR,
        content: "Starting multi-agent workflow...",
      };
      collectedEvents.push(toAgentMessage(orchestratorStart));
      await sendEvent(orchestratorStart);

      // Dynamic imports so LangChain only loads when actually needed
      const { buildMultiAgentGraph } = await import("@/lib/agents/graph");
      const { HumanMessage } = await import("@langchain/core/messages");

      const graph = buildMultiAgentGraph(fileSystem, async (event) => {
        collectedEvents.push(toAgentMessage(event));
        try {
          await sendEvent(event);
        } catch {
          // Writer may be closed
        }
      });

      // Include existing file context so agents know what's already in the filesystem
      const existingFiles = fileSystem.getAllFiles();
      let messageContent = userContent;
      if (existingFiles.size > 0) {
        const fileList = Array.from(existingFiles.keys()).join("\n");
        messageContent += `\n\n[EXISTING FILES in the virtual filesystem — use "view" to read them before making changes]\n${fileList}`;
      }

      // Prepend conversation history so agents have context from prior turns
      const history = formatConversationHistory(messages);
      if (history) {
        messageContent = `${history}\n\n[CURRENT REQUEST]\n${messageContent}`;
      }

      const result = await graph.invoke(
        { messages: [new HumanMessage(messageContent)] },
        { recursionLimit: 100 }
      );

      const agentMessages = result.messages || [];

      await sendEvent({
        type: "workflow_done",
        agent: AgentRole.ORCHESTRATOR,
        content: JSON.stringify({
          files: fileSystem.serialize(),
          messageCount: agentMessages.length,
        }),
      });

      if (projectId) {
        const summaryParts: string[] = [];
        for (const msg of agentMessages) {
          if (msg.getType() === "ai") {
            const content = msg.content;
            let text = "";
            if (typeof content === "string") {
              text = content.trim();
            } else if (Array.isArray(content)) {
              text = (content as Array<{ type: string; text?: string }>)
                .filter((block) => block.type === "text" && block.text)
                .map((block) => block.text!)
                .join("\n")
                .trim();
            }
            if (text) {
              summaryParts.push(text);
            }
          }
        }

        const allMessages = [
          ...messages,
          {
            id: `multi-agent-${crypto.randomUUID()}`,
            role: "assistant",
            content: summaryParts.join("\n\n") || "Multi-agent workflow completed.",
          },
        ];

        await saveProjectState(projectId, allMessages, fileSystem.serialize(), collectedEvents);
      }
    } catch (error) {
      console.error("Multi-agent workflow error:", error);
      try {
        // Still send any files that were created before the error
        const serialized = fileSystem.serialize();
        const hasFiles = Object.keys(serialized).length > 1; // more than just root "/"
        await sendEvent({
          type: "workflow_done",
          agent: AgentRole.ORCHESTRATOR,
          content: JSON.stringify({
            ...(hasFiles ? { files: serialized } : {}),
            error: String(error),
          }),
        });
      } catch {
        // Writer may already be closed
      }

      if (projectId) {
        const errorMessages = [
          ...messages,
          {
            id: `multi-agent-error-${crypto.randomUUID()}`,
            role: "assistant",
            content: `Multi-agent workflow failed: ${String(error)}`,
          },
        ];
        await saveProjectState(projectId, errorMessages, fileSystem.serialize(), collectedEvents);
      }
    } finally {
      try {
        await writer.close();
      } catch {
        // Already closed
      }
    }
  })();
}
