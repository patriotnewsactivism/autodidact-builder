# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AutoDidact Builder is an autonomous coding agent application that uses AI (LLM) to plan and execute code changes on GitHub repositories. The app connects to GitHub repositories, analyzes codebases, and autonomously generates code modifications based on natural language instructions. It features real-time activity monitoring, metrics tracking, and optional auto-apply functionality to push changes directly to repositories.

**Tech Stack:** React 18, TypeScript, Vite, TailwindCSS, shadcn/ui, Supabase (auth + database + edge functions), React Query

## Development Commands

```bash
# Install dependencies
npm install

# Start development server (localhost:8080)
npm run dev

# Build for production
npm run build

# Build in development mode
npm run build:dev

# Lint code
npm run lint

# Preview production build
npm run preview

# Run Claude API script (for testing)
npm run claude
```

## Environment Setup

This project requires Supabase configuration and AI model endpoints. Create a `.env` file with:

- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_PUBLISHABLE_KEY` - Supabase anon/publishable key
- `SUPABASE_URL` - Server-side Supabase URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key for edge functions

For the autonomous agent to work, Supabase Edge Functions must be deployed with model endpoint configuration:
- `OLLAMA_ENDPOINT` or `MODEL_URL` - AI model API endpoint (e.g., local Ollama server)
- `OLLAMA_MODEL` or `MODEL_NAME` - Model name (defaults to "phi4")

Deploy the edge function: `supabase functions deploy process-task`

## Architecture

### Frontend Structure

**Entry Point:** `src/main.tsx` → `src/App.tsx`
- App wrapped in `AuthProvider` (Supabase auth context)
- Uses `BrowserRouter` for routing with lazy-loaded pages
- Global providers: `QueryClientProvider` (React Query), `ThemeProvider` (dark/light themes), `TooltipProvider`

**Routing:**
- `/` - Index/landing page (shows Auth component if not logged in)
- `/agent` - Protected route for AutonomousAgent interface
- `*` - NotFound page

**Key Pages:**
- `src/pages/Index.tsx` - Landing page
- `src/pages/AutonomousAgent.tsx` - Main agent interface wrapper
- `src/components/AutonomousAgent.tsx` - Core agent UI (~800+ lines, handles GitHub integration, task submission, real-time activity streaming)

### Authentication & Security

**Auth Flow:**
- `src/auth/AuthProvider.tsx` - React context providing `session`, `user`, `loading`, `error`
- `src/integrations/supabase/client.ts` - Singleton Supabase client with resilient storage fallback (localStorage → in-memory Map if unavailable)
- `src/auth/auth-errors.ts` - Centralized auth error state handling
- `src/components/Auth.tsx` - Sign-in/sign-up UI

**GitHub Token Storage:**
- `src/hooks/useSecureGithubToken.ts` - Encrypts GitHub PATs using AES-GCM with user's Supabase access token as encryption key
- Tokens stored in localStorage per user, encrypted at rest
- Automatically decrypts on session load; requires re-login if access token unavailable

### Autonomous Agent Core Logic

**Frontend (`src/components/AutonomousAgent.tsx`):**
- Manages GitHub connection state (repo, branch, PAT)
- Fetches repository metadata and file tree via GitHub REST API
- Custom `GitHubRequestError` class with retry logic for rate limits
- Builds "file snapshots" (path, content, sha, line count) for selected files
- Submits tasks to Supabase `tasks` table with metadata (repo info, files, auto-apply flag)
- Invokes Supabase Edge Function `process-task` via function invocation
- Real-time activity streaming via Supabase `activities` table subscription
- Displays code diffs using `src/components/CodeDiff.tsx` (uses `diff` library)

**Backend (`supabase/functions/process-task/index.ts`):**
1. Reads task from Supabase `tasks` table
2. Calls AI model (Ollama or compatible API) to generate a **plan** (JSON: `{summary, steps: [{id, title, objective, target_files}]}`)
3. Executes each step sequentially:
   - Fetches missing files from GitHub if needed
   - Calls model again for step execution: generates **changes** (JSON: `{summary, changes: [{path, action, description, language, new_content}]}`)
   - Updates in-memory file snapshots with new content
4. If `autoApply: true` and GitHub token provided:
   - Creates Git blobs for all changes
   - Builds tree, creates commit, updates branch ref via GitHub Git Data API
   - Commits with message: `AutoDidact: <instruction>`
5. Records metrics to `agent_metrics` table (lines_changed, tasks_completed, ai_decisions, knowledge_nodes)
6. Saves task outcome to `knowledge_nodes` for future context
7. Streams activity logs to `activities` table throughout process

**Database Schema (Supabase):**
- `tasks` - User instructions, status (pending/processing/completed/failed), metadata (repo, files, plan, changes)
- `activities` - Real-time log stream (type: ai/code/file/error/success/warning)
- `agent_metrics` - Per-user stats (lines_changed, tasks_completed, ai_decisions, knowledge_nodes, autonomy_level, learning_score)
- `knowledge_nodes` - Historical context (title, content, category, confidence_score, usage_count)

### Component Library (shadcn/ui)

Components located in `src/components/ui/` using Radix UI primitives + TailwindCSS. Configuration in `components.json`.

**Path Aliases (tsconfig.json):**
- `@/` → `src/`
- `@/components`, `@/lib`, `@/hooks`, etc.

**Styling:**
- TailwindCSS with `tailwindcss-animate` plugin
- Dark theme by default (`ThemeProvider` in App.tsx)
- CSS variables in `src/index.css` for theming

### Data Fetching & State

- React Query (`@tanstack/react-query`) with 3 retries, exponential backoff, 5min stale time
- `src/hooks/useAgentData.tsx` - Custom hook for fetching tasks, activities, metrics, knowledge nodes (uses React Query)
- Real-time subscriptions via Supabase channels in `AutonomousAgent.tsx` (activities table)

### GitHub Integration

**API Client (in `AutonomousAgent.tsx`):**
- Base URL: `https://api.github.com`
- Custom `githubRequest` function with auth headers, retry logic, rate limit handling
- Fetches: repo info, branches, file tree (recursive), file content (base64 decoded), commits
- Limits: Max 400 lines per blob for context, concurrent line counting (6 at a time)
- Error handling: Structured `GitHubRequestError` with codes (rate_limit, unauthorized, not_found, etc.)

