# Example: Multi-Agent Pipeline (Custom StateGraph)

A fixed Design -> Engineer pipeline using explicit nodes and edges.

```typescript
import { StateGraph, Annotation, MessagesAnnotation, START, END } from "@langchain/langgraph";
import { ToolNode, toolsCondition } from "@langchain/langgraph/prebuilt";
import { ChatAnthropic } from "@langchain/anthropic";
import { SystemMessage } from "@langchain/core/messages";
import type { AIMessage } from "@langchain/core/messages";

const State = Annotation.Root({
  ...MessagesAnnotation.spec,
  currentPhase: Annotation<string>({ reducer: (_, b) => b, default: () => "design" }),
  iterationCount: Annotation<number>({ reducer: (_, b) => b, default: () => 0 }),
});

const model = new ChatAnthropic({ model: "claude-haiku-4-5" });

async function designNode(state: typeof State.State) {
  const response = await model.bindTools([designTool]).invoke([
    new SystemMessage("You are a UI designer. Create a component spec."),
    ...state.messages,
  ]);
  return { messages: [response], currentPhase: "design" };
}

async function engineerNode(state: typeof State.State) {
  const response = await model.bindTools([strReplaceTool]).invoke([
    new SystemMessage("You are a React engineer. Implement the spec."),
    ...state.messages,
  ]);
  return { messages: [response], currentPhase: "engineer" };
}

function routeDesign(state: typeof State.State) {
  const last = state.messages[state.messages.length - 1];
  if (last._getType() === "ai" && (last as AIMessage).tool_calls?.length) {
    return "design_tools";
  }
  return "engineer";
}

const graph = new StateGraph(State)
  .addNode("design", designNode)
  .addNode("design_tools", new ToolNode([designTool], { handleToolErrors: true }))
  .addNode("engineer", engineerNode)
  .addNode("engineer_tools", new ToolNode([strReplaceTool], { handleToolErrors: true }))
  .addEdge(START, "design")
  .addConditionalEdges("design", routeDesign, { design_tools: "design_tools", engineer: "engineer" })
  .addEdge("design_tools", "design")
  .addConditionalEdges("engineer", toolsCondition)
  .addEdge("engineer_tools", "engineer")
  .compile({ recursionLimit: 50 });
```

## Key Design Decisions

- Each agent gets its own system prompt prepended at invocation time
- Routing functions inspect the last message: tool call -> tools node, or advance to next agent
- `handleToolErrors: true` lets the LLM retry on invalid tool calls
- `iterationCount` state field can be used to cap revision loops
- Type-check messages with `._getType()` before casting to `AIMessage`
