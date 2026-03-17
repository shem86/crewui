# LangGraph.js Pitfalls and Debugging

## Table of Contents

- [Bundling and Environment](#bundling-and-environment) (incl. dynamic imports, edge runtime)
- [State Management](#state-management)
- [Streaming and SSE](#streaming-and-sse)
- [Tool Calling](#tool-calling) (incl. Anthropic content blocks)
- [Memory and Checkpointing](#memory-and-checkpointing)
- [Graph Structure](#graph-structure)
- [Human-in-the-Loop / Interrupts](#human-in-the-loop--interrupts)
- [TypeScript Issues](#typescript-issues)
- [Debugging Strategies](#debugging-strategies)
- [Error Handling Best Practices](#error-handling-best-practices)
- [Deployment](#deployment)

---

## Bundling and Environment

### `node:async_hooks` Breaks Client Components

**Symptom:** `UnhandledSchemeError: Reading from "node:async_hooks" is not handled by plugins`

**Cause:** All `@langchain/*` packages use `node:async_hooks`. Importing them in `"use client"` components breaks webpack.

**Fix:**
- Keep all LangChain/LangGraph imports in server-only files (API routes, server actions)
- Use dynamic imports (`await import(...)`) for lazy server-side loading
- Share types via a separate file with zero LangChain imports:
  ```typescript
  // src/lib/agents/types.ts -- NO LangChain imports
  export interface AgentStreamEvent {
    type: "agent_start" | "agent_message" | "agent_done";
    agent: string;
    content?: string;
  }
  ```

### `@langchain/langgraph/web` Limitations

For browser environments, `@langchain/langgraph/web` provides a subset of the API. Key limitations:
- **No `interrupt()`** — human-in-the-loop requires server-side execution
- **No Functional API** — `entrypoint` and `task` are not available
- **No file-based checkpointers** — only `MemorySaver` works in-browser

Use the web build only for client-side graph execution that doesn't need persistence or HITL.

### Dynamic Imports for Next.js

**Symptom:** LangGraph code accidentally bundled into client or loaded eagerly, slowing startup.

**Fix:** Use dynamic imports in server-side code that invokes the graph:
```typescript
// In your API route or server action
export async function runWorkflow(input: string) {
  const { buildMultiAgentGraph } = await import("@/lib/agents/graph");
  const graph = buildMultiAgentGraph(fileSystem, onEvent, mode);
  return graph.invoke({ messages: [new HumanMessage(input)] });
}
```
This ensures LangGraph modules only load when the workflow is actually invoked, not at module evaluation time.

### Edge Runtime Incompatible

**Symptom:** `fs` module or `async_hooks` errors in Vercel Edge Functions.

**Fix:** Use `export const runtime = "nodejs"` in API routes. Never use `"edge"` runtime with LangGraph.

### Granular Imports Required

Always use specific import paths:
```typescript
// Good
import { ChatAnthropic } from "@langchain/anthropic";
// Bad -- may pull Node.js-only modules into client bundles
import { ChatAnthropic } from "langchain/chat_models";
```

---

## State Management

### Missing Reducers Cause Silent Overwrites

**Symptom:** State updates from one node disappear after another node runs.

**Cause:** No reducer defined for a key that multiple nodes update.

**Fix:** Always define reducers for shared keys:
```typescript
// BAD
const State = Annotation.Root({ count: Annotation<number> });

// GOOD
const State = Annotation.Root({
  count: Annotation<number>({ reducer: (a, b) => a + b, default: () => 0 }),
});
```

With `StateSchema`, use `ReducedValue` explicitly:
```typescript
const State = new StateSchema({
  count: new ReducedValue(z.number().default(0), {
    inputSchema: z.number(),
    reducer: (a, b) => a + b,
  }),
});
```

### Duplicate Messages

**Symptom:** Messages array contains duplicates after multiple iterations.

**Cause:** Using a naive concat reducer `(a, b) => [...a, ...b]` instead of `messagesStateReducer`.

**Fix:** Use `MessagesAnnotation` (which includes ID-based deduplication) or `MessagesValue` with `StateSchema`. Ensure all messages have unique IDs.

### Checkpoint Serialization Strips Message IDs

**Symptom:** After loading from checkpoint, messages lose their IDs, causing duplicates on next update.

**Fix:** Verify checkpointer roundtrip serialization preserves all message fields. Test explicitly:
```typescript
const state1 = await graph.getState(config);
const ids1 = state1.values.messages.map(m => m.id);
// Invoke to trigger checkpoint save/load
await graph.invoke(new Command({ resume: "test" }), config);
const state2 = await graph.getState(config);
const ids2 = state2.values.messages.map(m => m.id);
// ids1 and ids2 should have no unexpected duplicates
```

### Direct State Mutation

**Symptom:** State changes are not reflected in downstream nodes.

**Cause:** Mutating `state` directly instead of returning new values.

**Fix:** Always return a new partial state object:
```typescript
// BAD
function myNode(state) { state.count += 1; return state; }

// GOOD
function myNode(state) { return { count: state.count + 1 }; }
```

---

## Streaming and SSE

### SSE Connection Limit (6 per domain)

**Symptom:** New SSE connections queue or fail when multiple tabs/streams are open.

**Cause:** HTTP/1.1 limits to 6 concurrent connections per domain.

**Fix:** Use HTTP/2 in production. Share a single SSE connection and multiplex by ID. Close connections promptly.

### Multiple Stream Modes Return Tuples

**Symptom:** Code expects single chunks but gets arrays when using combined stream modes.

**Cause:** When `streamMode` is an array, chunks are `[mode, data]` tuples instead of plain objects.

**Fix:** Handle the tuple format:
```typescript
// Single mode — chunks are plain objects
for await (const chunk of await graph.stream(input, { streamMode: "updates" })) { ... }

// Multiple modes — chunks are [mode, data] tuples
for await (const [mode, chunk] of await graph.stream(input, {
  streamMode: ["updates", "custom"]
})) { ... }
```

### `streamEvents` Inconsistencies with ChatAnthropic

**Symptom:** `on_chain_end` event returns malformed data (dict with `messages` key that isn't an array).

**Fix:** Use `graph.stream()` with `streamMode` parameter instead of `streamEvents`. Or add defensive parsing:
```typescript
if (Array.isArray(event.data?.messages)) { /* safe */ }
```

**Note:** This may be resolved in LangGraph v1. Test with your specific version.

### Writer Already Closed

**Symptom:** `TypeError: Cannot write to a closed WritableStream`

**Cause:** Client disconnected mid-stream.

**Fix:** Wrap all writes in try-catch, close writer in `finally`:
```typescript
try { await writer.write(data); } catch { /* client gone */ }
// ...
finally { try { await writer.close(); } catch {} }
```

### Backpressure / Memory Leaks

**Symptom:** Server memory grows during long workflows.

**Fix:** Set `highWaterMark` on `TransformStream`. Implement heartbeat to detect dead connections.

---

## Tool Calling

### LLM Hallucinates Tool Names or Invalid Args

**Symptom:** `ToolNode` throws validation error, crashing the workflow.

**Fix:** Enable error handling:
```typescript
const toolNode = new ToolNode(tools, { handleToolErrors: true });
```
This sends errors back to the LLM as `ToolMessage` so it can retry.

### Tool Functions Must Return Strings

**Symptom:** `ToolMessage` content is `[object Object]` or undefined.

**Fix:** Always return a string from tool functions. Use `JSON.stringify()` for complex objects.

### `bindTools` Returns a New Instance

**Symptom:** Model doesn't know about tools, never makes tool calls.

**Cause:** Using the original model instead of the return value of `bindTools`.

**Fix:**
```typescript
const modelWithTools = model.bindTools(tools);  // use modelWithTools, not model
```

### Anthropic Content Blocks (Not Plain Strings)

**Symptom:** `message.content` is `[object Object]` or processing fails when treating content as a string.

**Cause:** Claude (ChatAnthropic) can return `content` as either a `string` or an `Array<{type: string, text?: string}>` (content blocks). Code that assumes `string` breaks.

**Fix:** Always extract text safely:
```typescript
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

// Use in nodes before processing content
const text = extractTextContent(response.content);
```

This is especially important when passing content between agents or extracting results for downstream processing.

### Complex Zod Schemas Cause TS2589

**Symptom:** `Type instantiation is excessively deep and possibly infinite` with `DynamicStructuredTool`.

**Fix:** Split complex schemas into smaller sub-schemas, or use `tool()` instead:
```typescript
// Instead of one large schema:
const bigSchema = z.object({ a: z.object({ b: z.object({ ... }) }) });

// Split into parts:
const innerSchema = z.object({ b: z.string() });
const outerSchema = z.object({ a: innerSchema });
```

---

## Memory and Checkpointing

- **`MemorySaver` is not persistent** — state is lost on server restart. Use `SqliteSaver` or `PostgresSaver` for production. See [langgraph-patterns.md](langgraph-patterns.md) Checkpointing and Memory section for setup.
- **Missing `thread_id`** — always pass `{ configurable: { thread_id: "..." } }` when using a checkpointer.
- **Resume starts fresh** — use the same `thread_id` for both initial invocation and `Command({ resume: ... })`. Verify checkpointer was provided at compile time.

---

## Graph Structure

### Infinite Loops

**Symptom:** `GraphRecursionError` after hitting the recursion limit.

**Cause:** Cyclic edges without termination conditions.

**Fix:**
- Set explicit `recursionLimit` in `.compile()`
- Add iteration counters to state
- Check counters in routing functions:
```typescript
function routeQA(state) {
  if (state.iterationCount >= MAX_ITERATIONS) return END;
  if (needsRevision) return "engineer";
  return END;
}
```

### Unsafe AIMessage Casting

**Symptom:** `undefined` when accessing `.tool_calls` on a non-AI message.

**Cause:** Casting last message as `AIMessage` without type checking.

**Fix:**
```typescript
const lastMsg = state.messages[state.messages.length - 1];
if (lastMsg._getType() === "ai" && (lastMsg as AIMessage).tool_calls?.length) {
  return "tools";
}
```

### Growing Message Array Hits Token Limits

**Symptom:** LLM errors with "max tokens exceeded" after several agent iterations.

**Cause:** Each agent invocation prepends SystemMessage + all accumulated messages.

**Fix:**
- Summarize or truncate older messages before passing to LLM
- Pass only relevant recent messages + system prompt
- Track token count and trim when approaching limits
- Use `summarizationMiddleware` with `createAgent` (v1)

### Parallel Node State Conflicts

**Symptom:** Updates from parallel nodes (fan-out) are silently dropped.

**Cause:** No reducer defined for keys updated by parallel nodes.

**Fix:** Define merge reducers for all keys that receive parallel updates.

---

## Human-in-the-Loop / Interrupts

### Interrupt Ordering is Index-Based

**Symptom:** After resuming, wrong values are assigned to interrupt variables.

**Cause:** Multiple `interrupt()` calls in a single node are matched by index. If the order changes between executions, values are misaligned.

**Fix:** Keep interrupt calls deterministic:
```typescript
// GOOD — always the same two interrupts in the same order
function myNode(state) {
  const approval = interrupt("Approve action?");
  const comment = interrupt("Any comments?");
  return { approval, comment };
}

// BAD — conditional skipping changes the index
function myNode(state) {
  if (state.needsApproval) {
    const approval = interrupt("Approve?");  // index 0 sometimes, missing other times
  }
  const comment = interrupt("Comments?");    // index shifts
}
```

### Interrupt Not Available in Browser

**Symptom:** `interrupt is not defined` or similar error in client-side code.

**Fix:** `interrupt()` requires the full Node.js LangGraph runtime. It is not available in `@langchain/langgraph/web`. Run interrupt-based graphs server-side only.

### Resume Starts Fresh Instead of Continuing

**Symptom:** Calling `invoke(Command({ resume: ... }))` runs the graph from the beginning.

**Cause:** Using a different `thread_id` or missing checkpointer.

**Fix:** Ensure same `thread_id` and that the checkpointer was provided at compile time:
```typescript
const graph = myGraph.compile({ checkpointer: new MemorySaver() });
const config = { configurable: { thread_id: "same-id" } };

// Initial run
await graph.invoke(input, config);
// Resume — same config
await graph.invoke(new Command({ resume: value }), config);
```

---

## TypeScript Issues

### TS2589: Excessive Type Depth

**Symptom:** `Type instantiation is excessively deep and possibly infinite`

**Cause:** Complex Zod schemas with `DynamicStructuredTool`. Exacerbated by Zod >= 3.25.68.

**Fix:**
- Use `@ts-expect-error` to suppress
- Pin Zod to `<= 3.25.67`
- Break complex schemas into smaller sub-schemas
- Add explicit type annotations
- Prefer `tool()` over `DynamicStructuredTool`

### StateSchema Type Extraction

When `Annotation` types get complex, `StateSchema` provides cleaner type extraction:

```typescript
import { StateSchema, MessagesValue } from "@langchain/langgraph";
import * as z from "zod";

const State = new StateSchema({
  messages: MessagesValue,
  count: z.number().default(0),
});

// Clean type extraction
type MyState = typeof State.State;    // { messages: BaseMessage[], count: number }
type MyUpdate = typeof State.Update;  // { messages?: Messages, count?: number }
```

### Cannot Export Graphs with Zod State Schemas

**Symptom:** TypeScript errors when trying to export or type a compiled graph.

**Fix:** Pin Zod version. Use explicit type annotations on the compiled graph variable.

---

## Debugging Strategies

### LangSmith Tracing

Set environment variables:
```bash
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=your_key
```

All LangGraph invocations are automatically traced. View in LangSmith UI:
- Node input/output state
- LLM calls with full request/response
- Tool call arguments and results
- Timing per step

For non-LangChain code:
```typescript
import { traceable } from "langsmith/traceable";
const myFn = traceable(async (input) => { ... }, { name: "myFn" });
```

### Debug Streaming Mode

```typescript
for await (const event of graph.stream(input, { streamMode: "debug" })) {
  console.log(JSON.stringify(event, null, 2));
}
```

### Custom Event Callbacks

Pass callbacks when building the graph for real-time visibility:
```typescript
const graph = buildGraph(fileSystem, async (event) => {
  console.log(`[${event.type}] ${event.agent}: ${event.content}`);
});
```

### State Inspection

With a checkpointer:
```typescript
const state = await graph.getState({ configurable: { thread_id: "123" } });
console.log("Current state:", JSON.stringify(state.values, null, 2));

// For subgraph state during an interrupt:
const fullState = await graph.getState(config, { subgraphs: true });
console.log("Subgraph state:", fullState.tasks[0]?.state);
```

---

## Error Handling Best Practices

### Three-Level Strategy

**1. Node level:** Wrap each node in try-catch, save error to state:
```typescript
async function myNode(state) {
  try {
    const response = await model.invoke(state.messages);
    return { messages: [response] };
  } catch (error) {
    return { errorMessage: String(error), currentAgent: "error_handler" };
  }
}
```

**2. Graph level:** Route to error handlers based on state:
```typescript
graph.addConditionalEdges("myNode", (state) => {
  if (state.errorMessage) return "error_handler";
  return "next_node";
});
```

**3. Application level:** Wrap `graph.invoke()` in try-catch, send partial results on failure:
```typescript
try {
  const result = await graph.invoke(input);
  await sendEvent({ type: "done", result });
} catch (error) {
  // Still send any files/results created before the error
  await sendEvent({ type: "error", partialResults: getPartialResults() });
} finally {
  try { await writer.close(); } catch {}
}
```

### Retry Policies

```typescript
graph.addNode("myNode", myNodeFn, {
  retryPolicy: {
    maxAttempts: 3,        // Total attempts (initial + retries)
    backoffFactor: 2,      // Exponential backoff multiplier
    initialInterval: 500,  // ms before first retry
    maxInterval: 10000,    // Max ms between retries
    retryOn: (error) => {  // Custom retry condition
      return error.message.includes("rate limit") ||
             error.message.includes("timeout");
    },
  },
});
```

### Nudge Nodes for Stuck Agents

When an agent fails to use tools, add a "nudge" node that re-prompts:
```typescript
function designNudgeNode(state) {
  return {
    messages: [new HumanMessage("Please use the design tool to create the spec.")],
  };
}

graph.addConditionalEdges("design", (state) => {
  const lastMsg = state.messages[state.messages.length - 1];
  if (lastMsg._getType() === "ai" && !(lastMsg as AIMessage).tool_calls?.length) {
    return "design_nudge";
  }
  // ...
});
```

---

## Deployment

- **Edge Runtime is incompatible** — always use `export const runtime = "nodejs"` in Next.js API routes. LangGraph needs `async_hooks`.
- **Vercel timeouts** — Hobby plan has 10s limit; multi-agent workflows need Pro (60s) or streaming to keep connections alive. `MemorySaver` state is lost between serverless invocations.
- **LangSmith tracing** — set `LANGSMITH_TRACING=true` and `LANGSMITH_API_KEY` in `.env`. For serverless, call `await client.awaitPendingTraceBatches()` before the function exits, or set `LANGSMITH_TRACING_BACKGROUND=false`.
- **Long-running workflows** — use persistent checkpointers, stream intermediate results, and add `retryPolicy` on nodes for transient failures.
