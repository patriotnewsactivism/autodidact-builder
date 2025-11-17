# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AutoDidact Builder is a **fully autonomous coding agent application** that uses AI (Claude Sonnet 4) to continuously monitor, analyze, and improve GitHub repositories. The app features:

- **🔐 GitHub OAuth Integration** - One-click authentication, no manual token entry required
- **🎣 Webhook-Driven Autonomy** - Automatically responds to pushes, issues, and PRs in real-time
- **⏰ Scheduled Repository Scanning** - Periodic detection of TODOs, quality issues, and improvement opportunities
- **🤖 Autonomous Task Execution** - AI plans and executes code changes with optional auto-apply
- **📊 Real-Time Activity Monitoring** - Live streaming of agent actions and decisions
- **🧠 Learning & Knowledge Base** - Maintains historical context for continuous improvement

**Tech Stack:** React 18, TypeScript, Vite, TailwindCSS, shadcn/ui, Supabase (auth + database + edge functions), React Query, Anthropic Claude API

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

# Deploy Supabase functions
supabase functions deploy github-webhook
supabase functions deploy scheduled-scan
supabase functions deploy process-task
```

## Environment Setup

This project requires Supabase configuration and Anthropic API key. Create a `.env` file with:

**Frontend (.env):**
- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_PUBLISHABLE_KEY` - Supabase anon/publishable key

**Backend (Supabase Edge Functions - Set in dashboard):**
- `SUPABASE_URL` - Server-side Supabase URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key for edge functions
- `ANTHROPIC_API_KEY` - Anthropic API key for Claude Sonnet 4 (required!)

**GitHub OAuth Setup (Supabase Dashboard):**
1. Create GitHub OAuth App in GitHub → Settings → Developer settings
2. Configure callback URL: `https://your-project.supabase.co/auth/v1/callback`
3. Add Client ID and Secret to Supabase → Authentication → Providers → GitHub

See `AUTONOMOUS_SETUP.md` for detailed setup instructions.

## Architecture

### Frontend Structure

**Entry Point:** `src/main.tsx` → `src/App.tsx`
- App wrapped in `AuthProvider` (Supabase auth context)
- Uses `BrowserRouter` for routing with lazy-loaded pages
- Global providers: `QueryClientProvider` (React Query), `ThemeProvider` (dark/light themes), `TooltipProvider`

**Routing:**
- `/` - Index/landing page (shows Auth component if not logged in)
- `/agent` - Protected route for AutonomousAgent interface (manual task submission)
- `/repositories` - Protected route for autonomous repository management (NEW!)
- `*` - NotFound page

**Key Pages:**
- `src/pages/Index.tsx` - Landing page
- `src/pages/AutonomousAgent.tsx` - Main agent interface wrapper
- `src/pages/AutonomousRepositories.tsx` - Repository registration and autonomy configuration (NEW!)
- `src/components/AutonomousAgent.tsx` - Core agent UI (~800+ lines, handles GitHub integration, task submission, real-time activity streaming)
- `src/components/RepositoryManager.tsx` - Repository registration, settings, and monitoring controls (NEW!)

### Authentication & Security

**Auth Flow:**
- `src/auth/AuthProvider.tsx` - React context providing `session`, `user`, `loading`, `error`
- `src/integrations/supabase/client.ts` - Singleton Supabase client with resilient storage fallback (localStorage → in-memory Map if unavailable)
- `src/auth/auth-errors.ts` - Centralized auth error state handling
- `src/components/Auth.tsx` - Sign-in/sign-up UI with GitHub OAuth support

**GitHub Authentication (OAuth First!):**
- **✅ Primary Method: GitHub OAuth via Supabase Auth**
  - One-click "Sign in with GitHub" button in Auth UI
  - Scopes: `repo workflow read:user user:email`
  - OAuth token automatically stored in `github_installations` table
  - Token management via `src/hooks/useGithubOAuth.ts`
  - No manual token entry required!
- **Legacy Method: Manual PAT Entry (still supported)**
  - `src/hooks/useSecureGithubToken.ts` - Encrypts GitHub PATs using AES-GCM
  - Tokens stored in localStorage per user, encrypted at rest

### Autonomous Agent Core Logic

