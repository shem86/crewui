"use client";

import { useState } from "react";
import { Message } from "ai";
import { cn } from "@/lib/utils";
import { User, Bot, Loader2, AlertTriangle, ChevronDown } from "lucide-react";
import { MarkdownRenderer } from "./MarkdownRenderer";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";

function isErrorMessage(message: Message): boolean {
  return (
    message.role === "assistant" &&
    (message.id.startsWith("error-") || message.id.startsWith("multi-agent-error-"))
  );
}

function parseErrorContent(content: string): { summary: string; details: string } {
  // Try to extract inner JSON error message
  const jsonMatch = content.match(/"message"\s*:\s*"([^"]+)"/);
  if (jsonMatch) {
    return { summary: jsonMatch[1], details: content };
  }
  // Try to extract message after last colon-separated segment
  const colonParts = content.split(": ");
  if (colonParts.length > 2) {
    return { summary: colonParts.slice(-1)[0], details: content };
  }
  return { summary: content, details: content };
}

function ErrorBubble({ message }: { message: Message }) {
  const [open, setOpen] = useState(false);
  const { summary, details } = parseErrorContent(message.content);
  const showDetails = summary !== details;

  return (
    <div className="flex gap-4 justify-start">
      <div className="flex-shrink-0">
        <div className="w-9 h-9 rounded-lg bg-red-50 border border-red-200 shadow-sm flex items-center justify-center">
          <AlertTriangle className="h-4.5 w-4.5 text-red-500" />
        </div>
      </div>
      <div className="flex flex-col gap-2 max-w-[85%] min-w-0 items-start">
        <div className="rounded-xl px-4 py-3 bg-red-50 border border-red-200 shadow-sm text-sm">
          <p className="font-medium text-red-800">Something went wrong during generation</p>
          <p className="text-red-600 mt-1 break-all">{summary}</p>
          {showDetails && (
            <Collapsible open={open} onOpenChange={setOpen} className="mt-2">
              <CollapsibleTrigger className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 cursor-pointer">
                <ChevronDown
                  className={cn(
                    "w-3 h-3 transition-transform duration-200",
                    open && "rotate-180"
                  )}
                />
                {open ? "Hide details" : "Show details"}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <pre className="mt-2 p-2 bg-red-100/50 rounded-md text-xs text-red-700 whitespace-pre-wrap break-all overflow-x-auto max-h-48 overflow-y-auto">
                  {details}
                </pre>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      </div>
    </div>
  );
}

interface MessageBubbleProps {
  message: Message;
  isLoading?: boolean;
  isLast?: boolean;
}

export function MessageBubble({ message, isLoading, isLast }: MessageBubbleProps) {
  if (isErrorMessage(message)) {
    return <ErrorBubble message={message} />;
  }

  return (
    <div
      className={cn("flex gap-4", message.role === "user" ? "justify-end" : "justify-start")}
    >
      {message.role === "assistant" && (
        <div className="flex-shrink-0">
          <div className="w-9 h-9 rounded-lg bg-white border border-neutral-200 shadow-sm flex items-center justify-center">
            <Bot className="h-4.5 w-4.5 text-neutral-700" />
          </div>
        </div>
      )}

      <div
        className={cn(
          "flex flex-col gap-2 max-w-[85%]",
          message.role === "user" ? "items-end" : "items-start"
        )}
      >
        <div
          className={cn(
            "rounded-xl px-4 py-3",
            message.role === "user"
              ? "bg-blue-600 text-white shadow-sm"
              : "bg-white text-neutral-900 border border-neutral-200 shadow-sm"
          )}
        >
          <div className="text-sm">
            {message.parts ? (
              <>
                {message.parts.map((part, partIndex) => {
                  switch (part.type) {
                    case "text":
                      return message.role === "user" ? (
                        <span key={partIndex} className="whitespace-pre-wrap">
                          {part.text}
                        </span>
                      ) : (
                        <MarkdownRenderer
                          key={partIndex}
                          content={part.text}
                          className="prose-sm"
                        />
                      );
                    case "reasoning":
                      return (
                        <div
                          key={partIndex}
                          className="mt-3 p-3 bg-white/50 rounded-md border border-neutral-200"
                        >
                          <span className="text-xs font-medium text-neutral-600 block mb-1">
                            Reasoning
                          </span>
                          <span className="text-sm text-neutral-700">{part.reasoning}</span>
                        </div>
                      );
                    case "tool-invocation":
                      const tool = part.toolInvocation;
                      return (
                        <div
                          key={partIndex}
                          className="inline-flex items-center gap-2 mt-2 px-3 py-1.5 bg-neutral-50 rounded-lg text-xs font-mono border border-neutral-200"
                        >
                          {tool.state === "result" && tool.result ? (
                            <>
                              <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                              <span className="text-neutral-700">{tool.toolName}</span>
                            </>
                          ) : (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin text-blue-600" />
                              <span className="text-neutral-700">{tool.toolName}</span>
                            </>
                          )}
                        </div>
                      );
                    case "source":
                      return (
                        <div key={partIndex} className="mt-2 text-xs text-neutral-500">
                          Source: {JSON.stringify(part.source)}
                        </div>
                      );
                    case "step-start":
                      return partIndex > 0 ? (
                        <hr key={partIndex} className="my-3 border-neutral-200" />
                      ) : null;
                    default:
                      return null;
                  }
                })}
                {isLoading &&
                  message.role === "assistant" &&
                  isLast && (
                    <div className="flex items-center gap-2 mt-3 text-neutral-500">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span className="text-sm">Generating...</span>
                    </div>
                  )}
              </>
            ) : message.content ? (
              message.role === "user" ? (
                <span className="whitespace-pre-wrap">{message.content}</span>
              ) : (
                <MarkdownRenderer content={message.content} className="prose-sm" />
              )
            ) : isLoading &&
              message.role === "assistant" &&
              isLast ? (
              <div className="flex items-center gap-2 text-neutral-500">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span className="text-sm">Generating...</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {message.role === "user" && (
        <div className="flex-shrink-0">
          <div className="w-9 h-9 rounded-lg bg-blue-600 shadow-sm flex items-center justify-center">
            <User className="h-4.5 w-4.5 text-white" />
          </div>
        </div>
      )}
    </div>
  );
}

interface MessageListProps {
  messages: Message[];
  isLoading?: boolean;
}

export function MessageList({ messages, isLoading }: MessageListProps) {
  if (messages.length === 0) {
    return (
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
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto px-4 py-6">
      <div className="space-y-6 max-w-4xl mx-auto w-full">
        {messages.map((message, index) => (
          <MessageBubble
            key={message.id || message.content}
            message={message}
            isLoading={isLoading}
            isLast={index === messages.length - 1}
          />
        ))}
      </div>
    </div>
  );
}
