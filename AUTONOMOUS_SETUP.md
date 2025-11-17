# AutoDidact Builder - Autonomous Building Setup Guide

This guide will help you set up AutoDidact Builder for **true autonomous building** with GitHub OAuth integration and automated repository monitoring.

## New Features 🚀

### 1. **GitHub OAuth Integration** ✅
- No more manual PAT entry!
- One-click "Sign in with GitHub" authentication
- Automatic token management and refresh
- Secure token storage in Supabase

### 2. **GitHub Webhook Support** 🎣
- Automatic triggers on push events, issues, and PRs
- Real-time response to repository changes
- Configurable autonomous actions per repository
- Secure webhook signature verification

### 3. **Background Task Scheduler** ⏰
- Scheduled repository scans (hourly/daily/weekly)
- Auto-detection of TODO/FIXME comments
- Proactive code quality improvements
- Open issue monitoring

### 4. **Enhanced Autonomy** 🤖
- Repository registration system
- Per-repository auto-apply preferences
- Autonomous improvement tracking
- Continuous learning from past actions

---

## Setup Instructions

### Step 1: Configure GitHub OAuth in Supabase

1. **Create a GitHub OAuth App:**
   - Go to GitHub → Settings → Developer settings → OAuth Apps → New OAuth App
   - Application name: `AutoDidact Builder`
   - Homepage URL: `https://your-supabase-project.supabase.co`
   - Authorization callback URL: `https://your-supabase-project.supabase.co/auth/v1/callback`
   - Copy the **Client ID** and **Client Secret**

2. **Configure Supabase Auth:**
   - Go to your Supabase project dashboard
   - Navigate to Authentication → Providers
   - Enable GitHub provider
   - Paste your GitHub Client ID and Client Secret
   - Save changes

3. **Update Redirect URLs (Optional):**
   - In Supabase → Authentication → URL Configuration
   - Add your application URL to allowed redirect URLs (e.g., `http://localhost:8080/agent`)

### Step 2: Apply Database Migration

Run the migration to create the new tables:

```bash
# If using Supabase CLI locally
supabase db push

# Or apply the migration manually in Supabase Dashboard → SQL Editor
# Copy and paste the contents of:
# supabase/migrations/20251117000000_github_oauth_and_autonomy.sql
```

This creates the following tables:
- `github_installations` - OAuth tokens
- `registered_repositories` - Monitored repositories
- `webhook_events` - Incoming webhook events
- `autonomous_scans` - Scheduled scan results
- `autonomous_improvements` - Improvement tracking

### Step 3: Deploy Edge Functions

Deploy the new edge functions for webhooks and scheduled scans:

```bash
# Deploy GitHub webhook handler
supabase functions deploy github-webhook

# Deploy scheduled scan function
supabase functions deploy scheduled-scan

# Verify deployment
supabase functions list
```

### Step 4: Set Up GitHub Webhooks (Per Repository)

For each repository you want to monitor autonomously:

1. **Get Webhook URL:**
   - Your webhook URL is: `https://your-supabase-project.supabase.co/functions/v1/github-webhook`

2. **Configure Repository Webhook:**
   - Go to your GitHub repository → Settings → Webhooks → Add webhook
   - Payload URL: `https://your-supabase-project.supabase.co/functions/v1/github-webhook`
   - Content type: `application/json`
   - Secret: (generate a random secret and save it)
   - Events: Select individual events:
     - ✅ Pushes
     - ✅ Issues
     - ✅ Pull requests
     - ✅ Issue comments
   - Active: ✅
   - Add webhook

3. **Save Webhook Secret in AutoDidact:**
   - After registering the repository in AutoDidact UI
   - Copy the webhook secret to the repository settings
   - AutoDidact will use this to verify webhook authenticity

### Step 5: Set Up Scheduled Scans (Optional)

To enable periodic autonomous scans, set up a cron job in Supabase:

1. **Using Supabase Edge Functions with pg_cron:**

```sql
-- Enable pg_cron extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule daily repository scans at 2 AM UTC
SELECT cron.schedule(
  'autonomous-daily-scan',
  '0 2 * * *',
  $$
  SELECT net.http_post(
    url := 'https://your-supabase-project.supabase.co/functions/v1/scheduled-scan',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
```

2. **Alternative: External Cron Service**
   - Use services like GitHub Actions, Vercel Cron, or Render Cron Jobs
   - Schedule HTTP POST requests to: `https://your-supabase-project.supabase.co/functions/v1/scheduled-scan`
   - Include Authorization header with service role key

**Example GitHub Actions Workflow (`.github/workflows/autodidact-scan.yml`):**

```yaml
name: AutoDidact Scheduled Scan

on:
  schedule:
    # Run daily at 2 AM UTC
    - cron: '0 2 * * *'
  workflow_dispatch: # Allow manual trigger

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger AutoDidact Scan
        run: |
          curl -X POST \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}" \
            https://your-supabase-project.supabase.co/functions/v1/scheduled-scan
```

---

## Usage Guide

### 1. Sign In with GitHub

1. Open AutoDidact Builder
2. Click **"Continue with GitHub"**
3. Authorize the application
4. You'll be redirected back to the agent interface

Your GitHub OAuth token is now automatically stored and managed!

### 2. Register Repositories for Autonomous Monitoring

1. Navigate to the **"Autonomous Repositories"** tab
2. Click **"Register Repository"**
3. Enter:
   - Owner: `your-username`
   - Repository Name: `your-repo`
   - Default Branch: `main`
4. Click **"Register"**

### 3. Configure Autonomous Settings

For each registered repository, you can enable:

