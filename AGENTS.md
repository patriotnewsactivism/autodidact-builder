# Repository Guidelines

## Project Structure & Module Organization
- `src/` hosts React + TypeScript; `components`, `pages`, `hooks`, and `lib` split UI screens, routing, reusable hooks, and Supabase/GitHub helpers.
- `src/components/ui/` keeps shadcn primitives; agent-specific shells like `AutonomousAgent.tsx` stay in `src/components`, while shared integrations live in `src/lib`.
- Backend pieces sit under `supabase/functions` and `supabase/migrations`; static assets live in `public/`, build artifacts in `dist/`, and generated output should never be edited manually.

## Build, Test, and Development Commands
- `npm install` (or `bun install`) syncs dependencies; run it once per pull.
- `npm run dev` starts Vite with your `.env`; `npm run build && npm run preview` smoke-test the production bundle.
- `npm run lint` (ESLint) and `npm run test` (Vitest + Testing Library) must pass locally before review.
- `supabase functions serve process-task --env-file .env` iterates on agents; `supabase functions deploy process-task` publishes the worker.

## Coding Style & Naming Conventions
- Use TypeScript, 2-space indents, single quotes, and PascalCase component files; hooks stay camelCase (`useRealtimeDiff`).
- Prefer Tailwind utilities plus `clsx`/`cva` for variants; colocate UI state with the component and keep integrations inside `src/lib`.
- Run `npm run lint -- --fix` before committing; avoid mutating props and prefer derived state plus React Query caches.

## Testing Guidelines
- Name specs `*.test.ts(x)` beside the unit or in `src/test`, importing `src/test/setup.ts` for jest-dom helpers.
- Mock Supabase/GitHub clients through dependency injection; no live network calls in CI.
- Cover user-visible flows (auth, repo sync, diff viewer) rather than implementation details; blockers must include failing test references.

## Auth & Theme Hooks
- Consume auth state via `src/auth/useAuth` instead of reaching into the provider directly; the hook exposes `{ session, user, loading, error }` and should be called inside React trees wrapped by `AuthProvider`.
- Theme state lives in `src/hooks/useTheme`; call `const { theme, setTheme } = useTheme()` from client components and rely on `ThemeProvider` for persistence (localStorage key `ai-theme`).
- Keep provider logic (session bootstrapping, theme storage) inside `AuthProvider`/`ThemeProvider`; shared context types live in `src/auth/auth-context.ts` and `src/components/theme-context.ts` for reuse across UI packages.

## Commit & Pull Request Guidelines
- Match current history: short imperative subjects (`Add GitHub OAuth login`) with optional wrapped body paragraphs referencing issue IDs when relevant.
- Squash noisy WIP commits locally; keep Supabase migrations and app code in the same PR when they depend on each other.
- PR descriptions must list what changed, how it was tested (`npm run test`, screenshots for UI), and any config migrations or new env vars.

## Security & Configuration Notes
- Secrets stay in `.env`; rotate Supabase keys, GitHub tokens, and Ollama endpoints after sharing logs.
- Never commit `.env`, Supabase service-role keys, or agent transcripts with customer data; scrub `claude.js` output before attaching evidence.
- Use `supabase db push` or migrations only after review, and verify `supabase/config.toml` matches the target project before deploys.
