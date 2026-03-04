import { ChatAnthropic } from "@langchain/anthropic";
import { StateGraph, START, END, Annotation, MessagesAnnotation } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { VirtualFileSystem } from "@/lib/file-system";
import { buildStrReplaceLangChainTool } from "@/lib/tools/str-replace";
import { buildFileManagerLangChainTool } from "@/lib/tools/file-manager";
import { buildDesignSpecTool, DESIGN_SYSTEM_PROMPT } from "./design-agent";
import { ENGINEER_SYSTEM_PROMPT } from "./engineer-agent";
import { buildReviewTool, QA_SYSTEM_PROMPT } from "./qa-agent";
import { AgentRole, type AgentStreamEvent } from "./types";

const MODEL = "claude-haiku-4-5";
const MAX_ITERATIONS = 2;

/** Extract human-readable text from Claude's response content (which may be a string or array of content blocks). */
function extractTextContent(content: string | Array<{ type: string; text?: string }>): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((block) => block.type === "text" && block.text)
      .map((block) => block.text!)
      .join("\n");
  }
  return "";
}

// Graph state definition
const MAX_RETRIES = 1; // Max times to nudge an agent that didn't use tools
const MAX_TOOL_LOOPS = 8; // Max tool-call round-trips per agent before forcing next phase
const WorkflowState = Annotation.Root({
  ...MessagesAnnotation.spec,
  designSpec: Annotation<string>({ reducer: (_, b) => b, default: () => "" }),
  reviewNotes: Annotation<string>({ reducer: (_, b) => b, default: () => "" }),
  currentAgent: Annotation<string>({ reducer: (_, b) => b, default: () => "design" }),
  iterationCount: Annotation<number>({ reducer: (_, b) => b, default: () => 0 }),
  designRetries: Annotation<number>({ reducer: (_, b) => b, default: () => 0 }),
  engineerRetries: Annotation<number>({ reducer: (_, b) => b, default: () => 0 }),
  qaRetries: Annotation<number>({ reducer: (_, b) => b, default: () => 0 }),
  designToolLoops: Annotation<number>({ reducer: (_, b) => b, default: () => 0 }),
  engineerToolLoops: Annotation<number>({ reducer: (_, b) => b, default: () => 0 }),
  qaToolLoops: Annotation<number>({ reducer: (_, b) => b, default: () => 0 }),
  engineerStartIdx: Annotation<number>({ reducer: (_, b) => b, default: () => -1 }),
  qaStartIdx: Annotation<number>({ reducer: (_, b) => b, default: () => -1 }),
});

export type WorkflowStateType = typeof WorkflowState.State;

