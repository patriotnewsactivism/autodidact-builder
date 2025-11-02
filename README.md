# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/72ddbbb5-9f16-4612-90e7-cfecda82084b

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/72ddbbb5-9f16-4612-90e7-cfecda82084b) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## Autonomous agent quickstart

1. **Model provider (zero-cost friendly)**  
   - Run an [Ollama](https://github.com/ollama/ollama) instance locally or on an inexpensive VM.  
   - Pull a coding-capable model such as `ollama pull phi4` or `ollama pull deepseek-coder`.  
   - Expose the service (default `http://localhost:11434`) to the Supabase edge runtime or tunnel it if necessary.

2. **Configure Supabase edge function**  
   - Set the following environment variables for the `process-task` function:  
     - `OLLAMA_ENDPOINT` (e.g. `http://host.docker.internal:11434`)  
     - `OLLAMA_MODEL` (e.g. `phi4`)  
     - `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (already required).  
   - Deploy the function: `supabase functions deploy process-task --project-ref <project-id>`.

3. **Front-end agent settings**  
   - Sign in via Supabase auth, connect a GitHub repository, and add a PAT with `repo` scope.  
   - Open any files you want the agent to consider; tick them in the “Context files” list before launching an instruction.  
   - The agent streams its plan, proposed changes, and line counts into Supabase tables so the activity feed and knowledge base persist between sessions.

4. **Two-way GitHub sync**
   - Use `Commit changes` for single-file saves or `Commit workspace` to bundle multi-file updates and deletions into one tree commit through the Git data API.
   - The workspace tracks dirty files, staged deletions, committed paths, and total line deltas for telemetry and reporting.

### Auto-apply commits & knowledge capture

- Tick **"Auto apply generated code"** when dispatching an instruction to let AutoDidact push the proposed changes straight to the connected branch. The Supabase edge function reuses your repository PAT to:
  - Create blobs and trees for every generated update, creation, or deletion.
  - Write a commit summarising the plan and advance the branch ref when the model output is valid.
  - Record success, failure, and skipped states back into the activity feed together with links to the resulting commit.
- Every successful run stores a knowledge node containing the instruction, summary, and file deltas. The right-hand "Knowledge vault" panel surfaces the latest entries so the agent can reuse prior insights on subsequent tasks.
- Agent metrics now track total tasks, cumulative line changes, and the number of high-confidence knowledge nodes, giving you a quick pulse on how much the assistant has accomplished.

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/72ddbbb5-9f16-4612-90e7-cfecda82084b) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)
