#!/usr/bin/env node
/**
 * workflow.js
 * ------------------------------------------------------------
 * CLI entry point + state machine driver for the Gumroad
 * template automation pipeline. See AGENT_REFERENCE.txt for
 * the full state diagram and integration notes.
 *
 * This file orchestrates the EXISTING agents (agent_manager,
 * builder_agent, browser_agent, communication_agent,
 * memory_agent) via child_process calls. It does not
 * reimplement their logic — see config.json agentPaths.
 *
 * Usage:
 *   node workflow.js create "<brief>"
 *   node workflow.js jobs
 *   node workflow.js status <job_id>
 *   node workflow.js review <job_id>
 *   node workflow.js approve <job_id>
 *   node workflow.js reject <job_id> [note]
 *   node workflow.js publish <job_id>
 * ------------------------------------------------------------
 */

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const config = require('./config.json');
const jobStore = require('./lib/job_store');
const packager = require('./lib/packager');
const gumroad = require('./lib/gumroad_client');

const AGENT_PATHS = {
  agentManager: path.resolve(__dirname, config.agentPaths.agentManager),
  browserAgent: path.resolve(__dirname, config.agentPaths.browserAgent),
  builderAgent: path.resolve(__dirname, config.agentPaths.builderAgent),
  memoryAgent: path.resolve(__dirname, config.agentPaths.memoryAgent)
};

// Load memory_agent logger
const memoryLogger = require(path.join(AGENT_PATHS.memoryAgent, 'memory_logger'));

// ------------------------------------------------------------
// Step implementations — each wraps a call into an existing
// sibling agent. TODOs mark where real wiring is still needed.
// ------------------------------------------------------------

function logToMemory(job, message, metadata = {}) {
  memoryLogger.addLog('gumroad_agent', job.job_id, message, metadata);
  console.log(`[memory] ${job.job_id}: ${message}`);
}

function logError(job, error, metadata = {}) {
  memoryLogger.addError('gumroad_agent', job.job_id, error, metadata);
  console.error(`[error] ${job.job_id}: ${error}`);
}

function analyzeBrief(job) {
  jobStore.transition(job, 'ANALYZING');
  
  try {
    // Read the analyze_brief.md prompt
    const promptPath = path.join(__dirname, 'prompts', 'analyze_brief.md');
    const systemPrompt = fs.readFileSync(promptPath, 'utf8');
    
    // Call agent_manager's analyze command
    const result = execSync(
      `node "${path.join(AGENT_PATHS.agentManager, 'agent_manager_cli.js')}" analyze "${job.brief.replace(/"/g, '\\"')}"`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    
    // Parse the structured output from agent_manager
    // The analyze command outputs text, we need to extract the relevant info
    const lines = result.split('\n');
    let template_type = 'portfolio';
    let title = job.brief;
    let description = `A website template: ${job.brief}`;
    
    // Extract intent from the output
    for (const line of lines) {
      if (line.includes('Intent:')) {
        const intent = line.split('Intent:')[1]?.trim().toLowerCase();
        if (intent?.includes('saas') || intent?.includes('dashboard')) template_type = 'saas';
        else if (intent?.includes('shop') || intent?.includes('store') || intent?.includes('ecommerce')) template_type = 'ecommerce';
        else if (intent?.includes('blog')) template_type = 'blog';
        else if (intent?.includes('portfolio')) template_type = 'portfolio';
      }
      if (line.includes('Expected Result:')) {
        const expected = line.split('Expected Result:')[1]?.trim();
        if (expected) description = expected;
      }
    }
    
    // Fallback to keyword matching if agent_manager doesn't provide clear intent
    const briefLower = job.brief.toLowerCase();
    if (template_type === 'portfolio') {
      if (briefLower.includes('saas') || briefLower.includes('dashboard')) template_type = 'saas';
      else if (briefLower.includes('shop') || briefLower.includes('store') || briefLower.includes('ecommerce')) template_type = 'ecommerce';
      else if (briefLower.includes('blog')) template_type = 'blog';
    }
    
    job.template_type = template_type;
    job.build_params = {
      title: title.slice(0, 60),
      description: description,
      activePage: 'Home',
      body: 'Hero, Features, About, Contact',
      filename: job.brief.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)
    };
    
    logToMemory(job, 'Brief analyzed via agent_manager', { template_type, intent: 'extracted' });
  } catch (error) {
    // Fallback to simple keyword matching if agent_manager fails
    logError(job, `agent_manager analysis failed, using fallback: ${error.message}`);
    
    const briefLower = job.brief.toLowerCase();
    let template_type = 'portfolio';
    if (briefLower.includes('saas') || briefLower.includes('dashboard')) template_type = 'saas';
    else if (briefLower.includes('shop') || briefLower.includes('store') || briefLower.includes('ecommerce')) template_type = 'ecommerce';
    else if (briefLower.includes('blog')) template_type = 'blog';
    
    job.template_type = template_type;
    job.build_params = {
      title: job.brief,
      description: `A ${template_type} website template: ${job.brief}`,
      activePage: 'Home',
      body: 'Hero, Features, About, Contact',
      filename: job.brief.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)
    };
    
    logToMemory(job, 'Brief analyzed with fallback', { template_type });
  }
  
  return job;
}

