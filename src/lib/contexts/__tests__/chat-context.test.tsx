import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { ChatProvider, useChat } from "../chat-context";
import { useFileSystem } from "../file-system-context";
import * as anonTracker from "@/lib/anon-work-tracker";
import { AgentRole } from "@/lib/agents/types";
import type { AgentMessage } from "@/lib/agents/types";

// Mock dependencies
vi.mock("../file-system-context", () => ({
  useFileSystem: vi.fn(),
}));

vi.mock("@/lib/anon-work-tracker", () => ({
  setHasAnonWork: vi.fn(),
}));

// Helper component to access chat context
function TestComponent() {
  const chat = useChat();
  return (
    <div>
      <div data-testid="messages">{chat.messages.length}</div>
      <textarea data-testid="input" value={chat.input} onChange={chat.handleInputChange} />
      <form data-testid="form" onSubmit={chat.handleSubmit}>
        <button type="submit">Submit</button>
      </form>
      <div data-testid="status">{chat.status}</div>
      <div data-testid="agent-history-runs">{chat.agentMessageHistory.length}</div>
      <div data-testid="agent-history-json">{JSON.stringify(chat.agentMessageHistory)}</div>
    </div>
  );
}

describe("ChatContext", () => {
  const mockFileSystem = {
    serialize: vi.fn(() => ({ "/test.js": { type: "file", content: "test" } })),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    (useFileSystem as any).mockReturnValue({
      fileSystem: mockFileSystem,
      handleToolCall: vi.fn(),
      refreshFileSystem: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
  });

  test("renders with default values", () => {
    render(
      <ChatProvider>
        <TestComponent />
      </ChatProvider>
    );

    expect(screen.getByTestId("messages").textContent).toBe("0");
    expect(screen.getByTestId("input").getAttribute("value")).toBe(null);
    expect(screen.getByTestId("status").textContent).toBe("ready");
  });

  test("initializes with initial messages", () => {
    const initialMessages = [
      { id: "1", role: "user" as const, content: "Hello" },
      { id: "2", role: "assistant" as const, content: "Hi there!" },
    ];

    render(
      <ChatProvider projectId="test-project" initialMessages={initialMessages}>
        <TestComponent />
      </ChatProvider>
    );

    expect(screen.getByTestId("messages").textContent).toBe("2");
  });

  test("tracks anonymous work when no project ID", async () => {
    const mockMessages = [{ id: "1", role: "user" as const, content: "Hello" }];

    render(
      <ChatProvider initialMessages={mockMessages}>
        <TestComponent />
      </ChatProvider>
    );

    await waitFor(() => {
      expect(anonTracker.setHasAnonWork).toHaveBeenCalledWith(
        mockMessages,
        mockFileSystem.serialize()
      );
    });
  });

  test("does not track anonymous work when project ID exists", async () => {
    const mockMessages = [{ id: "1", role: "user" as const, content: "Hello" }];

    render(
      <ChatProvider projectId="test-project" initialMessages={mockMessages}>
        <TestComponent />
      </ChatProvider>
    );

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(anonTracker.setHasAnonWork).not.toHaveBeenCalled();
  });

  test("initializes agentMessageHistory from initialAgentEventRuns", () => {
    const pastRun: AgentMessage[] = [
      {
        id: "a1",
        agent: AgentRole.DESIGN,
        type: "agent_start",
        content: "Starting design",
        timestamp: 1000,
      },
      {
        id: "a2",
        agent: AgentRole.ENGINEER,
        type: "agent_message",
        content: "Code written",
        timestamp: 2000,
      },
    ];

    render(
      <ChatProvider
        projectId="test-project"
        initialAgentEventRuns={[pastRun]}
      >
        <TestComponent />
      </ChatProvider>
    );

    expect(screen.getByTestId("agent-history-runs").textContent).toBe("1");
    const history = JSON.parse(screen.getByTestId("agent-history-json").textContent!);
    expect(history).toHaveLength(1);
    expect(history[0]).toHaveLength(2);
    expect(history[0][0].agent).toBe("design");
    expect(history[0][1].agent).toBe("engineer");
  });

  test("defaults agentMessageHistory to empty when no initialAgentEventRuns", () => {
    render(
      <ChatProvider>
        <TestComponent />
      </ChatProvider>
    );

    expect(screen.getByTestId("agent-history-runs").textContent).toBe("0");
  });
});
