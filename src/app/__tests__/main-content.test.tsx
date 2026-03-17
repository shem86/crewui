import { test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MainContent } from "../main-content";

// Mock all the child components
vi.mock("@/components/chat/ChatInterface", () => ({
  ChatInterface: () => <div data-testid="chat-interface">Chat</div>,
}));

vi.mock("@/components/editor/FileTree", () => ({
  FileTree: () => <div data-testid="file-tree">File Tree</div>,
}));

vi.mock("@/components/editor/CodeEditor", () => ({
  CodeEditor: () => <div data-testid="code-editor">Code Editor</div>,
}));

vi.mock("@/components/preview/PreviewFrame", () => ({
  PreviewFrame: () => <div data-testid="preview-frame">Preview</div>,
}));

vi.mock("@/components/HeaderActions", () => ({
  HeaderActions: () => <div data-testid="header-actions">Actions</div>,
}));

// Mock the contexts
vi.mock("@/lib/contexts/file-system-context", () => ({
  FileSystemProvider: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@/lib/contexts/chat-context", () => ({
  ChatProvider: ({ children }: any) => <div>{children}</div>,
}));

// Mock the resizable components
vi.mock("@/components/ui/resizable", () => ({
  ResizablePanelGroup: ({ children, className }: any) => (
    <div className={className}>{children}</div>
  ),
  ResizablePanel: ({ children }: any) => <div>{children}</div>,
  ResizableHandle: () => <div>Handle</div>,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

test("renders with preview tab active by default", () => {
  render(<MainContent />);

  // Preview should be visible
  expect(screen.getByTestId("preview-frame")).toBeDefined();

  // Code editor and file tree should not be visible
  expect(screen.queryByTestId("code-editor")).toBeNull();
  expect(screen.queryByTestId("file-tree")).toBeNull();
});

test("clicking code tab shows code editor and file tree", async () => {
  const user = userEvent.setup();
  render(<MainContent />);

  // Find and click the "Code" tab
  const codeTab = screen.getByRole("tab", { name: /code/i });
  await user.click(codeTab);

  // Preview should not be visible
  expect(screen.queryByTestId("preview-frame")).toBeNull();

  // Code editor and file tree should be visible
  expect(screen.getByTestId("code-editor")).toBeDefined();
  expect(screen.getByTestId("file-tree")).toBeDefined();
});

test("clicking preview tab shows preview frame", async () => {
  const user = userEvent.setup();
  render(<MainContent />);

  // Click code tab first
  const codeTab = screen.getByRole("tab", { name: /code/i });
  await user.click(codeTab);

  // Verify code view is showing
  expect(screen.getByTestId("code-editor")).toBeDefined();

  // Click preview tab
  const previewTab = screen.getByRole("tab", { name: /preview/i });
  await user.click(previewTab);

  // Preview should be visible
  expect(screen.getByTestId("preview-frame")).toBeDefined();

  // Code editor and file tree should not be visible
  expect(screen.queryByTestId("code-editor")).toBeNull();
  expect(screen.queryByTestId("file-tree")).toBeNull();
});

test("toggling between tabs multiple times works correctly", async () => {
  const user = userEvent.setup();
  render(<MainContent />);

  const previewTab = screen.getByRole("tab", { name: /preview/i });
  const codeTab = screen.getByRole("tab", { name: /code/i });

  // Start on preview
  expect(screen.getByTestId("preview-frame")).toBeDefined();

  // Switch to code
  await user.click(codeTab);
  expect(screen.getByTestId("code-editor")).toBeDefined();
  expect(screen.queryByTestId("preview-frame")).toBeNull();

  // Switch back to preview
  await user.click(previewTab);
  expect(screen.getByTestId("preview-frame")).toBeDefined();
  expect(screen.queryByTestId("code-editor")).toBeNull();

  // Switch to code again
  await user.click(codeTab);
  expect(screen.getByTestId("code-editor")).toBeDefined();
  expect(screen.queryByTestId("preview-frame")).toBeNull();

  // Switch to preview again
  await user.click(previewTab);
  expect(screen.getByTestId("preview-frame")).toBeDefined();
  expect(screen.queryByTestId("code-editor")).toBeNull();
});

test("tabs have correct aria-selected attributes", async () => {
  const user = userEvent.setup();
  render(<MainContent />);

  const previewTab = screen.getByRole("tab", { name: /preview/i });
  const codeTab = screen.getByRole("tab", { name: /code/i });

  // Initially, preview should be selected
  expect(previewTab.getAttribute("data-state")).toBe("active");
  expect(codeTab.getAttribute("data-state")).toBe("inactive");

  // Click code tab
  await user.click(codeTab);
  expect(previewTab.getAttribute("data-state")).toBe("inactive");
  expect(codeTab.getAttribute("data-state")).toBe("active");

  // Click preview tab
  await user.click(previewTab);
  expect(previewTab.getAttribute("data-state")).toBe("active");
  expect(codeTab.getAttribute("data-state")).toBe("inactive");
});