function buildTemplate(job) {
  jobStore.transition(job, 'BUILDING');
  
  // Create output directory for this job
  const outputDir = path.join(AGENT_PATHS.builderAgent, 'output', job.job_id);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  try {
    // Use builder_agent's module API directly
    const ngen = require(path.join(AGENT_PATHS.builderAgent, 'ngen.js'));
    const { title, description, activePage, body, filename } = job.build_params;
    
    // Generate the HTML page
    const html = ngen.generatePage(title, description, activePage, body, filename);
    
    // Write to job output directory
    const filePath = path.join(outputDir, `${filename}.html`);
    fs.writeFileSync(filePath, html);
    
    logToMemory(job, 'Template built via ngen module', { outputDir, filename, size: html.length });
  } catch (error) {
    logError(job, `builder_agent failed: ${error.message}`);
    // Create a minimal placeholder template so the pipeline can continue
    const placeholderHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${job.build_params.title}</title>
</head>
<body>
  <h1>${job.build_params.title}</h1>
  <p>${job.build_params.description}</p>
</body>
</html>`;
    fs.writeFileSync(path.join(outputDir, `${job.build_params.filename}.html`), placeholderHtml);
    logToMemory(job, 'Created placeholder template', { outputDir });
  }
  
  logToMemory(job, 'Template build complete', { sourceDir: outputDir });
  return outputDir;
}

function deployToGitHub(job) {
  jobStore.transition(job, 'DEPLOYING');
  
  const { username, repo, branch } = config.github;
  
  if (!username || !repo) {
    const url = `https://example.github.io/${job.job_id}/`;
    job.demo_url = url;
    jobStore.saveJob(job);
    logToMemory(job, 'Deployed demo (GitHub not configured)', { demo_url: url });
    return url;
  }
  
  try {
    // 1. Push source code to main repo
    pushSourceCode(job);
    
    // 2. Deploy template to GitHub Pages
    const url = deployToPages(job, username, repo, branch);
    
    return url;
  } catch (error) {
    logError(job, `GitHub deployment failed: ${error.message}`);
    const url = `https://${username}.github.io/${repo}/${job.job_id}/`;
    job.demo_url = url;
    jobStore.saveJob(job);
    logToMemory(job, 'Deployed demo (GitHub push failed)', { demo_url: url });
    return url;
  }
}

function pushSourceCode(job) {
  const sourceDir = __dirname;
  const gitDir = path.join(sourceDir, '.git');
  
  if (!fs.existsSync(gitDir)) {
    logToMemory(job, 'No git repo found, skipping source push');
    return;
  }
  
  try {
    execSync('git add -A', { cwd: sourceDir, stdio: 'pipe' });
    
    // Only commit if there are changes
    const status = execSync('git status --porcelain', { cwd: sourceDir, encoding: 'utf8' });
    if (status.trim()) {
      execSync(`git commit -m "Auto: Update after job ${job.job_id}"`, { cwd: sourceDir, stdio: 'pipe' });
      execSync('git push origin main', { cwd: sourceDir, stdio: 'pipe' });
      logToMemory(job, 'Source code pushed to GitHub');
    }
  } catch (error) {
    logError(job, `Source push failed: ${error.message}`);
  }
}

