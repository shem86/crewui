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

// Mock the child components
vi.mock("../MessageList", () => ({
  MessageList: ({ messages, isLoading }: any) => (
    <div data-testid="message-list">
      {messages.length} messages, loading: {isLoading.toString()}
    </div>
  ),
}));

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

test("renders chat interface with message list and input", () => {
  render(<ChatInterface />);

  expect(screen.getByTestId("message-list")).toBeDefined();
  expect(screen.getByTestId("message-input")).toBeDefined();
});

test("passes correct props to MessageList", () => {
  const messages = [
    { id: "1", role: "user", content: "Hello" },
    { id: "2", role: "assistant", content: "Hi there!" },
  ];

  (useChat as any).mockReturnValue({
    ...mockUseChat,
    messages,
    status: "streaming",
  });

  render(<ChatInterface />);

  const messageList = screen.getByTestId("message-list");
  expect(messageList.textContent).toContain("2 messages");
  // MessageList always receives isLoading=false in multi-agent mode
  expect(messageList.textContent).toContain("loading: false");
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

  // Get initial scroll container
  const scrollContainer = screen
    .getByTestId("message-list")
    .closest("[data-radix-scroll-area-viewport]");
  expect(scrollContainer).toBeDefined();

  // Update messages - this should trigger the useEffect
  (useChat as any).mockReturnValue({
    ...mockUseChat,
    messages: [
      { id: "1", role: "user", content: "Hello" },
      { id: "2", role: "assistant", content: "Hi there!" },
    ],
  });

  rerender(<ChatInterface />);

  // Verify component re-rendered with new messages
  const messageList = screen.getByTestId("message-list");
  expect(messageList.textContent).toContain("2 messages");
});

test("renders past agent runs from agentMessageHistory as completed feeds", () => {
  const pastRun = [
    { id: "a1", agent: "design", type: "agent_start", content: "Starting", timestamp: 1000 },
    { id: "a2", agent: "engineer", type: "agent_message", content: "Code", timestamp: 2000 },
  ];

  (useChat as any).mockReturnValue({
    ...mockUseChat,
    messages: [{ id: "1", role: "user", content: "Hello" }],
    agentMessageHistory: [pastRun],
    agentMessages: [],
  });

  render(<ChatInterface />);

  const feeds = screen.getAllByTestId("agent-activity-feed");
  expect(feeds).toHaveLength(1);
  // History feeds should render as not running
  expect(feeds[0].getAttribute("data-running")).toBe("false");
});

test("renders both history feeds and live feed together", () => {
  const pastRun = [
    { id: "a1", agent: "design", type: "agent_start", content: "Starting", timestamp: 1000 },
  ];
  const liveMessages = [
    { id: "a3", agent: "engineer", type: "agent_start", content: "Live", timestamp: 3000 },
  ];

  (useChat as any).mockReturnValue({
    ...mockUseChat,
    messages: [{ id: "1", role: "user", content: "Hello" }],
    agentMessageHistory: [pastRun],
    agentMessages: liveMessages,
    isMultiAgentRunning: true,
  });

  render(<ChatInterface />);

  const feeds = screen.getAllByTestId("agent-activity-feed");
  // 1 history feed + 1 live feed = 2
  expect(feeds).toHaveLength(2);
  // First feed (history) is not running
  expect(feeds[0].getAttribute("data-running")).toBe("false");
  // Second feed (live) is running
  expect(feeds[1].getAttribute("data-running")).toBe("true");
});

test("renders with correct layout classes", () => {
  // Use messages so the ScrollArea is rendered instead of the empty state
  (useChat as any).mockReturnValue({
    ...mockUseChat,
    messages: [{ id: "1", role: "user", content: "Hello" }],
  });

  const { container } = render(<ChatInterface />);

  const mainDiv = container.firstChild as HTMLElement;
  expect(mainDiv.className).toContain("flex");
  expect(mainDiv.className).toContain("flex-col");
  expect(mainDiv.className).toContain("h-full");
  expect(mainDiv.className).toContain("p-4");
  expect(mainDiv.className).toContain("overflow-hidden");

  const scrollArea = screen.getByTestId("message-list").closest(".flex-1");
  expect(scrollArea?.className).toContain("overflow-hidden");

  const inputWrapper = screen.getByTestId("message-input").parentElement;
  expect(inputWrapper?.className).toContain("mt-4");
  expect(inputWrapper?.className).toContain("flex-shrink-0");
});
