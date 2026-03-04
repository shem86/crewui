"use client";

import { useEffect, useRef } from "react";
import { MessageBubble } from "./MessageList";
import { AgentActivityFeed } from "./AgentActivityFeed";
import { MessageInput } from "./MessageInput";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useChat } from "@/lib/contexts/chat-context";
import { Bot } from "lucide-react";

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
            <p className="text-neutral-500 text-sm max-w-sm">
              I can help you create buttons, forms, cards, and more
            </p>
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
        />
      </div>
    </div>
  );
}
