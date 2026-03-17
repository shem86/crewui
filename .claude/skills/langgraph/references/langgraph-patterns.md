# LangGraph.js API Patterns Reference

## Table of Contents

- [StateGraph and Annotation](#stategraph-and-annotation)
- [StateSchema (v1)](#stateschema-v1)
- [Nodes and Edges](#nodes-and-edges)
- [Conditional Edges](#conditional-edges)
- [Command and Send](#command-and-send)
- [Tool Calling](#tool-calling)
- [Structured Output](#structured-output)
- [ToolNode and toolsCondition](#toolnode-and-toolscondition)
- [Functional API](#functional-api)
- [Streaming](#streaming)
- [Human-in-the-Loop](#human-in-the-loop)
- [Checkpointing and Memory](#checkpointing-and-memory)
- [Prebuilt Agents](#prebuilt-agents)

---

## StateGraph and Annotation

### Define State with Annotation.Root

```typescript
import { StateGraph, Annotation, MessagesAnnotation, START, END } from "@langchain/langgraph";

const MyState = Annotation.Root({
  ...MessagesAnnotation.spec,  // includes messagesStateReducer
  customField: Annotation<string>({ reducer: (_, b) => b, default: () => "" }),
  counter: Annotation<number>({ reducer: (a, b) => a + b, default: () => 0 }),
  items: Annotation<string[]>({ reducer: (a, b) => [...a, ...b], default: () => [] }),
});
```

**Reducer patterns:**

- `(_, b) => b` — last write wins (scalars)
- `(a, b) => a + b` — accumulate (numbers)
- `(a, b) => [...a, ...b]` — append (arrays)
- `messagesStateReducer` — ID-based merge (messages)

**Note:** Use `.spec` when spreading `MessagesAnnotation` into `Annotation.Root()`. With `StateSchema`, use `MessagesValue` instead.

**Critical:** If two nodes can update the same key, you MUST define a reducer. Without one, LangGraph throws `InvalidUpdateError`.

### Build and Compile

```typescript
const graph = new StateGraph(MyState)
  .addNode("nodeA", nodeAFn)
  .addNode("nodeB", nodeBFn)
  .addEdge(START, "nodeA")
  .addEdge("nodeA", "nodeB")
  .addEdge("nodeB", END)
  .compile({ recursionLimit: 50 });
```

`compile()` options: `{ checkpointer?, recursionLimit?, interruptBefore?, interruptAfter? }`

---

## StateSchema (v1)

`StateSchema` is the v1 recommended approach for defining state. It uses Zod (or any Standard Schema-compliant library) and provides dedicated value types.

```typescript
import { StateSchema, ReducedValue, MessagesValue } from "@langchain/langgraph";
import * as z from "zod";

const State = new StateSchema({
  messages: MessagesValue,
  currentStep: z.string(),
  count: z.number().default(0),
  history: new ReducedValue(
    z.array(z.string()).default(() => []),
    {
      inputSchema: z.string(),
      reducer: (current, next) => [...current, next],
    }
  ),
});

// Extract types for use in node functions
type MyState = typeof State.State;
type MyUpdate = typeof State.Update;

const graph = new StateGraph(State)
  .addNode("agent", (state: MyState) => ({ count: state.count + 1 }))
  .addEdge(START, "agent")
  .addEdge("agent", END)
  .compile();
```

**When to use which:**

- `Annotation.Root` — familiar API, well-tested, works everywhere. Use when extending `MessagesAnnotation.spec`.
- `StateSchema` — v1 recommended, cleaner Zod integration, supports `ReducedValue`, `MessagesValue`, `UntrackedValue`. Use for new projects.

### Runtime Context with StateSchema

Pass dependencies (model name, DB connection) via `contextSchema`:

```typescript
const ContextSchema = z.object({
  llm: z.union([z.literal("openai"), z.literal("anthropic")]),
});

const graph = new StateGraph(State, ContextSchema);
```

---

## Nodes and Edges

### Node Function Signature

```typescript
// Nodes receive state and optionally LangGraphRunnableConfig
import type { LangGraphRunnableConfig } from "@langchain/langgraph";

async function myNode(
  state: typeof MyState.State,
  config?: LangGraphRunnableConfig
): Promise<Partial<typeof MyState.State>> {
  // Return only the keys you want to update
  return { customField: "updated" };
}
```

**Rules:**

- Never mutate the incoming `state` object directly
- Return only changed keys (partial state updates)
- LangGraph applies reducers to merge the return value into state

### Edge Types

```typescript
// Static: always go from A to B
graph.addEdge("nodeA", "nodeB");

// From START
graph.addEdge(START, "nodeA");

// To END
graph.addEdge("nodeB", END);

// Conditional: routing function decides
graph.addConditionalEdges("nodeA", routeFn, { option1: "nodeB", option2: "nodeC" });
```

---

## Conditional Edges

```typescript
function routeAgent(state: typeof MyState.State): string {
  const lastMsg = state.messages[state.messages.length - 1];
  // Always type-check before accessing AI-specific properties
  if (lastMsg._getType() === "ai") {
    const aiMsg = lastMsg as AIMessage;
    if (aiMsg.tool_calls && aiMsg.tool_calls.length > 0) {
      return "tools";
    }
  }
  return END;
}

graph.addConditionalEdges("agent", routeAgent, {
  tools: "tool_node",
  [END]: END,
});
```

**Or use prebuilt `toolsCondition`:**

```typescript
import { toolsCondition } from "@langchain/langgraph/prebuilt";
graph.addConditionalEdges("agent", toolsCondition);
// Returns "tools" if tool_calls present, END otherwise
```

---

## Command and Send

### Command: Update State + Route

```typescript
import { Command } from "@langchain/langgraph";

function myNode(state) {
  return new Command({
    update: { counter: state.counter + 1 },
    goto: "next_node",  // or END
  });
}
```

When using `Command` in nodes, you must annotate the return type for TypeScript:

```typescript
async function myNode(state: typeof State.State): Promise<Command> {
  return new Command({ goto: "next_node", update: { field: "value" } });
}
```

### Send: Dynamic Fan-Out

```typescript
import { Send } from "@langchain/langgraph";

function fanOut(state: { subjects: string[] }) {
  return state.subjects.map(
    (subject) => new Send("process_item", { subject })
  );
}

graph.addConditionalEdges("collector", fanOut);
```

---

## Tool Calling

### Define with `tool()` Helper (Preferred)

```typescript
import { tool } from "@langchain/core/tools";
import { z } from "zod";

const myTool = tool(
  async ({ query }) => {
    return `Result for: ${query}`;  // Must return string
  },
  {
    name: "search",
    description: "Search for information",
    schema: z.object({ query: z.string().describe("Search query") }),
  }
);
```

### Bind Tools to Model

```typescript
const model = new ChatAnthropic({ model: "claude-haiku-4-5" });
const tools = [myTool];
const modelWithTools = model.bindTools(tools);
// bindTools returns a NEW model instance -- always use the return value
```

### Custom Streaming from Tools

Tools can emit custom data via `config.writer`:

```typescript
import type { LangGraphRunnableConfig } from "@langchain/langgraph";

const myTool = tool(
  async (input, config: LangGraphRunnableConfig) => {
    config.writer?.(`Processing: ${input.query}`);
    const result = await doWork(input.query);
    config.writer?.(`Done processing`);
    return result;
  },
  { name: "search", description: "Search", schema: z.object({ query: z.string() }) }
);
```

---

## Structured Output

Use `withStructuredOutput()` to get validated JSON from the LLM instead of free-form text. Useful for routing decisions, classification, and data extraction.

```typescript
import { z } from "zod";

const routeSchema = z.object({
  route: z.enum(["full", "engineer_qa", "engineer_only"]),
  reasoning: z.string().describe("Brief explanation of the routing decision"),
});

const structuredModel = model.withStructuredOutput(routeSchema);

// Returns typed object matching the schema, not a message
const result = await structuredModel.invoke([
  new SystemMessage("Analyze the request and choose a workflow route."),
  new HumanMessage(userRequest),
]);

console.log(result.route);      // "full" | "engineer_qa" | "engineer_only"
console.log(result.reasoning);  // string
```

**Key points:**

- Returns a plain object (not a message) — do NOT push into `state.messages`
- Works with any Zod schema
- Use in supervisor/router nodes to make structured routing decisions
- The model uses tool calling under the hood to produce structured output
- `withStructuredOutput()` returns a new runnable — use the return value, not the original model

### In a Graph Node

```typescript
async function supervisorNode(state: typeof State.State) {
  const supervisorModel = model.withStructuredOutput(routeSchema);
  const result = await supervisorModel.invoke([
    new SystemMessage("Choose the right workflow..."),
    ...state.messages.filter((m) => m._getType() === "human"),
  ]);
  return { route: result.route, currentAgent: "supervisor" };
}
```

---

## ToolNode and toolsCondition

### ToolNode

```typescript
import { ToolNode } from "@langchain/langgraph/prebuilt";

// Basic
const toolNode = new ToolNode(tools);

// With error handling (RECOMMENDED)
const toolNode = new ToolNode(tools, { handleToolErrors: true });

// With custom error message
const toolNode = new ToolNode(tools, {
  handleToolErrors: "Invalid tool call. Please check arguments and try again.",
});
```

`handleToolErrors: true` catches validation errors and sends them back to the LLM as a `ToolMessage`, allowing retry instead of crashing.

### toolsCondition

```typescript
import { toolsCondition } from "@langchain/langgraph/prebuilt";

// Auto-routes: "tools" if tool_calls present, END otherwise
graph.addConditionalEdges("agent", toolsCondition);
```

### Full Tool-Calling Loop Pattern

```typescript
const graph = new StateGraph(MessagesAnnotation)
  .addNode("agent", async (state) => {
    const response = await modelWithTools.invoke(state.messages);
    return { messages: [response] };
  })
  .addNode("tools", new ToolNode(tools, { handleToolErrors: true }))
  .addEdge(START, "agent")
  .addConditionalEdges("agent", toolsCondition)
  .addEdge("tools", "agent")  // loop back after tool execution
  .compile();
```

---

## Functional API

The Functional API lets you add LangGraph features (persistence, streaming, HITL) to imperative code without building a graph. It uses two primitives:

- **`entrypoint`** — defines a workflow entry function, manages execution flow and interrupts
- **`task`** — a discrete unit of work (API call, computation) that can be checkpointed

```typescript
import { entrypoint, task } from "@langchain/langgraph/func";
import { MemorySaver } from "@langchain/langgraph";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";

const checkpointer = new MemorySaver();

const processStep = task("processStep", async (input: string) => {
  return { processed: input.toLowerCase().trim() };
});

const classifyStep = task("classifyStep", async (text: string) => {
  return text.includes("urgent") ? "high" : "normal";
});

const workflow = entrypoint(
  { checkpointer, name: "myWorkflow" },
  async (userInput: string, config: LangGraphRunnableConfig) => {
    // Standard control flow — no graph structure needed
    const processed = await processStep(userInput);
    const priority = await classifyStep(processed.processed);

    // Custom streaming
    config.writer?.(`Priority: ${priority}`);

    if (priority === "high") {
      return await handleUrgent(processed);
    }
    return await handleNormal(processed);
  }
);

// Invoke with thread_id for checkpointing
const result = await workflow.invoke("Process this!", {
  configurable: { thread_id: "thread-1" },
});
```

### Streaming with Functional API

```typescript
for await (const [mode, chunk] of await workflow.stream(
  { x: 5 },
  { streamMode: ["custom", "updates"], configurable: { thread_id: "abc" } }
)) {
  console.log(`${mode}: ${JSON.stringify(chunk)}`);
}
```

### When to Use Functional API vs Graph API

| Aspect | Functional API | Graph API |
| --- | --- | --- |
| Control flow | Standard if/for/function calls | Explicit nodes and edges |
| State management | Scoped to function, no reducers needed | Shared state with reducers |
| Checkpointing | Task results saved to entrypoint checkpoint | New checkpoint per superstep |
| Visualization | Not supported (dynamic at runtime) | Graph can be visualized |
| Best for | Linear workflows, existing code integration | Complex routing, fan-out, multi-agent |

---

## Streaming

### Stream Modes

| Mode | Description | Use Case |
| ---- | ----------- | -------- |
| `"values"` | Full state after each superstep | Debugging, state inspection |
| `"updates"` | Delta from each node | Efficient state tracking |
| `"messages"` | LLM tokens + metadata | Chatbot UIs |
| `"custom"` | Arbitrary data via `config.writer?.()` | Progress updates, tool status |
| `"debug"` | Full debug traces | Development debugging |

### Basic Streaming

```typescript
// Stream updates
for await (const chunk of await graph.stream(
  { messages: [new HumanMessage("Hello")] },
  { streamMode: "updates" }
)) {
  console.log(chunk);
}

// Stream messages (token-by-token)
for await (const chunk of await graph.stream(
  { messages: [new HumanMessage("Hello")] },
  { streamMode: "messages" }
)) {
  console.log(chunk);
}
```

### Multiple Stream Modes (Combined)

Pass an array to get tuples of `[mode, chunk]`:

```typescript
for await (const [mode, chunk] of await graph.stream(
  { messages: [{ role: "user", content: "Hello" }] },
  { streamMode: ["updates", "messages", "custom"] }
)) {
  switch (mode) {
    case "updates":
      console.log("State update:", chunk);
      break;
    case "messages":
      // chunk is [token, metadata]
      console.log("Token:", chunk);
      break;
    case "custom":
      console.log("Custom:", chunk);
      break;
  }
}
```

### Custom Streaming with `config.writer`

Emit arbitrary data from inside nodes or tools:

```typescript
async function myNode(
  state: typeof State.State,
  config: LangGraphRunnableConfig
) {
  config.writer?.({ type: "status", message: "Processing..." });
  const result = await doWork(state);
  config.writer?.({ type: "status", message: "Done" });
  return { result };
}

// Must include "custom" in streamMode to receive writer data
for await (const [mode, chunk] of await graph.stream(input, {
  streamMode: ["updates", "custom"],
})) {
  // ...
}
```

### SSE to Client (Next.js API Route)

```typescript
export async function POST(req: Request) {
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  async function sendEvent(event: object) {
    try {
      await writer.write(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
    } catch {
      // Writer may be closed if client disconnected
    }
  }

  // Stream graph execution to client
  (async () => {
    try {
      for await (const [mode, chunk] of await graph.stream(
        { messages },
        { streamMode: ["updates", "custom"] }
      )) {
        await sendEvent({ mode, chunk });
      }
      await sendEvent({ type: "done" });
    } catch (error) {
      await sendEvent({ type: "error", message: String(error) });
    } finally {
      try { await writer.close(); } catch {}
    }
  })();

  return new Response(stream.readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
```

---

## Human-in-the-Loop

### interrupt() — Pause Graph Execution

The `interrupt()` function pauses execution and surfaces a value to the caller. Requires a checkpointer and thread ID.

```typescript
import { interrupt } from "@langchain/langgraph";
import { MemorySaver, Command } from "@langchain/langgraph";

async function approvalNode(state: typeof State.State) {
  // Pause execution — value is surfaced in __interrupt__ field
  const decision = interrupt({
    action: "delete_file",
    args: { path: state.filePath },
    description: "Please review this action",
  });

  // When resumed, Command({ resume: ... }) provides the value here
  if (decision === "approve") {
    return { approved: true };
  }
  return { approved: false };
}

const graph = new StateGraph(State)
  .addNode("approval", approvalNode)
  // ... other nodes
  .compile({ checkpointer: new MemorySaver() });

// First invocation — runs until interrupt
const config = { configurable: { thread_id: "thread-1" } };
const result = await graph.invoke({ messages: [...] }, config);
// result.__interrupt__ contains the interrupt payload

// Resume with decision
const resumed = await graph.invoke(
  new Command({ resume: "approve" }),
  config  // Same thread_id!
);
```

### humanInTheLoopMiddleware with createAgent (v1)

Higher-level API for tool approval — no manual `interrupt()` needed:

```typescript
import { createAgent, humanInTheLoopMiddleware } from "langchain";
import { MemorySaver, Command } from "@langchain/langgraph";

const agent = createAgent({
  model: "claude-haiku-4-5",
  tools: [searchTool, deleteTool],
  middleware: [
    humanInTheLoopMiddleware({
      interruptOn: {
        delete_tool: { allowAccept: true, allowEdit: true, allowRespond: true },
        search: false,  // auto-approve
      },
    }),
  ],
  checkpointer: new MemorySaver(),
});

const config = { configurable: { thread_id: "session-1" } };

// Runs until a delete_tool call triggers interrupt
let result = await agent.invoke(
  { messages: [{ role: "user", content: "Delete temp.txt" }] },
  config
);

// Resume with approval
result = await agent.invoke(
  new Command({ resume: { decisions: [{ type: "approve" }] } }),
  config
);
```

### Critical Rules for interrupt()

- **Requires checkpointer** — will fail without one
- **Same thread_id** to resume — different thread_id starts fresh
- **Payload must be JSON-serializable**
- **Not available in `@langchain/langgraph/web`** (browser environments)
- **Do NOT reorder interrupt calls** within a node — matching is index-based
- **Do NOT conditionally skip** interrupt calls — keep them deterministic across executions
- **Do NOT loop** interrupt calls with non-deterministic logic

### Static Breakpoints (Alternative)

For simpler pause-before/after patterns without custom logic:

```typescript
const graph = myGraph.compile({
  checkpointer: new MemorySaver(),
  interruptBefore: ["dangerous_node"],  // pause before this node
  interruptAfter: ["review_node"],      // pause after this node
});
```

---

## Checkpointing and Memory

### MemorySaver (Dev Only)

```typescript
import { MemorySaver } from "@langchain/langgraph";

const checkpointer = new MemorySaver();
const graph = myGraph.compile({ checkpointer });

// MUST pass thread_id when using a checkpointer
const result = await graph.invoke(
  { messages: [new HumanMessage("Hi")] },
  { configurable: { thread_id: "session-123" } }
);
```

### Production Checkpointers

```typescript
// SQLite (file-based persistence)
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
const checkpointer = SqliteSaver.fromConnString("./checkpoints.db");

// PostgreSQL (production-grade)
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
const checkpointer = PostgresSaver.fromConnString(process.env.DATABASE_URL);
```

### Long-Term Memory (Cross-Thread)

`InMemoryStore` provides cross-thread key-value storage:

```typescript
import { InMemoryStore } from "@langchain/langgraph";

const store = new InMemoryStore();
const app = graph.compile({ checkpointer, store });
```

### Inspect State

```typescript
const state = await graph.getState({ configurable: { thread_id: "session-123" } });
console.log(state.values.messages);
```

---

## Prebuilt Agents

### createAgent (v1 — Preferred)

From the `langchain` package. Returns a compiled graph. Supports middleware.

```typescript
import { createAgent } from "langchain";

const agent = createAgent({
  model: "claude-haiku-4-5",         // model name string (resolved automatically)
  tools: [myTool],
  systemPrompt: "You are a helpful assistant.",
  // Optional:
  middleware: [humanInTheLoopMiddleware(...)],
  checkpointer: new MemorySaver(),
});

const result = await agent.invoke({
  messages: [{ role: "user", content: "Hello" }],
});
```

**Key differences from `createReactAgent`:**

- Import: `"langchain"` (not `@langchain/langgraph/prebuilt`)
- `systemPrompt` replaces `prompt`
- `model` accepts string names (not just model instances)
- `middleware` array for HITL, summarization, PII redaction
- Streaming node name is `"model"` (not `"agent"`)

### createReactAgent (Legacy — Still Works)

Returns a **compiled** graph (do NOT call `.compile()` on it).

```typescript
import { createReactAgent } from "@langchain/langgraph/prebuilt";

const agent = createReactAgent({
  llm: model,                         // ChatAnthropic instance
  tools: [myTool],
  prompt: "You are a helpful assistant.",
  // name: "my_agent",                // required for multi-agent
  // checkpointSaver: new MemorySaver(),
});
```

### createSupervisor

Returns a **StateGraph** (MUST call `.compile()`).

```typescript
import { createSupervisor } from "@langchain/langgraph-supervisor";

const supervisorGraph = createSupervisor({
  agents: [agentA, agentB],  // createReactAgent instances with `name`
  llm: model,
  prompt: "Route tasks to the right agent.",
});

const app = supervisorGraph.compile();
```

### createSwarm

Returns a **StateGraph** (MUST call `.compile()`). See [multi-agent-architecture.md](multi-agent-architecture.md) Pattern 3 for full example.

### Return Type Summary

| Function | Returns | Need `.compile()`? | Package |
| -------- | ------- | ------------------ | ------- |
| `createAgent` | Compiled graph | No | `langchain` |
| `createReactAgent` | Compiled graph | No | `@langchain/langgraph/prebuilt` |
| `createSupervisor` | `StateGraph` | Yes | `@langchain/langgraph-supervisor` |
| `createSwarm` | `StateGraph` | Yes | `@langchain/langgraph-swarm` |