**Frontend (`src/components/AutonomousAgent.tsx`):**
- Manages GitHub connection state (repo, branch, token)
- Fetches repository metadata and file tree via GitHub REST API
- Custom `GitHubRequestError` class with retry logic for rate limits
- Builds "file snapshots" (path, content, sha, line count) for selected files
- Submits tasks to Supabase `tasks` table with metadata (repo info, files, auto-apply flag)
- Invokes Supabase Edge Function `process-task` via function invocation
- Real-time activity streaming via Supabase `activities` table subscription
- Displays code diffs using `src/components/CodeDiff.tsx` (uses `diff` library)

**Backend (`supabase/functions/process-task/index.ts`):**
1. Reads task from Supabase `tasks` table
2. Calls Claude Sonnet 4 API to generate a **plan** (JSON: `{summary, steps: [{id, title, objective, target_files}]}`)
3. Executes each step sequentially:
   - Fetches missing files from GitHub if needed
   - Calls Claude again for step execution: generates **changes** (JSON: `{summary, changes: [{path, action, description, language, new_content}]}`)
   - Updates in-memory file snapshots with new content
4. If `autoApply: true` and GitHub token provided:
   - Creates Git blobs for all changes
   - Builds tree, creates commit, updates branch ref via GitHub Git Data API
   - Commits with message: `AutoDidact: <instruction>`
5. Records metrics to `agent_metrics` table (lines_changed, tasks_completed, ai_decisions, knowledge_nodes)
6. Saves task outcome to `knowledge_nodes` for future context
7. Streams activity logs to `activities` table throughout process

**NEW: Webhook Handler (`supabase/functions/github-webhook/index.ts`):**
- Receives GitHub webhook events (push, issues, pull_request)
- Verifies webhook signature using HMAC-SHA256
- Stores event in `webhook_events` table
- Checks repository settings (auto_fix_todos, auto_respond_to_issues, etc.)
- Automatically creates tasks for configured autonomous actions
- Invokes `process-task` to execute autonomous improvements
- **Flow:**
  ```
  GitHub Event → Webhook → Validate → Check Settings → Create Task → Execute → Auto-apply (optional)
  ```

**NEW: Scheduled Scanner (`supabase/functions/scheduled-scan/index.ts`):**
- Scans registered repositories on schedule (hourly/daily/weekly)
- Detects TODO/FIXME comments in code files
- Checks for open GitHub issues
- Identifies code quality problems
- Creates autonomous tasks for findings
- Invokes `process-task` for automatic resolution
- **Flow:**
  ```
  Cron Trigger → Fetch Repos → Scan Files → Detect Issues → Create Tasks → Execute → Auto-apply (optional)
  ```

**Database Schema (Supabase):**

**Core Tables:**
- `tasks` - User instructions, status (pending/processing/completed/failed), metadata (repo, files, plan, changes)
- `activities` - Real-time log stream (type: ai/code/file/error/success/warning)
- `agent_metrics` - Per-user stats (lines_changed, tasks_completed, ai_decisions, knowledge_nodes, autonomy_level, learning_score)
- `knowledge_nodes` - Historical context (title, content, category, confidence_score, usage_count)

**NEW: Autonomous Building Tables:**
- `github_installations` - OAuth tokens and GitHub user info (user_id, github_user_id, access_token, scope)
- `registered_repositories` - Repositories configured for autonomous monitoring (repo_owner, repo_name, auto_apply_enabled, auto_fix_todos, monitoring_enabled, scan_frequency)
- `webhook_events` - Incoming GitHub webhook events (event_type, action, payload, processed, task_id)
- `autonomous_scans` - Scheduled scan results (scan_type, todos_found, quality_issues_found, tasks_created)
- `autonomous_improvements` - Track autonomous changes (improvement_type, trigger_source, commit_sha, status)

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
- `src/hooks/useGithubOAuth.ts` - Manages GitHub OAuth installation state (NEW!)
- Real-time subscriptions via Supabase channels in `AutonomousAgent.tsx` (activities table)

### GitHub Integration

**API Client (in `AutonomousAgent.tsx`):**
- Base URL: `https://api.github.com`
- Custom `githubRequest` function with auth headers, retry logic, rate limit handling
- Fetches: repo info, branches, file tree (recursive), file content (base64 decoded), commits
- Limits: Max 400 lines per blob for context, concurrent line counting (6 at a time)
- Error handling: Structured `GitHubRequestError` with codes (rate_limit, unauthorized, not_found, etc.)

