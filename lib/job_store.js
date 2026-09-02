/**
 * job_store.js
 * ------------------------------------------------------------
 * Reads and writes job records under data/jobs/<job_id>.json.
 * Mirrors the plain-JSON persistence style already used by
 * builder_agent (learning_data.json, task_log.json) and
 * browser_agent (learning_data.json).
 *
 * Used by: workflow.js
 * ------------------------------------------------------------
 */

const fs = require('fs');
const path = require('path');

const config = require('../config.json');
const JOBS_DIR = path.resolve(__dirname, '..', config.workflow.jobsDir);

function ensureJobsDir() {
  if (!fs.existsSync(JOBS_DIR)) {
    fs.mkdirSync(JOBS_DIR, { recursive: true });
  }
}

function jobPath(jobId) {
  return path.join(JOBS_DIR, `${jobId}.json`);
}

function generateJobId() {
  const now = new Date();
  const stamp = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `gr_${stamp}_${rand}`;
}

function createJob(brief) {
  ensureJobsDir();
  const job = {
    job_id: generateJobId(),
    state: 'RECEIVED_BRIEF',
    brief,
    template_type: null,
    build_params: {},
    demo_url: null,
    package_path: null,
    listing_draft: null,
    gumroad_product_id: null,
    revision_notes: [],
    history: [{ state: 'RECEIVED_BRIEF', ts: new Date().toISOString() }]
  };
  saveJob(job);
  return job;
}

function loadJob(jobId) {
  const p = jobPath(jobId);
  if (!fs.existsSync(p)) {
    throw new Error(`Job not found: ${jobId}`);
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function saveJob(job) {
  ensureJobsDir();
  fs.writeFileSync(jobPath(job.job_id), JSON.stringify(job, null, 2));
  return job;
}

function transition(job, newState) {
  job.state = newState;
  job.history.push({ state: newState, ts: new Date().toISOString() });
  return saveJob(job);
}

function listJobs() {
  ensureJobsDir();
  return fs
    .readdirSync(JOBS_DIR)
    .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(JOBS_DIR, f), 'utf8')));
}

module.exports = {
  createJob,
  loadJob,
  saveJob,
  transition,
  listJobs
};