export function buildMultiAgentGraph(
  fileSystem: VirtualFileSystem,
  onEvent?: (event: AgentStreamEvent) => void
) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is required for multi-agent mode");
  }

  const model = new ChatAnthropic({
    model: MODEL,
    anthropicApiKey: apiKey,
    maxTokens: 8192,
  });

  // Build tools per agent
  const designTool = buildDesignSpecTool();
  const strReplaceTool = buildStrReplaceLangChainTool(fileSystem);
  const fileManagerTool = buildFileManagerLangChainTool(fileSystem);
  const reviewTool = buildReviewTool();

  const designModel = model.bindTools([designTool, strReplaceTool]);
  const engineerModel = model.bindTools([strReplaceTool, fileManagerTool]);
  const qaModel = model.bindTools([reviewTool, strReplaceTool]);

  // Tool nodes for each agent (handleToolErrors sends errors back to LLM for retry)
  const designToolNode = new ToolNode([designTool, strReplaceTool], { handleToolErrors: true });
  const engineerToolNode = new ToolNode([strReplaceTool, fileManagerTool], {
    handleToolErrors: true,
  });
  const qaToolNode = new ToolNode([reviewTool, strReplaceTool], { handleToolErrors: true });

  // --- Design Agent Node ---
  async function designNode(state: WorkflowStateType) {
    onEvent?.({
      type: "agent_start",
      agent: AgentRole.DESIGN,
      content: "Planning component design...",
    });

    const systemMsg = new SystemMessage(DESIGN_SYSTEM_PROMPT);
    // Only pass user messages — design doesn't need to see other agents' messages
    const userMessages = state.messages.filter(m => m.getType() === "human");
    const response = await designModel.invoke([systemMsg, ...userMessages]);

    const textContent = extractTextContent(response.content as any);
    if (textContent) {
      onEvent?.({ type: "agent_message", agent: AgentRole.DESIGN, content: textContent });
    }

    // Emit tool call events so the UI can show file operations
    if (response.tool_calls && response.tool_calls.length > 0) {
      for (const tc of response.tool_calls) {
        onEvent?.({
          type: "agent_tool_call",
          agent: AgentRole.DESIGN,
          content: "",
          toolName: tc.name,
          toolArgs: tc.args as Record<string, any>,
        });
      }
    }

    return { messages: [response], currentAgent: "design", designToolLoops: state.designToolLoops + 1 };
  }

  // Route design agent: if tool calls pending, run tools; if no tools and retries left, nudge; otherwise move on
  function routeDesign(state: WorkflowStateType) {
    const lastMsg = state.messages[state.messages.length - 1];
    if (lastMsg.getType() === "ai" && (lastMsg as AIMessage).tool_calls?.length) {
      if (state.designToolLoops >= MAX_TOOL_LOOPS) return "engineer";
      return "design_tools";
    }
    if (state.designRetries < MAX_RETRIES) {
      return "design_nudge";
    }
    return "engineer";
  }

  // Nudge design agent to use tools
  function designNudgeNode(state: WorkflowStateType) {
    return {
      messages: [
        new HumanMessage(
          "You must use the create_design_spec tool now. Do not ask questions — produce the design spec immediately using the tool."
        ),
      ],
      designRetries: state.designRetries + 1,
    };
  }

  // After design tools, extract spec and go back to design or move forward
  async function designToolsPostProcess(state: WorkflowStateType) {
    // Check if the design spec tool was called by looking at recent tool messages
    const messages = state.messages;
    let designSpec = state.designSpec;

    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (
        msg.getType() === "tool" &&
        typeof msg.content === "string" &&
        msg.content.includes("Design spec created")
      ) {
        designSpec = msg.content;
        break;
      }
    }

    return { designSpec };
  }

  // --- Engineer Agent Node ---
  async function engineerNode(state: WorkflowStateType) {
    onEvent?.({
      type: "agent_start",
      agent: AgentRole.ENGINEER,
      content: "Writing component code...",
    });

    // Track where this agent's messages start
    const startIdx = state.engineerStartIdx >= 0 ? state.engineerStartIdx : state.messages.length;

    const contextMessage = state.designSpec
      ? `\n\nHere is the design specification to implement:\n${state.designSpec}`
      : "";

    const revisionContext = state.reviewNotes
      ? `\n\nThe QA team has reviewed the previous version and found issues. Here are the review notes:\n${state.reviewNotes}\n\nPlease fix the issues mentioned above.`
      : "";

    const systemMsg = new SystemMessage(ENGINEER_SYSTEM_PROMPT + contextMessage + revisionContext);
    // Only pass the original user message + this agent's own tool-loop messages
    const userMsg = state.messages.find(m => m.getType() === "human");
    const agentMessages = startIdx < state.messages.length
      ? state.messages.slice(startIdx)
      : [];
    const response = await engineerModel.invoke([systemMsg, ...(userMsg ? [userMsg] : []), ...agentMessages]);

    const textContent = extractTextContent(response.content as any);
    if (textContent) {
      onEvent?.({ type: "agent_message", agent: AgentRole.ENGINEER, content: textContent });
    }

    // Emit tool call events so the UI can show file operations
    if (response.tool_calls && response.tool_calls.length > 0) {
      for (const tc of response.tool_calls) {
        onEvent?.({
          type: "agent_tool_call",
          agent: AgentRole.ENGINEER,
          content: "",
          toolName: tc.name,
          toolArgs: tc.args as Record<string, any>,
        });
      }
    }

    return { messages: [response], currentAgent: "engineer", engineerStartIdx: startIdx, engineerToolLoops: state.engineerToolLoops + 1 };
  }

  // Route engineer: if tool calls, run tools; if no tools and retries left, nudge; otherwise move on
  function routeEngineer(state: WorkflowStateType) {
    const lastMsg = state.messages[state.messages.length - 1];
    if (lastMsg.getType() === "ai" && (lastMsg as AIMessage).tool_calls?.length) {
      if (state.engineerToolLoops >= MAX_TOOL_LOOPS) return "qa";
      return "engineer_tools";
    }
    if (state.engineerRetries < MAX_RETRIES) {
      return "engineer_nudge";
    }
    return "qa";
  }

  // Nudge engineer agent to use tools
  function engineerNudgeNode(state: WorkflowStateType) {
    return {
      messages: [
        new HumanMessage(
          "You must use the str_replace_editor tool now to create the component files. Do not ask questions — start by creating /App.jsx immediately using the tool."
        ),
      ],
      engineerRetries: state.engineerRetries + 1,
    };
  }

  // --- QA Agent Node ---
  async function qaNode(state: WorkflowStateType) {
    onEvent?.({ type: "agent_start", agent: AgentRole.QA, content: "Reviewing code quality..." });

    // Track where this agent's messages start
    const startIdx = state.qaStartIdx >= 0 ? state.qaStartIdx : state.messages.length;

    const systemMsg = new SystemMessage(QA_SYSTEM_PROMPT);
    // Only pass the original user message + this agent's own tool-loop messages
    const userMsg = state.messages.find(m => m.getType() === "human");
    const agentMessages = startIdx < state.messages.length
      ? state.messages.slice(startIdx)
      : [];
    const response = await qaModel.invoke([systemMsg, ...(userMsg ? [userMsg] : []), ...agentMessages]);

    const textContent = extractTextContent(response.content as any);
    if (textContent) {
      onEvent?.({ type: "agent_message", agent: AgentRole.QA, content: textContent });
    }

    // Emit tool call events so the UI can show file operations
    if (response.tool_calls && response.tool_calls.length > 0) {
      for (const tc of response.tool_calls) {
        onEvent?.({
          type: "agent_tool_call",
          agent: AgentRole.QA,
          content: "",
          toolName: tc.name,
          toolArgs: tc.args as Record<string, any>,
        });
      }
    }

    return { messages: [response], currentAgent: "qa", qaStartIdx: startIdx, qaToolLoops: state.qaToolLoops + 1 };
  }

  // Route QA: if tool calls, run tools; if no tools and retries left, nudge; otherwise decide
  function routeQA(state: WorkflowStateType) {
    const lastMsg = state.messages[state.messages.length - 1];
    if (lastMsg.getType() === "ai" && (lastMsg as AIMessage).tool_calls?.length) {
      if (state.qaToolLoops >= MAX_TOOL_LOOPS) return "qa_decision";
      return "qa_tools";
    }
    if (state.qaRetries < MAX_RETRIES) {
      return "qa_nudge";
    }
    return "qa_decision";
  }

  // Nudge QA agent to use tools
  function qaNudgeNode(state: WorkflowStateType) {
    return {
      messages: [
        new HumanMessage(
          "You must use the str_replace_editor tool to view the files, then use submit_review to deliver your verdict. Do not ask questions — start by viewing /App.jsx now."
        ),
      ],
      qaRetries: state.qaRetries + 1,
    };
  }

  // QA decision: check review results, decide if revision needed
  function qaDecisionNode(state: WorkflowStateType) {
    const messages = state.messages;
    let needsRevision = false;
    let reviewNotes = "";

    // Look through recent messages for review tool results
    for (let i = messages.length - 1; i >= Math.max(0, messages.length - 10); i--) {
      const msg = messages[i];
      if (msg.getType() === "tool" && typeof msg.content === "string") {
        if (msg.content.includes("NEEDS REVISION")) {
          needsRevision = true;
          reviewNotes = msg.content;
          break;
        } else if (msg.content.includes("APPROVED")) {
          needsRevision = false;
          reviewNotes = msg.content;
          break;
        }
      }
    }

    const iteration = state.iterationCount + 1;

    if (needsRevision && iteration < MAX_ITERATIONS) {
      onEvent?.({
        type: "agent_message",
        agent: AgentRole.QA,
        content: `Revision needed (iteration ${iteration}/${MAX_ITERATIONS}). Sending back to Engineer...`,
      });
      return { reviewNotes, iterationCount: iteration, currentAgent: "engineer", engineerStartIdx: -1, engineerToolLoops: 0, engineerRetries: 0 };
    }

    onEvent?.({
      type: "agent_done",
      agent: AgentRole.QA,
      content: needsRevision
        ? "Max iterations reached. Proceeding with current code."
        : "Code approved!",
    });
    return { reviewNotes, iterationCount: iteration, currentAgent: "done" };
  }

  // Route after QA decision
  function routeQADecision(state: WorkflowStateType) {
    if (state.currentAgent === "engineer") {
      return "engineer";
    }
    return END;
  }

  // --- Build the graph ---
  const graph = new StateGraph(WorkflowState)
    // Design phase
    .addNode("design", designNode)
    .addNode("design_tools", designToolNode)
    .addNode("design_post", designToolsPostProcess)
    // Engineer phase
    .addNode("engineer", engineerNode)
    .addNode("engineer_tools", engineerToolNode)
    // QA phase
    .addNode("qa", qaNode)
    .addNode("qa_tools", qaToolNode)
    .addNode("qa_decision", qaDecisionNode)
    // Nudge nodes (retry agents that didn't use tools)
    .addNode("design_nudge", designNudgeNode)
    .addNode("engineer_nudge", engineerNudgeNode)
    .addNode("qa_nudge", qaNudgeNode)
    // Edges
    .addEdge(START, "design")
    .addConditionalEdges("design", routeDesign, {
      design_tools: "design_tools",
      design_nudge: "design_nudge",
      engineer: "engineer",
    })
    .addEdge("design_tools", "design_post")
    .addEdge("design_post", "engineer")
    .addEdge("design_nudge", "design")
    .addConditionalEdges("engineer", routeEngineer, {
      engineer_tools: "engineer_tools",
      engineer_nudge: "engineer_nudge",
      qa: "qa",
    })
    .addEdge("engineer_tools", "engineer")
    .addEdge("engineer_nudge", "engineer")
    .addConditionalEdges("qa", routeQA, {
      qa_tools: "qa_tools",
      qa_nudge: "qa_nudge",
      qa_decision: "qa_decision",
    })
    .addEdge("qa_tools", "qa")
    .addEdge("qa_nudge", "qa")
    .addConditionalEdges("qa_decision", routeQADecision, {
      engineer: "engineer",
      [END]: END,
    });

  return graph.compile();
}