**Auto-Apply Flow:**
- Enabled via checkbox in UI (or per-repository setting for autonomous mode)
- Backend creates commit directly via GitHub Git Data API (blobs → tree → commit → update ref)
- Requires GitHub OAuth token or PAT with `repo` and `contents: write` scopes

## Autonomous Building Features (NEW!)

### 1. GitHub OAuth Flow

**How it works:**
1. User clicks "Sign in with GitHub" in Auth component
2. Supabase redirects to GitHub OAuth authorization
3. User grants permissions (repo, workflow, read:user, user:email)
4. GitHub redirects back with OAuth token
5. Supabase session includes `provider_token` (GitHub OAuth token)
6. `useGithubOAuth` hook automatically stores token in `github_installations` table
7. Token is used for all GitHub API operations

**Key Files:**
- `src/components/Auth.tsx:100-122` - OAuth sign-in implementation
- `src/hooks/useGithubOAuth.ts` - OAuth token management hook
- Database table: `github_installations`

### 2. Repository Registration

**How it works:**
1. Navigate to `/repositories` page
2. Click "Register Repository"
3. Enter owner, name, default branch
4. Configure autonomy settings:
   - Auto-fix TODOs
   - Auto-fix quality issues
   - Auto-respond to issues
   - Auto-review PRs
   - Auto-apply changes (requires caution!)
   - Scan frequency (hourly/daily/weekly)
5. Repository is now monitored autonomously

**Key Files:**
- `src/pages/AutonomousRepositories.tsx` - Repository management page
- `src/components/RepositoryManager.tsx` - Repository UI component
- Database table: `registered_repositories`

### 3. Webhook Integration

**Setup:**
1. Register repository in AutoDidact UI
2. In GitHub repo settings → Webhooks → Add webhook:
   - URL: `https://your-project.supabase.co/functions/v1/github-webhook`
   - Content type: `application/json`
   - Secret: (save this secret)
   - Events: Pushes, Issues, Pull requests
3. Save webhook secret in repository settings in AutoDidact UI
4. AutoDidact will now automatically respond to events!

**Triggered Actions:**
- **Push events:** Scan for TODOs, fix quality issues
- **Issue opened:** Analyze issue, suggest solutions, optionally respond
- **PR opened/updated:** Review code changes, suggest improvements

**Key Files:**
- `supabase/functions/github-webhook/index.ts` - Webhook handler
- Database table: `webhook_events`

### 4. Scheduled Scanning

**Setup:**
1. Register repository with desired scan frequency
2. Set up cron job (via Supabase pg_cron or external service) to call:
   `POST https://your-project.supabase.co/functions/v1/scheduled-scan`
3. Scanner runs automatically, creates tasks for findings

**What it detects:**
- TODO/FIXME comments in code
- Code quality issues
- Open GitHub issues
- (Extensible - add custom patterns!)

**Key Files:**
- `supabase/functions/scheduled-scan/index.ts` - Scanner implementation
- Database table: `autonomous_scans`

## Known Issues & Important Notes

1. **Vite Configuration:** The `lovable-tagger` plugin is explicitly disabled in `vite.config.ts` because it causes "Cannot access 'ht' before initialization" errors when extension files are missing.

2. **TypeScript Strictness:** The project uses relaxed TypeScript settings (`noImplicitAny: false`, `strictNullChecks: false`) for rapid prototyping. Consider tightening before production.

3. **AI Model:** The `process-task` function now uses **Anthropic Claude Sonnet 4** (`claude-sonnet-4-20250514`). Requires `ANTHROPIC_API_KEY` environment variable. Legacy Ollama support removed.

4. **GitHub Rate Limits:** Frontend implements exponential backoff with jitter for rate-limited requests. Max 4 retries per request.

5. **Supabase Functions:** Edge functions use Deno runtime. Import syntax: `https://esm.sh/@supabase/supabase-js@2.39.3`

6. **Auto-Apply Safety:** Auto-apply is **disabled by default** for safety. Only enable for repositories you fully control and understand the implications. Use branch protection rules!

7. **Webhook Security:** Always use webhook secrets to verify GitHub webhook signatures. Invalid signatures are rejected automatically.