function deployToPages(job, username, repo, mainBranch) {
  const sourceDir = __dirname;
  const pagesBranch = 'gh-pages';
  const jobFilesDir = path.join(AGENT_PATHS.builderAgent, 'output', job.job_id);
  
  if (!fs.existsSync(jobFilesDir)) {
    throw new Error(`No built files found for job ${job.job_id}`);
  }
  
  // Create a temp directory for gh-pages content
  const pagesDir = path.join(__dirname, 'data', 'pages');
  if (!fs.existsSync(pagesDir)) {
    fs.mkdirSync(pagesDir, { recursive: true });
  }
  
  try {
    // Clone or init gh-pages branch
    const gitDir = path.join(pagesDir, '.git');
    if (fs.existsSync(gitDir)) {
      // Reset existing repo
      execSync('git fetch origin', { cwd: pagesDir, stdio: 'pipe' });
      execSync(`git checkout ${pagesBranch}`, { cwd: pagesDir, stdio: 'pipe' });
      execSync('git rm -rf .', { cwd: pagesDir, stdio: 'pipe' });
    } else {
      // Clone just the gh-pages branch
      const remoteUrl = `https://github.com/${username}/${repo}.git`;
      try {
        execSync(`git clone -b ${pagesBranch} --single-branch ${remoteUrl} .`, { cwd: pagesDir, stdio: 'pipe' });
      } catch {
        // Branch doesn't exist yet, initialize fresh
        execSync('git init', { cwd: pagesDir, stdio: 'pipe' });
        execSync(`git checkout -b ${pagesBranch}`, { cwd: pagesDir, stdio: 'pipe' });
        execSync(`git remote add origin ${remoteUrl}`, { cwd: pagesDir, stdio: 'pipe' });
      }
    }
    
    // Set git config for this repo
    execSync('git config user.email "dawba02@gmail.com"', { cwd: pagesDir, stdio: 'pipe' });
    execSync('git config user.name "danao21"', { cwd: pagesDir, stdio: 'pipe' });
    
    // Copy job files to pages directory
    const files = fs.readdirSync(jobFilesDir);
    for (const file of files) {
      fs.copyFileSync(path.join(jobFilesDir, file), path.join(pagesDir, file));
    }
    
    // Create index.html redirect if it doesn't exist
    const indexFile = path.join(pagesDir, 'index.html');
    if (!fs.existsSync(indexFile)) {
      const indexHtml = `<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="refresh" content="0; url=${job.job_id}/">
  <title>Redirecting...</title>
</head>
<body>
  <p>Redirecting to <a href="${job.job_id}/">${job.job_id}</a>...</p>
</body>
</html>`;
      fs.writeFileSync(indexFile, indexHtml);
    }
    
    // Add, commit, push
    execSync('git add -A', { cwd: pagesDir, stdio: 'pipe' });
    execSync(`git commit -m "Deploy ${job.job_id}" --allow-empty`, { cwd: pagesDir, stdio: 'pipe' });
    execSync(`git push -f origin ${pagesBranch}`, { cwd: pagesDir, stdio: 'pipe' });
    
    const url = `https://${username}.github.io/${repo}/${job.job_id}/`;
    job.demo_url = url;
    jobStore.saveJob(job);
    
    logToMemory(job, 'Deployed to GitHub Pages', { demo_url: url, repo: `${username}/${repo}` });
    return url;
  } finally {
    // Clean up pages directory
    try {
      execSync('rm -rf .git *', { cwd: pagesDir, stdio: 'pipe' });
    } catch {}
  }
}

function packageAndDraftListing(job, sourceDir) {
  jobStore.transition(job, 'PACKAGING');
  const zipPath = packager.packageTemplate(sourceDir, job.job_id);
  const listing = packager.generateListingCopy(job);
  job.package_path = zipPath;
  job.listing_draft = listing;
  jobStore.saveJob(job);
  logToMemory(job, 'Packaged + listing drafted', { zipPath, listing });
  return { zipPath, listing };
}

