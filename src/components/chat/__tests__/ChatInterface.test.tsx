import { test, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ChatInterface } from "../ChatInterface";
import { useChat } from "@/lib/contexts/chat-context";

// Mock the dependencies
vi.mock("@/lib/contexts/chat-context", () => ({
  useChat: vi.fn(),
}));

// Mock the ScrollArea component
vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children, className }: any) => (
    <div className={className} data-radix-scroll-area-viewport>
      {children}
    </div>
  ),
}));

// Mock MessageBubble (extracted from MessageList)
vi.mock("../MessageList", () => ({
  MessageBubble: ({ message }: any) => (
    <div data-testid="message-bubble" data-role={message.role} data-content={message.content}>
      {message.role}: {message.content}
    </div>
  ),
}));

// Mock the child components
vi.mock("../MessageInput", () => ({
  MessageInput: ({ input, handleInputChange, handleSubmit, isLoading }: any) => (
    <div data-testid="message-input">
      <input value={input} onChange={handleInputChange} data-testid="input" disabled={isLoading} />
      <button onClick={handleSubmit} disabled={isLoading} data-testid="submit">
        Submit
      </button>
    </div>
  ),
}));

vi.mock("../AgentActivityFeed", () => ({
  AgentActivityFeed: ({ isRunning }: any) => (
    <div data-testid="agent-activity-feed" data-running={isRunning} />
  ),
}));

const mockUseChat = {
  messages: [],
  displayMessages: [],
  input: "",
  handleInputChange: vi.fn(),
  handleSubmit: vi.fn(),
  status: "ready" as const,
  agentMessages: [],
  agentMessageHistory: [],
  isMultiAgentRunning: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  (useChat as any).mockReturnValue(mockUseChat);
});

afterEach(() => {
  cleanup();
});

test("renders chat interface with empty state and input", () => {
  render(<ChatInterface />);

  expect(screen.getByTestId("message-input")).toBeDefined();
  // Empty state text should appear
  expect(screen.getByText("Start a conversation to generate React components")).toBeDefined();
});

test("renders message bubbles for display messages", () => {
  const messages = [
    { id: "1", role: "user", content: "Hello" },
    { id: "2", role: "assistant", content: "Hi there!" },
  ];

  (useChat as any).mockReturnValue({
    ...mockUseChat,
    messages,
    displayMessages: messages,
  });

  render(<ChatInterface />);

  const bubbles = screen.getAllByTestId("message-bubble");
  expect(bubbles).toHaveLength(2);
  expect(bubbles[0].getAttribute("data-role")).toBe("user");
  expect(bubbles[1].getAttribute("data-role")).toBe("assistant");
});

test("passes correct props to MessageInput", () => {
  (useChat as any).mockReturnValue({
    ...mockUseChat,
    input: "Test input",
    status: "submitted",
  });

  render(<ChatInterface />);

  const input = screen.getByTestId("input");
  expect(input).toHaveProperty("value", "Test input");
  expect(input).toHaveProperty("disabled", true);
});

test("isLoading is true when status is submitted", () => {
  (useChat as any).mockReturnValue({
    ...mockUseChat,
    status: "submitted",
  });

  render(<ChatInterface />);

  const submitButton = screen.getByTestId("submit");
  expect(submitButton).toHaveProperty("disabled", true);
});

test("isLoading is true when status is streaming", () => {
  (useChat as any).mockReturnValue({
    ...mockUseChat,
    status: "streaming",
  });

  render(<ChatInterface />);

  const submitButton = screen.getByTestId("submit");
  expect(submitButton).toHaveProperty("disabled", true);
});

test("isLoading is false when status is ready", () => {
  (useChat as any).mockReturnValue({
    ...mockUseChat,
    status: "ready",
  });

  render(<ChatInterface />);

  const submitButton = screen.getByTestId("submit");
  expect(submitButton).toHaveProperty("disabled", false);
});

test("scrolls when messages change", () => {
  const { rerender } = render(<ChatInterface />);

  const newMessages = [
    { id: "1", role: "user", content: "Hello" },
    { id: "2", role: "assistant", content: "Hi there!" },
  ];
  (useChat as any).mockReturnValue({
    ...mockUseChat,
    messages: newMessages,
    displayMessages: newMessages,
  });

  rerender(<ChatInterface />);

  const bubbles = screen.getAllByTestId("message-bubble");
  expect(bubbles).toHaveLength(2);
});

test("renders past agent runs from agentMessageHistory as completed feeds", () => {
  const pastRun = [
    { id: "a1", agent: "design", type: "agent_start", content: "Starting", timestamp: 1000 },
    { id: "a2", agent: "engineer", type: "agent_message", content: "Code", timestamp: 2000 },
  ];

  const messages = [
    { id: "1", role: "user", content: "Hello" },
    { id: "2", role: "assistant", content: "Done" },
  ];
  (useChat as any).mockReturnValue({
    ...mockUseChat,
    messages,
    displayMessages: messages,
    agentMessageHistory: [pastRun],
    agentMessages: [],
  });

  render(<ChatInterface />);

  const feeds = screen.getAllByTestId("agent-activity-feed");
  expect(feeds).toHaveLength(1);
  expect(feeds[0].getAttribute("data-running")).toBe("false");
});

