# gumroad_agent

Adds a Gumroad publishing workflow on top of your existing
`agent_manager` / `browser_agent` / `builder_agent` /
`communication_agent` / `memory_agent` system.

Read `AGENT_REFERENCE.txt` first — it explains the objective,
the state machine, and exactly what still needs wiring up.

## Ubuntu setup

```bash
# from your drive's agents/ folder, alongside your other agents
cd agents/
# (copy/extract gumroad_agent here so it sits next to the others)

cd gumroad_agent

# zip is used by lib/packager.js to build the product zip
sudo apt update && sudo apt install -y zip

# no npm dependencies required yet — everything uses Node's
# built-in fs/path/https/child_process modules
node -v   # requires Node 16+
```

Edit `config.json`:
- `agentPaths` — point at your real sibling agent folders
- `github` — your username/repo/pagesBaseUrl for demo hosting
- `gumroad.accessToken` — or export `GUMROAD_ACCESS_TOKEN` instead
- `telegram.chatId` — matches your communication_agent's chat id

## Try it (before wiring the TODOs)

```bash
node workflow.js create "portfolio site for a photographer"
node workflow.js jobs
node workflow.js status <job_id>
```

This runs the full state machine with placeholder build/deploy
steps so you can see the flow work end-to-end before connecting
the real builder_agent/browser_agent/communication_agent calls
(each marked `// TODO:` in `workflow.js`).

## What to wire next, in order

1. `analyzeBrief()` in workflow.js → real call into
   agent_manager's `objective_analyzer.js` using
   `prompts/analyze_brief.md`
2. `buildTemplate()` → real call into builder_agent's `ngen.js`
3. `deployToGitHub()` → add a "push" action to browser_agent
4. `packager.generateListingCopy()` → real airouter call using
   `prompts/listing_copy.md`
5. `sendForReview()` → real call into communication_agent, plus
   a Telegram reply handler per `prompts/review_message.md`
6. Confirm Gumroad file-upload path for your account tier (see
   header comment in `lib/gumroad_client.js`)
