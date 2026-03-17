# Multi-Agent Architecture Guide

## Table of Contents

- [Philosophy](#philosophy)
- [When to Use Multi-Agent](#when-to-use-multi-agent)
- [Pattern Comparison](#pattern-comparison)
- [Pattern 1: Custom StateGraph](#pattern-1-custom-stategraph)
- [Pattern 2: Prebuilt Supervisor](#pattern-2-prebuilt-supervisor)
- [Pattern 3: Swarm with Handoffs](#pattern-3-swarm-with-handoffs)
- [Pattern 4: Functional API](#pattern-4-functional-api)
- [Pattern Selection Guide](#pattern-selection-guide)
- [Communication Patterns](#communication-patterns)
- [Subgraphs](#subgraphs)
- [Scaling Considerations](#scaling-considerations)

---

## Philosophy

Multi-agent systems decompose complex tasks into specialized roles. Each agent has a focused system prompt, a constrained tool set, and a clear responsibility boundary. Benefits:

- **Specialization**: Agents with narrow scope produce higher-quality output than a generalist
- **Modularity**: Swap, add, or remove agents without rewriting the whole system
- **Controllability**: Explicit routing logic makes behavior predictable and debuggable
- **Token efficiency**: Each agent only receives context relevant to its role

The fundamental trade-off: **more agents = more LLM calls = more latency and cost**. Only add agents when the task genuinely benefits from specialization.

## When to Use Multi-Agent

Use multi-agent when:
- The task has **distinct phases** requiring different expertise (design, implementation, review)
- Different **tool sets** are needed at different stages
- You need **quality gates** between phases (e.g., QA review before final output)
- The problem benefits from **iterative refinement** across roles

Use single-agent when:
- The task is straightforward and linear
- One tool set covers all needs
- Latency matters more than specialization
- The context window can handle the full task

## Pattern Comparison

| Aspect | Custom StateGraph | Supervisor | Swarm | Functional API |
|--------|------------------|------------|-------|----------------|
| Control | Full | Medium | Low | Full |
| Complexity | High | Low | Low | Low |
| Routing | Explicit edges | LLM decides | Agents decide | Code logic |
| Latency overhead | Minimal | 1 extra LLM call/route | No routing call | Minimal |
| Best for | Fixed workflows | Dynamic task delegation | Peer-to-peer collaboration | Linear multi-step |

## Pattern 1: Custom StateGraph

Build each agent as a node with its own model+tools, connected by explicit edges and routing functions.

**When to use**: Fixed, predictable workflow where you know the agent sequence at compile time.

```typescript
import { StateGraph, Annotation, MessagesAnnotation, START, END } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { ChatAnthropic } from "@langchain/anthropic";

const WorkflowState = Annotation.Root({
  ...MessagesAnnotation.spec,
  currentAgent: Annotation<string>({ reducer: (_, b) => b, default: () => "design" }),
  iterationCount: Annotation<number>({ reducer: (_, b) => b, default: () => 0 }),
});

const model = new ChatAnthropic({ model: "claude-haiku-4-5" });
const designModel = model.bindTools([designTool]);
const engineerModel = model.bindTools([strReplaceTool, fileManagerTool]);

// Each agent is a node function
async function designNode(state: typeof WorkflowState.State) {
  const response = await designModel.invoke([
    new SystemMessage("You are a design expert..."),
    ...state.messages,
  ]);
  return { messages: [response], currentAgent: "design" };
}

async function engineerNode(state: typeof WorkflowState.State) {
  const response = await engineerModel.invoke([
    new SystemMessage("You are an engineer..."),
    ...state.messages,
  ]);
  return { messages: [response], currentAgent: "engineer" };
}

// Routing function checks for tool calls
function routeDesign(state: typeof WorkflowState.State) {
  const lastMsg = state.messages[state.messages.length - 1];
  if (lastMsg._getType() === "ai" && (lastMsg as AIMessage).tool_calls?.length) {
    return "design_tools";
  }
  return "engineer"; // move to next phase
}

const graph = new StateGraph(WorkflowState)
  .addNode("design", designNode)
  .addNode("design_tools", new ToolNode([designTool], { handleToolErrors: true }))
  .addNode("engineer", engineerNode)
  .addNode("engineer_tools", new ToolNode([strReplaceTool, fileManagerTool], { handleToolErrors: true }))
  .addEdge(START, "design")
  .addConditionalEdges("design", routeDesign, {
    design_tools: "design_tools",
    engineer: "engineer",
  })
  .addEdge("design_tools", "design")
  .addConditionalEdges("engineer", routeEngineer, { ... })
  .addEdge("engineer_tools", "engineer")
  .compile({ recursionLimit: 80 });
```

**Key design decisions**:
- Each agent gets its own system prompt prepended at invocation time
- Routing functions inspect the last message to decide: tool call -> tools node, or advance to next agent
- Iteration counters prevent infinite revision loops
- `handleToolErrors: true` lets the LLM retry on invalid tool calls

## Pattern 2: Prebuilt Supervisor

An orchestrator LLM decides which agent to invoke next. Minimal code, maximum flexibility.

**When to use**: Dynamic task routing where the order of agents depends on the input.

See [example-supervisor.md](example-supervisor.md) for a full working example.

Key points:
- `createSupervisor` returns a **StateGraph** — MUST call `.compile()`
- Each agent needs a unique `name` for the supervisor to route to it
- Agents can be created with `createReactAgent` or `createAgent` (v1, requires `langchain` package)

**Trade-offs**:
- Extra LLM call per routing decision (supervisor must decide who goes next)
- Less predictable than explicit edges
- Cannot import in client components (server-only)

## Pattern 3: Swarm with Handoffs

Agents transfer control directly to each other using handoff tools. No central orchestrator.

**When to use**: Peer-to-peer collaboration where agents know when to delegate.

```typescript
import { createSwarm, createHandoffTool } from "@langchain/langgraph-swarm";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { MemorySaver } from "@langchain/langgraph";

const designer = createReactAgent({
  llm: model,
  tools: [designTool, createHandoffTool({ agentName: "engineer" })],
  name: "designer",
  prompt: "Design expert. Hand off to engineer when the spec is ready.",
});

const engineer = createReactAgent({
  llm: model,
  tools: [strReplaceTool, createHandoffTool({ agentName: "designer" })],
  name: "engineer",
  prompt: "React engineer. Hand off to designer if design clarification is needed.",
});

const swarm = createSwarm({
  agents: [designer, engineer],
  defaultActiveAgent: "designer",
});

// createSwarm returns a StateGraph -- must .compile()
const app = swarm.compile({ checkpointer: new MemorySaver() });
const result = await app.invoke(
  { messages: [{ role: "user", content: "Build a dashboard" }] },
  { configurable: { thread_id: "session-1" } }
);
```

**Trade-offs**:
- No routing LLM call overhead (agents decide directly)
- Less centralized control -- agents decide when to hand off
- Requires checkpointer for multi-turn conversations
- Can be unpredictable if agents disagree about handoff timing

## Pattern 4: Functional API

Use standard imperative code with `entrypoint` and `task` for multi-step workflows. No graph structure needed.

**When to use**: Linear pipelines, existing code integration, or when graph structure adds unnecessary complexity.

```typescript
import { entrypoint, task } from "@langchain/langgraph/func";
import { MemorySaver } from "@langchain/langgraph";
import { ChatAnthropic } from "@langchain/anthropic";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";

const model = new ChatAnthropic({ model: "claude-haiku-4-5" });
const checkpointer = new MemorySaver();

const designStep = task("design", async (userRequest: string) => {
  const designModel = model.bindTools([designTool]);
  const response = await designModel.invoke([
    new SystemMessage("You are a UI designer."),
    new HumanMessage(userRequest),
  ]);
  return response.content;
});

const implementStep = task("implement", async (designSpec: string) => {
  const engineerModel = model.bindTools([strReplaceTool]);
  const response = await engineerModel.invoke([
    new SystemMessage("You are a React engineer. Implement this design spec."),
    new HumanMessage(designSpec),
  ]);
  return response.content;
});

const pipeline = entrypoint(
  { checkpointer, name: "designPipeline" },
  async (userRequest: string, config: LangGraphRunnableConfig) => {
    config.writer?.({ phase: "design", status: "started" });
    const spec = await designStep(userRequest);

    config.writer?.({ phase: "implement", status: "started" });
    const implementation = await implementStep(spec);

    return { spec, implementation };
  }
);

const result = await pipeline.invoke("Build a login form", {
  configurable: { thread_id: "session-1" },
});
```

**Trade-offs**:
- Simplest code — standard if/for/function calls
- No graph visualization
- Task results are checkpointed automatically
- Less suitable for complex routing or fan-out patterns
- Custom streaming via `config.writer?.()`

## Pattern Selection Guide

```
Is the agent sequence fixed and predictable?
├── Yes
│   ├── Is it a simple linear pipeline?
│   │   ├── Yes → Functional API (Pattern 4)
│   │   └── No (has loops, fan-out) → Custom StateGraph (Pattern 1)
│   └── Does it need complex routing between phases?
│       ├── Yes → Custom StateGraph (Pattern 1)
│       └── No → Functional API (Pattern 4)
└── No (dynamic routing)
    ├── Should a central LLM decide routing?
    │   ├── Yes → Supervisor (Pattern 2)
    │   └── No
    │       └── Should agents decide when to hand off?
    │           ├── Yes → Swarm (Pattern 3)
    │           └── No → Supervisor (Pattern 2)
```

**Additional criteria:**
- Need graph visualization? -> StateGraph (Pattern 1 or 2)
- Need to wrap existing code with minimal changes? -> Functional API (Pattern 4)
- Need human-in-the-loop at tool level? -> Any pattern with `interrupt()` or `humanInTheLoopMiddleware`
- Latency-sensitive? -> Custom StateGraph (Pattern 1) or Functional API (Pattern 4) avoid extra LLM routing calls

## Communication Patterns

### Shared State (Default)
All agents read/write from the same state object. Messages accumulate across agents.

```typescript
// Each agent appends to the shared messages array
return { messages: [response], currentAgent: "engineer" };
```

### State Scoping
Agents can have dedicated state fields to avoid interference:

```typescript
const State = Annotation.Root({
  ...MessagesAnnotation.spec,
  designSpec: Annotation<string>({ reducer: (_, b) => b, default: () => "" }),
  engineerOutput: Annotation<string>({ reducer: (_, b) => b, default: () => "" }),
  qaFeedback: Annotation<string>({ reducer: (_, b) => b, default: () => "" }),
});
```

This prevents agents from accidentally overwriting each other's work and makes the data flow explicit.

### Command-Based Routing
Nodes can update state AND choose the next node in a single return:

```typescript
import { Command } from "@langchain/langgraph";

async function qaNode(state: typeof State.State): Promise<Command> {
  if (state.iterationCount >= MAX_ITERATIONS) {
    return new Command({ goto: END });
  }
  if (needsRevision) {
    return new Command({
      update: { iterationCount: state.iterationCount + 1, qaFeedback: feedback },
      goto: "engineer",
    });
  }
  return new Command({ goto: END });
}
```

When using `Command`, the node must be registered with the graph specifying valid destinations, or use `addConditionalEdges`.

### Message Filtering
Agents don't need to see all messages. Filter before passing to the LLM:

```typescript
async function engineerNode(state: typeof State.State) {
  // Only pass the latest design spec + user messages
  const relevantMessages = state.messages.filter(
    (m) => m._getType() === "human" || m.content.includes("[DESIGN SPEC]")
  );
  const response = await engineerModel.invoke([
    new SystemMessage("You are a React engineer."),
    ...relevantMessages,
  ]);
  return { messages: [response] };
}
```

## Subgraphs

A subgraph is a compiled graph used as a node in another graph. Useful for:
- Building multi-agent systems with isolated state
- Reusing a set of nodes across multiple graphs
- Team-based development (each team owns a subgraph)

### Add Compiled Graph as Node

When parent and child share state keys (e.g., both have `messages`), add the compiled graph directly:

```typescript
const childGraph = new StateGraph(MessagesAnnotation)
  .addNode("agent", agentFn)
  .addNode("tools", toolNode)
  .addEdge(START, "agent")
  .addConditionalEdges("agent", toolsCondition)
  .addEdge("tools", "agent")
  .compile();

const parentGraph = new StateGraph(MessagesAnnotation)
  .addNode("child", childGraph)  // compiled graph as node
  .addEdge(START, "child")
  .addEdge("child", END)
  .compile();
```

Shared state keys are automatically mapped between parent and child.

### Invoke Graph from a Node

When parent and child have different state schemas, invoke the subgraph from a node function and map state manually:

```typescript
const childGraph = new StateGraph(ChildState)
  .addNode("process", processFn)
  .addEdge(START, "process")
  .addEdge("process", END)
  .compile();

async function parentNode(state: typeof ParentState.State) {
  // Map parent state to child input
  const childResult = await childGraph.invoke({
    messages: state.messages,
    childSpecificField: state.someParentField,
  });

  // Map child output back to parent state
  return {
    messages: childResult.messages,
    processedOutput: childResult.result,
  };
}
```

### Subgraph with Interrupts

When a subgraph contains `interrupt()` calls, the interrupt surfaces through the parent graph. Use the same `thread_id` to resume. You can inspect the subgraph state during an interrupt:

```typescript
const parentState = await parentGraph.getState(config);
// Access subgraph state during interrupt
const subgraphState = parentState.tasks[0].state;
```

## Scaling Considerations

1. **Message array growth**: Each agent prepends SystemMessage + all messages. With many iterations, this hits token limits. Mitigate by summarizing or truncating earlier messages, or use `summarizationMiddleware` with `createAgent`.

2. **Latency**: Each agent = 1+ LLM calls. A Design->Engineer->QA loop with tool calls can take 30-60 seconds. Consider streaming to keep the user informed.

3. **Cost**: Multi-agent multiplies LLM calls. Use cheaper models (haiku) for routine agents, expensive models (sonnet/opus) only for complex reasoning.

4. **Error propagation**: One agent failure can cascade. Add error handling at node level and graph level. Send partial results to client even on failure.

5. **Checkpointing for long workflows**: Without a checkpointer, server crash = total loss. For workflows > 30 seconds, consider persistent checkpointing (SQLite or PostgreSQL).

6. **Token counting**: Track token usage per agent call. Trim the message array when approaching model limits. Consider dedicated summary nodes between agent phases.