test("renders both history feeds and live feed together", () => {
  const pastRun = [
    { id: "a1", agent: "design", type: "agent_start", content: "Starting", timestamp: 1000 },
  ];
  const liveMessages = [
    { id: "a3", agent: "engineer", type: "agent_start", content: "Live", timestamp: 3000 },
  ];

  const messages = [
    { id: "1", role: "user", content: "Hello" },
    { id: "2", role: "assistant", content: "Done" },
    { id: "3", role: "user", content: "Another" },
  ];
  (useChat as any).mockReturnValue({
    ...mockUseChat,
    messages,
    displayMessages: messages,
    agentMessageHistory: [pastRun],
    agentMessages: liveMessages,
    isMultiAgentRunning: true,
  });

  render(<ChatInterface />);

  const feeds = screen.getAllByTestId("agent-activity-feed");
  // 1 history feed + 1 live feed = 2
  expect(feeds).toHaveLength(2);
  expect(feeds[0].getAttribute("data-running")).toBe("false");
  expect(feeds[1].getAttribute("data-running")).toBe("true");
});

test("renders with correct layout classes", () => {
  const messages = [{ id: "1", role: "user", content: "Hello" }];
  (useChat as any).mockReturnValue({
    ...mockUseChat,
    messages,
    displayMessages: messages,
  });

  const { container } = render(<ChatInterface />);

  const mainDiv = container.firstChild as HTMLElement;
  expect(mainDiv.className).toContain("flex");
  expect(mainDiv.className).toContain("flex-col");
  expect(mainDiv.className).toContain("h-full");
  expect(mainDiv.className).toContain("p-4");
  expect(mainDiv.className).toContain("overflow-hidden");

  const scrollArea = screen.getAllByTestId("message-bubble")[0].closest(".flex-1");
  expect(scrollArea?.className).toContain("overflow-hidden");

  const inputWrapper = screen.getByTestId("message-input").parentElement;
  expect(inputWrapper?.className).toContain("mt-4");
  expect(inputWrapper?.className).toContain("flex-shrink-0");
});

test("interleaves user messages with agent activity feeds in correct order", () => {
  const pastRun1 = [
    { id: "a1", agent: "design", type: "agent_start", content: "Run1", timestamp: 1000 },
  ];
  const pastRun2 = [
    { id: "a2", agent: "design", type: "agent_start", content: "Run2", timestamp: 2000 },
  ];

  const messages = [
    { id: "1", role: "user", content: "First request" },
    { id: "2", role: "assistant", content: "First response" },
    { id: "3", role: "user", content: "Second request" },
    { id: "4", role: "assistant", content: "Second response" },
  ];

  (useChat as any).mockReturnValue({
    ...mockUseChat,
    messages,
    displayMessages: messages,
    agentMessageHistory: [pastRun1, pastRun2],
    agentMessages: [],
  });

  render(<ChatInterface />);

  const bubbles = screen.getAllByTestId("message-bubble");
  const feeds = screen.getAllByTestId("agent-activity-feed");

  // 4 messages + 2 agent feeds
  expect(bubbles).toHaveLength(4);
  expect(feeds).toHaveLength(2);

  // Check DOM order: user1 → agent-feed1 → assistant1 → user2 → agent-feed2 → assistant2
  const allElements = screen.getAllByTestId("message-bubble")[0]
    .closest(".space-y-6")!
    .children;

  // Index 0: user bubble "First request"
  expect(allElements[0].getAttribute("data-testid")).toBe("message-bubble");
  expect(allElements[0].getAttribute("data-content")).toBe("First request");
  // Index 1: agent feed (history run 1)
  expect(allElements[1].getAttribute("data-testid")).toBe("agent-activity-feed");
  // Index 2: assistant bubble "First response"
  expect(allElements[2].getAttribute("data-testid")).toBe("message-bubble");
  expect(allElements[2].getAttribute("data-content")).toBe("First response");
  // Index 3: user bubble "Second request"
  expect(allElements[3].getAttribute("data-testid")).toBe("message-bubble");
  expect(allElements[3].getAttribute("data-content")).toBe("Second request");
  // Index 4: agent feed (history run 2)
  expect(allElements[4].getAttribute("data-testid")).toBe("agent-activity-feed");
  // Index 5: assistant bubble "Second response"
  expect(allElements[5].getAttribute("data-testid")).toBe("message-bubble");
  expect(allElements[5].getAttribute("data-content")).toBe("Second response");
});

test("skips agent feed pairing for error responses", () => {
  const pastRun = [
    { id: "a1", agent: "design", type: "agent_start", content: "Run1", timestamp: 1000 },
  ];

  const messages = [
    { id: "1", role: "user", content: "First request" },
    { id: "2", role: "assistant", content: "Error: Something failed" },
    { id: "3", role: "user", content: "Second request" },
    { id: "4", role: "assistant", content: "Second response" },
  ];

  (useChat as any).mockReturnValue({
    ...mockUseChat,
    messages,
    displayMessages: messages,
    agentMessageHistory: [pastRun],
    agentMessages: [],
  });

  render(<ChatInterface />);

  const feeds = screen.getAllByTestId("agent-activity-feed");
  // Only 1 agent feed — the error turn doesn't get one
  expect(feeds).toHaveLength(1);

  // The agent feed should appear after the second user message, not the first
  const allElements = screen.getAllByTestId("message-bubble")[0]
    .closest(".space-y-6")!
    .children;

  // Index 0: user "First request"
  expect(allElements[0].getAttribute("data-content")).toBe("First request");
  // Index 1: assistant "Error: Something failed" (no agent feed before it)
  expect(allElements[1].getAttribute("data-content")).toBe("Error: Something failed");
  // Index 2: user "Second request"
  expect(allElements[2].getAttribute("data-content")).toBe("Second request");
  // Index 3: agent feed (paired with successful turn)
  expect(allElements[3].getAttribute("data-testid")).toBe("agent-activity-feed");
  // Index 4: assistant "Second response"
  expect(allElements[4].getAttribute("data-content")).toBe("Second response");
});
