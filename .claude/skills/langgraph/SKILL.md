---
name: langgraph
description: "Project-specific LangGraph patterns, pitfalls, and decisions for CrewUI's multi-agent pipeline. Use when working on the agent graph, streaming, or debugging LangGraph issues. For general LangGraph API questions or examples, use the Exa skill (get-code-context-exa) instead."
---

# LangGraph — CrewUI Playbook

Project-specific decisions and pitfalls for CrewUI's LangGraph setup. For general LangGraph API syntax, examples, or docs, **use the Exa skill** (`get-code-context-exa`) with a query like `"LangGraph.js <topic> TypeScript"`.

## Architecture Decisions

1. **Custom StateGraph, not prebuilt Supervisor/Swarm.** We use explicit nodes and edges in `src/lib/agents/graph.ts` via `buildMultiAgentGraph(fs, onEvent, mode)`. This avoids the extra LLM routing call of `createSupervisor`.

2. **Two workflow modes** (set via UI toggle, locked once conversation starts):
   - **Pipeline** (default): hardcoded Design → Engineer → QA
   - **Supervisor**: LLM Supervisor node picks a route (`full`, `engineer_qa`, `engineer_only`)

3. **LangChain imports are server-only.** All `@langchain/*` imports live in API routes and `src/lib/agents/`. Shared types go in `src/lib/agents/types.ts` with **zero LangChain imports** to avoid `node:async_hooks` webpack errors.

4. **SSE streaming per-agent.** Agent events stream to the client via a custom writer. The `onEvent` callback emits `agent_start`, `agent_message`, `agent_done` events.

5. **Claude haiku-4.5 via `ChatAnthropic`.** Model configured in `src/lib/provider.ts` with mock fallback when `ANTHROPIC_API_KEY` is missing.

6. **`str_replace_editor` tool** for the Engineer agent. Modifies files in the VirtualFileSystem (`src/lib/file-system.ts`).

7. **Supervisor routing uses Zod schema** (`supervisorRouteSchema` in `src/lib/agents/supervisor-agent.ts`) with `withStructuredOutput`.

## Key Files

- `src/lib/agents/graph.ts` — StateGraph definition
- `src/lib/agents/types.ts` — Shared types (client-safe, no LangChain)
- `src/lib/agents/real-flow.ts` — Runs the real graph
- `src/lib/agents/mock-flow.ts` — Mock workflow for dev
- `src/lib/agents/supervisor-agent.ts` — Supervisor prompt + route schema
- `src/lib/agents/design-agent.ts`, `engineer-agent.ts`, `qa-agent.ts` — Agent prompts/tools

## Pitfalls We've Hit

### `node:async_hooks` breaks client components
All `@langchain/*` packages use `node:async_hooks`. Importing them in `"use client"` files breaks webpack. Keep all LangGraph code server-side. Share types via `agents/types.ts`.

### Missing reducers cause silent overwrites
Without a reducer, concurrent node updates cause `InvalidUpdateError`. Always use `MessagesAnnotation` or define explicit reducers for shared state keys.

### Anthropic content blocks aren't strings
Claude can return `content` as `string` OR `Array<{type, text}>`. Always extract text safely:
```typescript
function extractTextContent(content: string | Array<{ type: string; text?: string }>): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content))
    return content.filter(b => b.type === "text" && b.text).map(b => b.text!).join("\n");
  return "";
}
```

### Type-check messages before casting
Never blindly cast to `AIMessage`. Check `._getType() === "ai"` first.

### Infinite loops in cyclic graphs
Set `recursionLimit` on `.compile()` and add iteration counters to state. Check counters in routing functions.

### SSE writer can be closed
Clients disconnect mid-stream. Wrap all `writer.write()` calls in try-catch.

### `bindTools` returns a new instance
Use the return value, not the original model.

### `handleToolErrors: true` on ToolNode
Without it, invalid LLM tool calls crash the workflow. Always enable.

### Edge Runtime incompatible
Use `export const runtime = "nodejs"` in API routes. LangGraph needs `async_hooks`.

### Growing message array hits token limits
Each agent iteration adds SystemMessage + all accumulated messages. Summarize or truncate when approaching limits.

## When to Use Exa Instead

Use the Exa skill (`get-code-context-exa`) for:
- LangGraph API syntax you don't remember
- Examples of patterns we haven't used (swarm, functional API, HITL)
- Checking if a newer LangGraph version changed an API
- Debugging errors not covered above
- Any general "how do I do X in LangGraph" question

Query tip: always include `"LangGraph.js TypeScript"` in Exa queries to avoid Python results.