- **✅ Fix TODOs** - Automatically implement features from TODO comments
- **✅ Fix Quality Issues** - Auto-fix code quality problems
- **✅ Respond to Issues** - Analyze and respond to new GitHub issues
- **✅ Review PRs** - Automatically review pull requests
- **✅ Auto-apply Changes** - Automatically commit changes (use with caution!)
- **⏰ Scan Frequency** - Hourly, Daily, or Weekly

### 4. Trigger Manual Scans

Click **"Scan Now"** on any registered repository to:
- Scan for TODO/FIXME comments
- Check code quality issues
- Review open issues
- Generate autonomous improvement tasks

---

## How Autonomous Building Works

### Webhook-Triggered Flow

```
GitHub Event (push/issue/PR)
    ↓
GitHub Webhook → github-webhook function
    ↓
Event stored in webhook_events table
    ↓
Check repository settings (auto_fix_todos, etc.)
    ↓
Create autonomous task in tasks table
    ↓
Invoke process-task function (with OAuth token)
    ↓
AI analyzes and generates changes
    ↓
Auto-apply to repository (if enabled)
    ↓
Record improvement in autonomous_improvements table
```

### Scheduled Scan Flow

```
Cron Job / Scheduled Trigger
    ↓
scheduled-scan function invoked
    ↓
Fetch all repositories with monitoring_enabled = true
    ↓
For each repo:
  - Fetch repository file tree
  - Scan files for TODO/FIXME comments
  - Detect code quality issues
  - Check open issues
    ↓
Create autonomous tasks for findings
    ↓
Invoke process-task for each task
    ↓
Auto-apply improvements (if configured)
```

---

## Security Considerations

### OAuth Token Storage
- OAuth tokens are stored in the `github_installations` table
- Tokens are encrypted using Supabase Row Level Security (RLS)
- Only the token owner can access their tokens

### Webhook Security
- Webhook signatures are verified using HMAC-SHA256
- Invalid signatures are rejected
- Store webhook secrets securely in repository settings

### Auto-Apply Safety
- Auto-apply is **disabled by default** for safety
- Enable only for repositories you fully control
- Review autonomous improvements before enabling auto-apply
- Use branch protection rules to require PR reviews

---

## Troubleshooting

### GitHub OAuth Not Working

**Issue:** GitHub sign-in fails or doesn't redirect properly

**Solutions:**
1. Verify GitHub OAuth app callback URL matches Supabase auth callback
2. Check that GitHub provider is enabled in Supabase dashboard
3. Ensure Client ID and Secret are correctly configured
4. Clear browser cache and try again

### Webhooks Not Triggering

**Issue:** Push events don't trigger autonomous actions

**Solutions:**
1. Verify webhook is configured in GitHub repository settings
2. Check webhook delivery logs in GitHub (Settings → Webhooks → Recent Deliveries)
3. Ensure webhook URL is correct: `https://your-project.supabase.co/functions/v1/github-webhook`
4. Verify webhook secret matches repository settings
5. Check Supabase function logs for errors

### Scheduled Scans Not Running

**Issue:** Repository scans don't run automatically

**Solutions:**
1. Verify cron job is scheduled correctly
2. Check that repositories have `monitoring_enabled = true`
3. Verify `scan_frequency` and `last_scanned_at` timestamps
4. Manually trigger scan to test: POST to `/functions/v1/scheduled-scan`
5. Check Supabase function logs

### OAuth Token Expired

**Issue:** GitHub operations fail with 401 Unauthorized

**Solutions:**
1. Sign out and sign in again with GitHub
2. Check token expiration in `github_installations` table
3. Implement token refresh logic (GitHub OAuth tokens don't expire unless revoked)

---

## Advanced Configuration

### Custom Autonomous Rules

Edit `supabase/functions/scheduled-scan/index.ts` to add custom detection patterns:

```typescript
// Example: Detect console.log statements
const detectConsoleLog = (content: string): boolean => {
  return /console\.log\(/.test(content);
};

// Add to scan results and create cleanup task
if (detectConsoleLog(content)) {
  // Create autonomous task to remove console.log
}
```

### Webhook Event Filtering

Modify `supabase/functions/github-webhook/index.ts` to customize which events trigger actions:

```typescript
// Example: Only trigger on push to main branch
if (eventType === 'push' && payload.ref === 'refs/heads/main') {
  // Create autonomous task
}
```

### Scan Performance Tuning

Adjust scan limits in `scheduled-scan/index.ts`:

```typescript
// Increase files scanned (default: 50)
const filesToScan = tree.slice(0, 100);

// Adjust concurrent processing
const CONCURRENT_SCANS = 5;
```

---

## Monitoring & Analytics

### View Autonomous Activity

```sql
-- Recent autonomous improvements
SELECT * FROM autonomous_improvements
ORDER BY created_at DESC
LIMIT 20;

-- Scan history
SELECT * FROM autonomous_scans
WHERE status = 'completed'
ORDER BY completed_at DESC;

-- Webhook event processing rate
SELECT
  event_type,
  COUNT(*) as total_events,
  SUM(CASE WHEN processed THEN 1 ELSE 0 END) as processed_count
FROM webhook_events
GROUP BY event_type;
```

---

## Next Steps

1. ✅ Complete Supabase setup and OAuth configuration
2. ✅ Deploy edge functions
3. ✅ Register your first repository
4. ✅ Configure webhook for real-time triggers
5. ✅ Set up scheduled scans
6. ✅ Monitor autonomous improvements
7. 🚀 Scale to multiple repositories!

---

## Support & Feedback

For issues or feature requests, please visit the project repository or contact support.

**Happy Autonomous Building! 🤖✨**