**Auto-Apply Flow:**
- Enabled via checkbox in UI
- Backend creates commit directly via GitHub Git Data API (blobs → tree → commit → update ref)
- Requires GitHub PAT with `repo` and `contents: write` scopes

## Known Issues & Important Notes

1. **Vite Configuration:** The `lovable-tagger` plugin is explicitly disabled in `vite.config.ts` because it causes "Cannot access 'ht' before initialization" errors when extension files are missing.

2. **TypeScript Strictness:** The project uses relaxed TypeScript settings (`noImplicitAny: false`, `strictNullChecks: false`) for rapid prototyping. Consider tightening before production.

3. **Model Endpoint:** The `process-task` function defaults to Ollama-compatible chat API. Expects endpoint at `${MODEL_ENDPOINT}/api/chat` with format: `{model, messages, stream, format}`.

4. **GitHub Rate Limits:** Frontend implements exponential backoff with jitter for rate-limited requests. Max 4 retries per request.

5. **Supabase Functions:** Edge functions use Deno runtime. Import syntax: `https://esm.sh/@supabase/supabase-js@2.39.3`

6. **Secure Token Storage:** GitHub PATs are encrypted using Web Crypto API (AES-GCM). Decryption requires active Supabase session. Tokens are lost if user clears localStorage or session expires without proper token refresh.

## Code Patterns

**Error Boundaries:**
- Top-level `ErrorBoundary` in `App.tsx` with custom fallback UI
- `ErrorBoundary` component in `src/components/ErrorBoundary.tsx`

**Loading States:**
- Lazy-loaded routes show `AppLoading` component with spinner
- Protected routes show inline loading during auth check
- `LoadingSpinner` component: `src/components/ui/loading-spinner.tsx`

**Toasts:**
- Primary: `useToast` hook from `src/hooks/use-toast.ts` + `Toaster` component
- Secondary: Sonner toasts for non-blocking notifications

**Form Validation:**
- React Hook Form + Zod for validation (see `@hookform/resolvers` in dependencies)
- Form components in `src/components/ui/form.tsx`

## Development Workflow

1. **Adding New UI Components:**
   - Use shadcn/ui CLI if available, or manually add to `src/components/ui/`
   - Follow existing patterns: Radix primitives + `cn()` utility from `src/lib/utils.ts`

2. **Adding New Agent Features:**
   - Frontend: Extend `AutonomousAgent.tsx` with new UI/state
   - Backend: Modify `supabase/functions/process-task/index.ts` for new logic
   - Database: Add migrations in `supabase/migrations/`
   - Update Supabase types: `src/integrations/supabase/types.ts`

3. **Testing Changes:**
   - Start dev server: `npm run dev`
   - Ensure Supabase functions deployed: `supabase functions deploy process-task`
   - Test with a local Ollama instance or compatible model endpoint
   - Monitor browser console and Supabase function logs

4. **Linting:**
   - ESLint configured with TypeScript, React Hooks, React Refresh rules
   - Unused vars rule disabled for rapid iteration
   - Run: `npm run lint`

## File Organization

```
src/
├── auth/               # Auth context, error handling
├── components/
│   ├── ui/            # shadcn/ui components (40+ components)
│   ├── Auth.tsx       # Sign-in/sign-up UI
│   ├── AutonomousAgent.tsx  # Main agent interface
│   ├── CodeDiff.tsx   # Diff viewer
│   ├── ErrorBoundary.tsx
│   └── ...
├── hooks/             # Custom React hooks (useToast, useAgentData, useSecureGithubToken)
├── integrations/      # Third-party integrations (Supabase client, types)
├── lib/               # Utilities (cn() for class merging)
├── pages/             # Route components (Index, AutonomousAgent, NotFound)
├── App.tsx            # Root app component with routing
├── main.tsx           # Entry point
└── index.css          # Global styles + Tailwind directives

supabase/
├── functions/
│   ├── process-task/  # Main agent execution function
│   ├── bedrock-agent/ # Alternative AWS Bedrock implementation
│   └── ...
└── migrations/        # Database schema migrations
```

## Adding Migrations

When modifying database schema:
1. Create migration: `supabase migration new <name>`
2. Edit SQL in `supabase/migrations/`
3. Apply locally: `supabase db reset`
4. Update types: `supabase gen types typescript --local > src/integrations/supabase/types.ts`

## Deployment

This project is designed to be deployed on platforms supporting:
- **Frontend:** Vercel, Netlify, or any static hosting (build output: `dist/`)
- **Backend:** Supabase (auth, database, edge functions)
- **Model Inference:** Self-hosted Ollama or compatible API endpoint

Environment variables must be set in hosting platform settings (not just `.env`).
