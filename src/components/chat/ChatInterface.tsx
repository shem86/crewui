"use client";

import { useEffect, useRef } from "react";
import { MessageBubble } from "./MessageList";
import { AgentActivityFeed } from "./AgentActivityFeed";
import { MessageInput } from "./MessageInput";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useChat } from "@/lib/contexts/chat-context";
import { Bot, GitBranch, Workflow } from "lucide-react";
import type { WorkflowMode } from "@/lib/agents/types";

function WorkflowModeToggle({
  mode,
  onChange,
}: {
  mode: WorkflowMode;
  onChange: (mode: WorkflowMode) => void;
}) {
  const options: { value: WorkflowMode; label: string; icon: React.ReactNode; desc: string }[] = [
    { value: "pipeline", label: "Pipeline", icon: <GitBranch className="h-3.5 w-3.5" />, desc: "Design → Engineer → QA" },
    { value: "supervisor", label: "Supervisor", icon: <Workflow className="h-3.5 w-3.5" />, desc: "AI picks the route" },
  ];

  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="text-xs text-neutral-400 font-medium uppercase tracking-wide">Workflow Mode</span>
      <div className="flex rounded-lg bg-neutral-100 p-0.5">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              mode === opt.value
                ? "bg-white text-neutral-900 shadow-sm"
                : "text-neutral-500 hover:text-neutral-700"
            }`}
          >
            {opt.icon}
            {opt.label}
          </button>
        ))}
      </div>
      <span className="text-xs text-neutral-400">
        {options.find((o) => o.value === mode)?.desc}
      </span>
    </div>
  );
}

export function ChatInterface() {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const {
    displayMessages,
    input,
    handleInputChange,
    handleSubmit,
    status,
    agentMessages,
    agentMessageHistory,
    isMultiAgentRunning,
    workflowMode,
    setWorkflowMode,
  } = useChat();

  const isStreaming = status === "streaming";
  const isLoading = status === "submitted" || isStreaming;
  const hasMessages = displayMessages.length > 0 || agentMessages.length > 0 || agentMessageHistory.length > 0;

  useEffect(() => {
    const scrollContainer = scrollAreaRef.current?.querySelector(
      "[data-radix-scroll-area-viewport]"
    );
    if (scrollContainer) {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    }
  }, [displayMessages, agentMessages]);

  // Build interleaved content: pair each user message with its corresponding agent run
  const renderInterleaved = () => {
    let agentRunIndex = 0;
    const elements: React.ReactNode[] = [];

    for (let i = 0; i < displayMessages.length; i++) {
      const message = displayMessages[i];
      elements.push(
        <MessageBubble
          key={message.id || message.content}
          message={message}
          isLoading={false}
          isLast={i === displayMessages.length - 1}
        />
      );

      // After a user message, check if the next message is an error (failed turn)
      if (message.role === "user") {
        const nextMessage = displayMessages[i + 1];
        const isErrorResponse = nextMessage?.role === "assistant" &&
          nextMessage.content.startsWith("Error:");

        // If the next message is NOT an error, pair with agent run
        if (!isErrorResponse && agentRunIndex < agentMessageHistory.length) {
          elements.push(
            <AgentActivityFeed
              key={`history-${agentRunIndex}`}
              agentMessages={agentMessageHistory[agentRunIndex]}
              isRunning={false}
            />
          );
          agentRunIndex++;
        }
        // If it IS an error, skip pairing — the error bubble renders on next iteration
      }
    }

    // Live agent feed at the end
    if (agentMessages.length > 0) {
      elements.push(
        <AgentActivityFeed
          key="live-feed"
          agentMessages={agentMessages}
          isRunning={isMultiAgentRunning}
        />
      );
    }

    return elements;
  };

  return (
    <div className="flex flex-col h-full p-4 overflow-hidden">
      {!hasMessages ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center text-center">
            <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-50 mb-4 shadow-sm">
              <Bot className="h-7 w-7 text-blue-600" />
            </div>
            <p className="text-neutral-900 font-semibold text-lg mb-2">
              Start a conversation to generate React components
            </p>
            <p className="text-neutral-500 text-sm max-w-sm mb-5">
              I can help you create buttons, forms, cards, and more
            </p>
            <WorkflowModeToggle mode={workflowMode} onChange={setWorkflowMode} />
          </div>
        </div>
      ) : (
        <ScrollArea ref={scrollAreaRef} className="flex-1 overflow-hidden">
          <div className="pr-4">
            <div className="flex flex-col h-full overflow-y-auto px-4 py-6">
              <div className="space-y-6 max-w-4xl mx-auto w-full">
                {renderInterleaved()}
              </div>
            </div>
          </div>
        </ScrollArea>
      )}
      <div className="mt-4 flex-shrink-0">
        <MessageInput
          input={input}
          handleInputChange={handleInputChange}
          handleSubmit={handleSubmit}
          isLoading={isLoading}
          hasMessages={hasMessages}
        />
      </div>
    </div>
  );
}
