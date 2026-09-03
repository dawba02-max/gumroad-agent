/**
 * packager.js
 * ------------------------------------------------------------
 * Takes a built template's output directory and produces:
 *   1. a downloadable zip in output/<job_id>.zip
 *   2. a draft Gumroad listing (title/description/price/tags)
 *
 * Zipping uses the system `zip` binary via child_process to
 * avoid adding a new npm dependency (Ubuntu ships zip via
 * `apt install zip` if not already present).
 *
 * Listing copy generation calls your airouter endpoint
 * (POST http://localhost:8787/v1/chat/completions) using the
 * "builder" role model list, following prompts/listing_copy.md.
 * ------------------------------------------------------------
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const config = require('../config.json');
const OUTPUT_DIR = path.resolve(__dirname, '..', config.workflow.outputDir);

// Airouter endpoint for listing copy generation
const AIROUTER_URL = 'http://localhost:8787/v1/chat/completions';

function ensureOutputDir() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

/**
 * Zips a directory of built template files into output/<jobId>.zip
 * @param {string} sourceDir - directory containing the built template
 * @param {string} jobId
 * @returns {string} path to the created zip
 */
function packageTemplate(sourceDir, jobId) {
  ensureOutputDir();
  const zipPath = path.join(OUTPUT_DIR, `${jobId}.zip`);

  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Source directory does not exist: ${sourceDir}`);
  }

  // -j junks paths so the zip root is clean for the buyer;
  // change to a recursive -r if the template has subfolders
  // (assets/, css/, js/) that need to be preserved.
  execSync(`cd "${sourceDir}" && zip -r "${zipPath}" .`, { stdio: 'inherit' });

  return zipPath;
}

/**
 * Drafts Gumroad listing copy for a given brief/template_type.
 * Calls airouter endpoint using prompts/listing_copy.md
 * @param {object} job
 * @returns {object} { title, description, price, tags }
 */
function generateListingCopy(job) {
  // Read the listing_copy.md prompt
  const promptPath = path.join(__dirname, '..', 'prompts', 'listing_copy.md');
  let systemPrompt;
  
  try {
    systemPrompt = fs.readFileSync(promptPath, 'utf8');
  } catch (error) {
    // Fallback prompt if file not found
    systemPrompt = `Create a Gumroad product listing for a website template.
Output JSON with: title, description, price, tags.`;
  }
  
  const userInput = JSON.stringify({
    brief: job.brief,
    template_type: job.template_type || job.schema?.business_type || 'website',
    demo_url: job.demo_url,
    price: job.listing_draft?.price || config.gumroad.defaultPrice || 49,
    business_type: job.schema?.business_type || job.template_type
  });
  
  try {
    // Call airouter endpoint
    const response = execSync(
      `curl -s -X POST "${AIROUTER_URL}" -H "Content-Type: application/json" -d '${JSON.stringify({
        model: 'builder',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userInput }
        ]
      }).replace(/'/g, "'\\''")}'`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    
    const result = JSON.parse(response);
    
    // Extract the content from the response
    if (result.choices && result.choices[0] && result.choices[0].message) {
      const content = result.choices[0].message.content;
      
      // Try to parse JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const listing = JSON.parse(jsonMatch[0]);
        
        // Validate and apply defaults — enforce mandatory marketing copy (TASK6)
        const mustHave = (d)=> /demo/i.test(d) && /\$49|49/.test(d) && /easy to configure|no-code/i.test(d) && /mobile/i.test(d);
        let desc = listing.description || '';
        if(!mustHave(desc)){
          // append standard positioning if model omitted it
          desc = (desc ? desc + ' ' : '') + `Live demo included at ${job.demo_url}. Just $49 — easy to configure with no code needed, 100% mobile-friendly and built specifically for ${job.schema?.business_type || job.template_type || 'your business'}.`;
        }
        // enforce required tags
        let tags = Array.isArray(listing.tags) ? listing.tags : [];
        const requiredTags = ['website-template','html-template','no-code','mobile-friendly'];
        requiredTags.forEach(t=>{ if(!tags.includes(t)) tags.push(t); });
        if(job.schema?.business_type && !tags.some(t=> t.includes(job.schema.business_type.split(' ')[0].toLowerCase()))){
          tags.push(job.schema.business_type.toLowerCase().replace(/\s+/g,'-'));
        }
        return {
          title: listing.title || `${job.brief} — Website Template`,
          description: desc || `A clean, ready-to-use ${job.template_type || 'website'} template. Built with HTML/CSS/JS, fully responsive, easy to customize. Live demo included at ${job.demo_url}. $49, no-code setup, mobile-friendly.`,
          price: listing.price || config.gumroad.defaultPrice || 49,
          tags
        };
      }
    }
    
    // Fallback if parsing fails
    console.log('airouter response parsing failed, using fallback listing');
    return generateFallbackListing(job);
  } catch (error) {
    console.log(`airouter call failed: ${error.message}, using fallback listing`);
    return generateFallbackListing(job);
  }
}

/**
 * Fallback listing generation when airouter is unavailable
 */
function generateFallbackListing(job) {
  const biz = job.schema?.business_type || job.template_type || 'business';
  return {
    title: `${job.brief} — Website Template`,
    description:
      `Launch your ${biz} site today with this ready-to-use HTML template. ` +
      `Live demo included at ${job.demo_url}. Just $49 — easy to configure with no code needed, 100% mobile-friendly, fast and SEO-ready. Built specifically for ${biz}, fully customizable colors and branding.`,
    price: config.gumroad.defaultPrice || 49,
    tags: [job.template_type || biz.toLowerCase().replace(/\s+/g,'-'), 'website-template','html-template','no-code','mobile-friendly'].filter(Boolean)
  };
}

module.exports = {
  packageTemplate,
  generateListingCopy
};