8. **OAuth Token Storage:** OAuth tokens are stored in `github_installations` table with Supabase RLS enabled. Only the token owner can access their tokens.

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
   - Frontend: Extend relevant components (`AutonomousAgent.tsx`, `RepositoryManager.tsx`)
   - Backend: Modify `supabase/functions/process-task/index.ts` or create new edge functions
   - Database: Add migrations in `supabase/migrations/`
   - Update Supabase types: `supabase gen types typescript --local > src/integrations/supabase/types.ts`

3. **Testing Autonomous Features:**
   - Start dev server: `npm run dev`
   - Deploy edge functions: `supabase functions deploy <function-name>`
   - Test GitHub OAuth flow with your GitHub account
   - Register a test repository
   - Trigger manual scan or create test webhook events
   - Monitor Supabase function logs and browser console

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
│   ├── Auth.tsx       # Sign-in/sign-up UI with GitHub OAuth
│   ├── AutonomousAgent.tsx  # Main agent interface (manual tasks)
│   ├── RepositoryManager.tsx # Repository registration & settings (NEW!)
│   ├── CodeDiff.tsx   # Diff viewer
│   ├── ErrorBoundary.tsx
│   └── ...
├── hooks/             # Custom React hooks
│   ├── use-toast.ts
│   ├── useAgentData.tsx
│   ├── useSecureGithubToken.ts  # Legacy PAT encryption
│   └── useGithubOAuth.ts        # OAuth token management (NEW!)
├── integrations/      # Third-party integrations (Supabase client, types)
├── lib/               # Utilities (cn() for class merging)
├── pages/             # Route components
│   ├── Index.tsx      # Landing page
│   ├── AutonomousAgent.tsx  # Agent interface wrapper
│   ├── AutonomousRepositories.tsx  # Repository management (NEW!)
│   └── NotFound.tsx
├── App.tsx            # Root app component with routing
├── main.tsx           # Entry point
└── index.css          # Global styles + Tailwind directives

supabase/
├── functions/
│   ├── process-task/  # Main agent execution (Claude Sonnet 4)
│   ├── github-webhook/ # GitHub webhook handler (NEW!)
│   ├── scheduled-scan/ # Autonomous repository scanner (NEW!)
│   ├── bedrock-agent/ # Alternative AWS Bedrock implementation (legacy)
│   └── ...
└── migrations/        # Database schema migrations
    └── 20251117000000_github_oauth_and_autonomy.sql  # Autonomous tables (NEW!)
```

## Adding Migrations

When modifying database schema:
1. Create migration: `supabase migration new <name>`
2. Edit SQL in `supabase/migrations/`
3. Apply locally: `supabase db reset`
4. Update types: `supabase gen types typescript --local > src/integrations/supabase/types.ts`
5. Deploy to production: `supabase db push`

## Deployment

This project is designed to be deployed on platforms supporting:
- **Frontend:** Vercel, Netlify, or any static hosting (build output: `dist/`)
- **Backend:** Supabase (auth, database, edge functions)
- **AI Model:** Anthropic Claude Sonnet 4 (via API key)

### Deployment Checklist:

1. **Supabase Setup:**
   - Configure GitHub OAuth provider (Client ID + Secret)
   - Set environment variables: `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   - Apply migrations: `supabase db push`
   - Deploy edge functions: `supabase functions deploy --all`

2. **Frontend Deployment:**
   - Set environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`
   - Build: `npm run build`
   - Deploy `dist/` directory to hosting platform

3. **GitHub Webhooks:**
   - Configure webhooks for each monitored repository
   - Use URL: `https://your-project.supabase.co/functions/v1/github-webhook`
   - Store webhook secrets securely

4. **Scheduled Scans:**
   - Set up cron job (pg_cron or external service)
   - Schedule: `POST https://your-project.supabase.co/functions/v1/scheduled-scan`

See `AUTONOMOUS_SETUP.md` for complete setup guide!

## Quick Start for Autonomous Building

1. **Sign in with GitHub OAuth** → Instant authentication
2. **Navigate to `/repositories`** → Register your repositories
3. **Configure autonomy settings** → Enable auto-fix TODOs, quality issues, etc.
4. **Set up webhooks (optional)** → Real-time responses to GitHub events
5. **Set up scheduled scans (optional)** → Periodic autonomous improvements
6. **Monitor progress** → View autonomous improvements in dashboard

That's it! AutoDidact will now autonomously improve your code! 🚀🤖
