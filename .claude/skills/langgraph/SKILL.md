---
name: langgraph
description: "Expert-level guidance for designing, building, and debugging multi-agent systems using LangChain.js and LangGraph.js. Covers architecture philosophy (supervisor, swarm, custom graph, functional API), StateGraph API, Annotation/StateSchema/reducers, streaming (SSE, multiple modes, custom writer), tool calling (ToolNode, bindTools, tool()), structured output (withStructuredOutput), checkpointing/memory, prebuilt agents (createAgent, createReactAgent, createSupervisor, createSwarm), human-in-the-loop (interrupt/Command), subgraphs, error handling, and production hardening. Use when the user mentions: multi-agent, multi agent, LangChain, LangGraph, agent orchestration, supervisor pattern, swarm agents, agent handoff, StateGraph, ToolNode, createReactAgent, createAgent, agent streaming, agent checkpointing, agent memory, agentic workflows, agent loops, functional API, entrypoint, interrupt, human-in-the-loop, withStructuredOutput, structured output, or any LangChain/LangGraph library usage."
---

# LangGraph Multi-Agent Expert

Deep expertise in multi-agent system design and implementation with LangChain.js / LangGraph.js.

## What's Current (LangGraph v1 + LangChain v1)

Key changes to be aware of:

- **`createAgent`** from `"langchain"` replaces `createReactAgent` from `@langchain/langgraph/prebuilt`. Uses `systemPrompt` (not `prompt`), supports middleware (HITL, summarization, PII redaction). **Requires the `langchain` package** (not included with `@langchain/langgraph`).
- **`StateSchema`** with Zod is the recommended way to define state (alternative to `Annotation.Root`). Uses `ReducedValue`, `MessagesValue`.
- **Functional API** (`entrypoint`, `task` from `@langchain/langgraph/func`) — imperative alternative to StateGraph for linear workflows.
- **`interrupt()`** function for human-in-the-loop — pause graph, resume with `Command({ resume: ... })`.
- **Custom streaming** via `config.writer?.()` with `streamMode: "custom"`. Multiple modes: `streamMode: ["messages", "updates", "custom"]`.
- Core Graph API (StateGraph, nodes, edges, `Annotation.Root`) is **unchanged and stable**.

## Decision Tree

Determine what the user needs:

**Quick start / single agent with tools?**
- Use `createAgent` from `"langchain"` (v1, requires `langchain` package) or `createReactAgent` from `@langchain/langgraph/prebuilt`
- Read [references/example-single-agent.md](references/example-single-agent.md)

**Designing a multi-agent architecture?**
- Choosing between supervisor, swarm, custom graph, or functional API
- Read [references/multi-agent-architecture.md](references/multi-agent-architecture.md)

**Fixed pipeline (Design -> Engineer -> QA)?**
- Use custom StateGraph with explicit edges
- Read [references/example-multi-agent-pipeline.md](references/example-multi-agent-pipeline.md)

**Dynamic routing (LLM decides which agent)?**
- Use `createSupervisor` from `@langchain/langgraph-supervisor`
- Read [references/example-supervisor.md](references/example-supervisor.md)

**Peer-to-peer agent handoff?**
- Use `createSwarm` / `createHandoffTool` from `@langchain/langgraph-swarm`
- Read [references/multi-agent-architecture.md](references/multi-agent-architecture.md) Pattern 3

**Linear multi-step workflow (no graph needed)?**
- Use Functional API: `entrypoint` + `task` from `@langchain/langgraph/func`
- Read [references/langgraph-patterns.md](references/langgraph-patterns.md) Functional API section or [references/multi-agent-architecture.md](references/multi-agent-architecture.md) Pattern 4

**Need structured LLM output (routing, classification, extraction)?**
- Use `model.withStructuredOutput(zodSchema)` — returns typed object, not a message
- Read [references/langgraph-patterns.md](references/langgraph-patterns.md) Structured Output section

