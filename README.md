# UIGen — Multi-Agent AI Component Generator

A full-stack React component generator powered by **multi-agent orchestration** using LangChain.js and LangGraph.js. Users describe components in natural language, and a team of specialized AI agents — Design, Engineer, and QA — collaborates to generate production-ready React code with live preview.

Built on a base project from a [Claude Code in Action course](https://anthropic.skilljar.com/claude-code-in-action), with significant additions including the multi-agent architecture, GitHub Actions CI/CD integration, and real-time agent activity streaming.

> **Update (Feb 4):** GitHub now supports [`agents in GitHub Actions`](https://company-news/pick-your-agent-use-claude-and-codex-on-agent-hq) via Copilot on Pro+ and enterprise accounts.
>
> **Update (Feb 11):** GitHub now supports [`writing agentic workflows in GitHub Actions`](https://github.com/github/gh-aw) using natural language.
>

---

## Key Features

- **Multi-agent workflow** — Design → Engineer → QA pipeline with automatic revision loop when code doesn't pass review
- **Real-time agent activity feed** — SSE-streamed events show each agent's progress, tool calls, and decisions as they happen
- **Live preview** — in-browser rendering via Babel transpilation with hot reload on file changes
- **Virtual file system** — all generated files exist in-memory, no disk writes
- **Monaco editor** — full code editor with syntax highlighting for reviewing/editing generated code
- **Project persistence** — SQLite storage for authenticated users, localStorage for anonymous sessions
- **GitHub Actions CI/CD** — Claude Code runs in CI on `@claude` mentions, with Playwright browser testing and artifact uploads
- **Custom Claude Code skills** — domain-specific skills for GitHub Actions, LangGraph, and code refactoring
- **Claude Code hooks** — automated guardrails: security validation before file reads, Prettier formatting and TypeScript type-checking after edits

---

## Multi-Agent Architecture

Instead of relying on a single LLM call, UIGen splits component generation across three specialized agents. Each agent has a focused system prompt and dedicated tools, which improves output quality through separation of concerns and built-in review.

### Agent Roles

| Agent | Codename | Responsibility |
| ----- | -------- | ------------- |
| **Design Agent** | DesignCo | Plans component structure, props, state management, color palettes, and layout |
| **Engineer Agent** | EngineerCo | Writes React + Tailwind code based on the design specification |
| **QA Agent** | QACo | Reviews code for bugs, accessibility issues, and best practices |
| **Orchestrator** | Supervisor | Routes tasks between agents and decides when output is ready |

### Workflow

```txt
User prompt → Design Agent → Engineer Agent → QA Agent
                                                  │
                                          ┌───────┴───────┐
                                          │               │
                                       APPROVED     NEEDS REVISION
                                          │               │
                                        Done      → Engineer Agent (retry)
                                                          │
                                                     QA Agent ...
                                                  (max 2 iterations)
```

### Technical Highlights

- **LangGraph.js `StateGraph`** — the workflow is a compiled state machine with conditional edges for tool-call routing, nudge/retry logic, and the QA revision loop (`src/lib/agents/graph.ts`)
- **SSE streaming** — agent events (`agent_start`, `agent_message`, `agent_tool_call`, `agent_done`) are streamed to the client in real time via the `/api/chat/multi-agent` endpoint
- **Iteration limits** — the QA → Engineer revision loop is capped at 2 iterations to prevent runaway loops
- **Cost-conscious defaults** — uses Claude Haiku 4.5 by default to keep API costs low (assuming an api-key is provided as env var); upgrading to a smarter model (e.g. Sonnet) will produce better results
- **Client/server type separation** — shared types live in `src/lib/agents/types.ts` (no LangChain imports) to avoid bundling Node.js-only dependencies into client code

---

## GitHub Actions Integration

Claude Code runs as a GitHub Action, triggered by `@claude` mentions in issues and PRs. It sets up the dev server, runs browser tests with Playwright MCP, and posts results back as comments.

**Key features:**

- Triggers on issue/PR comments containing `@claude`
- Integrates Playwright MCP for automated browser testing
- Captures and uploads test artifacts (screenshots) with download links
- Read-only mode: Claude tests and comments but doesn't push code

**Where to look:**

- Workflow: [`.github/workflows/claude.yml`](.github/workflows/claude.yml)
- Custom skill: [`.claude/skills/gh-actions/`](.claude/skills/gh-actions/)

---

## Claude Code Skills

Custom skills that give Claude domain-specific expertise when working in this project. Located in `.claude/skills/`.

| Skill | Description |
| ----- | ----------- |
| **[gh-actions](.claude/skills/gh-actions/)** | Configure, optimize, and troubleshoot GitHub Actions workflows using `claude-code-action`. Includes templates, MCP server setup guides, and common error patterns. |
| **[langgraph](.claude/skills/langgraph/)** | Expert-level guidance for building multi-agent systems with LangChain.js / LangGraph.js — covers architecture patterns (supervisor, swarm, custom graph, functional API), StateGraph API, streaming, tool calling, checkpointing, and production hardening. |
| **[refactor](.claude/skills/refactor/)** | Refactor TypeScript and JavaScript code using software engineering best practices. Includes a catalog of code smells, refactoring moves with before/after examples, and design pattern references. |

---

## Claude Code Hooks

Automated guardrails that run before or after Claude's tool calls. Configured in `.claude/settings.json`.

**PreToolUse** (runs before `Read` / `Grep`):

- **Security gate** — blocks Claude from reading `.env` or other sensitive files (`.claude/hooks/read_hook.js`)

**PostToolUse** (runs after `Write` / `Edit` / `MultiEdit`):

- **Prettier formatting** — auto-formats the modified file on save
- **TypeScript type-checker** — runs a full `tsc --noEmit` check and blocks if type errors are introduced (`.claude/hooks/tsc.js`)

---

## Tech Stack

| Category | Technologies |
| -------- | ------------ |
| **Frontend** | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS v4, Monaco Editor, shadcn/ui |
| **AI / LLM** | LangChain.js, LangGraph.js, Anthropic Claude (Haiku 4.5 by default — upgradeable to smarter models for better results), Vercel AI SDK |
| **Rendering** | @babel/standalone (in-browser transpilation), virtual file system |
| **Backend / Data** | Prisma + SQLite, JWT auth, Server-Sent Events |
| **Testing / DevOps** | Vitest, React Testing Library, GitHub Actions, Playwright MCP |

---

## Quick Start

```bash
npm run setup    # Install deps, generate Prisma client, run migrations
npm run dev      # Start dev server (http://localhost:3000)
npm run test     # Run test suite
```

**Environment variables** (`.env`):

- `ANTHROPIC_API_KEY` — Claude API key (optional; falls back to mock responses if missing)
- `JWT_SECRET` — secret for session tokens

---

## Attribution

Base project from a [Claude Code course](https://www.udemy.com/course/claude-code/). Significant personal additions:

- Multi-agent architecture with LangChain.js / LangGraph.js (design, engineer, QA agents + orchestrator)
- Real-time agent activity feed with SSE streaming
- GitHub Actions + Claude Code CI/CD integration with Playwright MCP
- Custom Claude Code skills (gh-actions, langgraph, refactor)
- Claude Code hooks (security gate, Prettier auto-format, TypeScript type-checker)
