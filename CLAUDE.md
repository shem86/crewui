# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

UIGen is an AI-powered React component generator with live preview and multi-agent orchestration. Users describe components in natural language, a team of specialized agents (Design, Engineer, QA) collaborates via LangGraph to generate the code, and a live preview renders it in real-time.

**Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS v4, SQLite + Prisma, Anthropic Claude (haiku-4.5), LangChain.js, LangGraph.js

## Commands

```bash
# Development
npm run dev              # Start dev server with Turbopack
npm run setup           # Full setup: install deps, generate Prisma, migrate DB

# Testing & Quality
npm run test            # Run Vitest test suite
npm run lint            # Run ESLint

# Production
npm run build           # Build for production
npm run start           # Start production server

# Database
npm run db:reset        # Force reset Prisma migrations
```

## Architecture

### Core Data Flow

1. User describes component → `/api/chat/multi-agent` route
2. LangGraph StateGraph orchestrates: Design agent → Engineer agent → QA agent (with revision loop if needed)
3. Agent events are SSE-streamed to the client and displayed per-agent in the chat UI
4. Engineer agent uses `str_replace_editor` to modify files in the VirtualFileSystem
5. FileSystemContext updates state → PreviewFrame renders component with Babel transpilation
6. Projects persist to SQLite (authenticated) or localStorage (anonymous)

### Key Directories

- `src/app/` - Next.js App Router pages and API routes
- `src/actions/` - Server actions for auth and project CRUD
- `src/components/` - React components organized by feature (chat/, editor/, preview/, auth/)
- `src/lib/` - Core utilities:
  - `file-system.ts` - VirtualFileSystem class (in-memory file representation)
  - `auth.ts` - JWT session management
  - `provider.ts` - AI provider (Claude or MockLanguageModel fallback)
  - `contexts/` - FileSystemContext and ChatContext
  - `tools/` - AI tools (str-replace, file-manager)
  - `prompts/generation.tsx` - System prompt for component generation
  - `agents/graph.ts` - LangGraph StateGraph (multi-agent workflow)
  - `agents/types.ts` - Shared agent types (client-safe, no LangChain imports)
  - `agents/design-agent.ts`, `engineer-agent.ts`, `qa-agent.ts` - Agent prompts and tools

### Database Schema (Prisma/SQLite)

- **User:** id, email, password (bcrypt), projects[]
- **Project:** id, name, userId (nullable), messages (JSON), data (JSON file system)

### UI Components

Built with shadcn/ui (New York style) and Radix primitives. Components are in `src/components/ui/`.

## Environment Variables

Required in `.env`:

- `ANTHROPIC_API_KEY` - Claude API key (falls back to mock if missing)
- `JWT_SECRET` - Secret for session tokens

## Testing

Tests use Vitest with jsdom environment and React Testing Library. Test files are colocated in `__tests__/` directories next to the code they test.