**Need human approval before tool execution?**
- Use `humanInTheLoopMiddleware` with `createAgent`, or `interrupt()` in graph nodes
- Read [references/langgraph-patterns.md](references/langgraph-patterns.md) Human-in-the-Loop section

**Implementing streaming to a client?**
- Use `graph.stream()` with `streamMode` (not `streamEvents`)
- Combined modes: `streamMode: ["messages", "updates", "custom"]`
- Read [references/langgraph-patterns.md](references/langgraph-patterns.md) Streaming section

**Defining graph state?**
- `StateSchema` (v1, Zod-based) or `Annotation.Root` (stable) — both valid
- Read [references/langgraph-patterns.md](references/langgraph-patterns.md) StateGraph and Annotation / StateSchema sections

**Using subgraphs (graph-as-node)?**
- Invoke from a node function, or add compiled graph directly as a node
- Read [references/multi-agent-architecture.md](references/multi-agent-architecture.md) Subgraphs section

**Debugging or hitting errors?**
- Read [references/langgraph-pitfalls.md](references/langgraph-pitfalls.md) for common pitfalls and fixes

**Migrating from pre-v1 code?**
- `createReactAgent` -> `createAgent` (requires `langchain` package), `prompt` -> `systemPrompt`, `llm` -> `model` (accepts string), streaming node `"agent"` -> `"model"`
- `Annotation.Root` -> `StateSchema` (optional, both are stable)

**Building something end-to-end?**
- Read all three references as needed throughout the process

## Core Principles

1. **Keep LangChain imports server-only.** `@langchain/*` packages use `node:async_hooks` which breaks webpack/client bundling. Share types via a separate file with zero LangChain imports.

2. **Always define reducers for shared state keys.** Without a reducer, concurrent node updates cause `InvalidUpdateError`. Use `MessagesAnnotation` or `MessagesValue` for messages.

3. **Enable `handleToolErrors: true` on ToolNode.** Without it, invalid LLM tool calls crash the workflow instead of retrying.

4. **Type-check messages before casting.** Never blindly cast `state.messages[last]` as `AIMessage` -- check `._getType()` first.

5. **Set explicit recursion limits and iteration counters.** Prevent infinite loops in cyclic agent graphs.

6. **Wrap SSE writer calls in try-catch.** Clients can disconnect mid-stream.

7. **Use `tool()` over `DynamicStructuredTool`.** Simpler API, fewer TS type-depth issues. Tool functions must return strings.

8. **Interrupts require a checkpointer.** `interrupt()` won't work without persistence. Also not available in `@langchain/langgraph/web`.

## Quick Reference: Key Imports

```typescript
// Graph API
import { StateGraph, Annotation, MessagesAnnotation, START, END, Command, Send, MemorySaver } from "@langchain/langgraph";
// State (v1 alternative)
import { StateSchema, ReducedValue, MessagesValue } from "@langchain/langgraph";
// Functional API
import { entrypoint, task } from "@langchain/langgraph/func";
// Prebuilt (legacy)
import { createReactAgent, ToolNode, toolsCondition } from "@langchain/langgraph/prebuilt";
// Prebuilt (v1 — requires `langchain` package, not installed in this project)
import { createAgent, humanInTheLoopMiddleware } from "langchain";
// Multi-agent
import { createSupervisor } from "@langchain/langgraph-supervisor";
import { createSwarm, createHandoffTool } from "@langchain/langgraph-swarm";
// Interrupts
import { interrupt } from "@langchain/langgraph";
// Messages
import { HumanMessage, AIMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
// Tools
import { tool } from "@langchain/core/tools";
// Model
import { ChatAnthropic } from "@langchain/anthropic";
// Config type (for streaming writer)
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
```

## Examples

- **Single agent with tools** — [references/example-single-agent.md](references/example-single-agent.md)
- **Multi-agent pipeline (custom StateGraph)** — [references/example-multi-agent-pipeline.md](references/example-multi-agent-pipeline.md)
- **Supervisor with prebuilt** — [references/example-supervisor.md](references/example-supervisor.md)