function sendForReview(job) {
  jobStore.transition(job, 'AWAITING_REVIEW');
  
  const tagsStr = Array.isArray(job.listing_draft?.tags) 
    ? job.listing_draft.tags.join(', ') 
    : (job.listing_draft?.tags || 'N/A');
  
  const message = `New product ready for review — job ${job.job_id}

Brief: ${job.brief}
Type: ${job.template_type}

Demo: ${job.demo_url}

Listing draft:
  Title: ${job.listing_draft?.title || 'N/A'}
  Price: $${job.listing_draft?.price || 'N/A'}
  Tags: ${tagsStr}

${job.listing_draft?.description || 'N/A'}

Reply:
  "yes" or "approve" -> publish to Gumroad as-is
  "no" or "reject"   -> discard this job
  "revise: <notes>"  -> send back for another build pass`;
  
  console.log('--- REVIEW REQUEST ---');
  console.log(message);
  console.log('----------------------');
  logToMemory(job, 'Sent for review');
}

async function publishToGumroad(job) {
  jobStore.transition(job, 'PUBLISHING');
  
  // Pass the zip file path so gumroad_client uploads it automatically
  const result = await gumroad.createProduct({
    ...job.listing_draft,
    filePath: job.package_path
  });
  
  if (result && result.success !== false) {
    job.gumroad_product_id = result.product ? result.product.id : null;
    jobStore.transition(job, 'PUBLISHED');
    logToMemory(job, 'Published to Gumroad', { product_id: job.gumroad_product_id });
    console.log(`Published! Product ID: ${job.gumroad_product_id}`);
  } else {
    console.error('Gumroad publish failed:', result);
    logError(job, 'Gumroad publish failed', result);
  }
  return job;
}

// ------------------------------------------------------------
// Command handlers
// ------------------------------------------------------------

function cmdCreate(brief) {
  if (!brief) {
    console.error('Usage: node workflow.js create "<brief>"');
    process.exit(1);
  }
  let job = jobStore.createJob(brief);
  job = analyzeBrief(job);
  const sourceDir = buildTemplate(job);
  deployToGitHub(job);
  packageAndDraftListing(job, sourceDir);
  sendForReview(job);
  console.log(`Job ${job.job_id} is now AWAITING_REVIEW.`);
}

function cmdJobs() {
  const jobs = jobStore.listJobs();
  if (jobs.length === 0) {
    console.log('No jobs yet.');
    return;
  }
  jobs.forEach((j) => console.log(`${j.job_id}  [${j.state}]  ${j.brief}`));
}

function cmdStatus(jobId) {
  console.log(JSON.stringify(jobStore.loadJob(jobId), null, 2));
}

function cmdReview(jobId) {
  const job = jobStore.loadJob(jobId);
  sendForReview(job);
}

async function cmdApprove(jobId) {
  const job = jobStore.loadJob(jobId);
  jobStore.transition(job, 'APPROVED');
  await publishToGumroad(job);
}

function cmdReject(jobId, note) {
  const job = jobStore.loadJob(jobId);
  if (note) job.revision_notes.push({ note, ts: new Date().toISOString() });
  jobStore.transition(job, 'REJECTED');
  logToMemory(job, 'Rejected', { note: note || null });
  console.log(`Job ${jobId} rejected.${note ? ` Note: ${note}` : ''}`);
}

async function cmdPublish(jobId) {
  const job = jobStore.loadJob(jobId);
  await publishToGumroad(job);
}

// ------------------------------------------------------------
// CLI dispatch
// ------------------------------------------------------------

async function main() {
  const [, , cmd, ...args] = process.argv;

  switch (cmd) {
    case 'create':
      cmdCreate(args.join(' '));
      break;
    case 'jobs':
      cmdJobs();
      break;
    case 'status':
      cmdStatus(args[0]);
      break;
    case 'review':
      cmdReview(args[0]);
      break;
    case 'approve':
      await cmdApprove(args[0]);
      break;
    case 'reject':
      cmdReject(args[0], args.slice(1).join(' '));
      break;
    case 'publish':
      await cmdPublish(args[0]);
      break;
    default:
      console.log(`Usage:
  node workflow.js create "<brief>"
  node workflow.js jobs
  node workflow.js status <job_id>
  node workflow.js review <job_id>
  node workflow.js approve <job_id>
  node workflow.js reject <job_id> [note]
  node workflow.js publish <job_id>`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
