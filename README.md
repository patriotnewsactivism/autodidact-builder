Welcome to your Lovable project

Project info

URL: https://lovable.dev/projects/72ddbbb5-9f16-4612-90e7-cfecda82084b

How can I edit this code?

There are several ways of editing your application.

Use Lovable

Simply visit the Lovable Project and start prompting.

Changes made via Lovable will be committed automatically to this repo.

Use your preferred IDE

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - install with nvm

Follow these steps:

# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev

## Configuring Supabase, GitHub and the model endpoint

This project uses Supabase for authentication and storage, GitHub for repository access and a language‑model endpoint for code generation.  The sample `.env` included in this repository contains placeholder values; without valid keys the app will display a "wrong API key" error when you try to sign in or connect to a repository.  To run the agent autonomously you need to supply your own credentials and endpoints:

1. **Create a Supabase project** – sign up at [Supabase](https://supabase.com), create a new project and copy the project URL (e.g. `https://your‑project.supabase.co`) and the **Anon** API key from **Settings → API**.  Copy the **Service role** key as well – this is used by the server‑side `process‑task` function.
2. **Update the `.env` file** – use your own values for `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.  For example:

   ```bash
   VITE_SUPABASE_URL="https://your‑project.supabase.co"
   VITE_SUPABASE_PUBLISHABLE_KEY="<your anon key>"
   SUPABASE_URL="https://your‑project.supabase.co"
   SUPABASE_SERVICE_ROLE_KEY="<your service role key>"


3.	Provide a model endpoint – the process‑task function calls a language model to plan tasks and generate code.  You can run a local model with Ollama (ollama serve) and set OLLAMA_ENDPOINT to your server URL (e.g. http://localhost:11434) and OLLAMA_MODEL to the model name (e.g. phi4).  Alternatively, adapt the function to call another API and set MODEL_URL/MODEL_NAME instead.
	4.	Generate a GitHub personal access token – in the agent UI you’ll be asked for a GitHub access token.  Create a token with repo and contents: read/write scopes in GitHub → Settings → Developer Settings → Personal access tokens, and paste it into the UI before connecting to a repository.
	5.	Deploy the Supabase function – run supabase functions deploy process-task from the root of this repository to deploy the process‑task function.  The function reads your SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OLLAMA_ENDPOINT and OLLAMA_MODEL variables to access the database and model.

After setting these values and starting the development server, sign up with an email and password.  Once signed in, enter the GitHub repository (e.g. owner/repo) and your personal access token, click Connect, and the agent will be ready to execute autonomous tasks.