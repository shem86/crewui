"use client";

import { useEffect, useRef } from "react";
import { MessageList } from "./MessageList";
import { AgentActivityFeed } from "./AgentActivityFeed";
import { MessageInput } from "./MessageInput";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useChat } from "@/lib/contexts/chat-context";

export function ChatInterface() {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    status,
    agentMessages,
    agentMessageHistory,
    isMultiAgentRunning,
  } = useChat();

  const isStreaming = status === "streaming";
  const isLoading = status === "submitted" || isStreaming;
  const hasMessages = messages.length > 0 || agentMessages.length > 0 || agentMessageHistory.length > 0;

  useEffect(() => {
    const scrollContainer = scrollAreaRef.current?.querySelector(
      "[data-radix-scroll-area-viewport]"
    );
    if (scrollContainer) {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    }
  }, [messages, agentMessages]);

  return (
    <div className="flex flex-col h-full p-4 overflow-hidden">
      {!hasMessages ? (
        <div className="flex-1 flex items-center justify-center">
          <MessageList messages={messages} isLoading={isStreaming} />
        </div>
      ) : (
        <ScrollArea ref={scrollAreaRef} className="flex-1 overflow-hidden">
          <div className="pr-4">
            <MessageList messages={messages} isLoading={false} />
            <>
              {agentMessageHistory.map((run, i) => (
                <AgentActivityFeed key={`history-${i}`} agentMessages={run} isRunning={false} />
              ))}
              {agentMessages.length > 0 && (
                <AgentActivityFeed agentMessages={agentMessages} isRunning={isMultiAgentRunning} />
              )}
            </>
          </div>
        </ScrollArea>
      )}
      <div className="mt-4 flex-shrink-0">
        <MessageInput
          input={input}
          handleInputChange={handleInputChange}
          handleSubmit={handleSubmit}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
