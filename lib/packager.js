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
    template_type: job.template_type,
    demo_url: job.demo_url
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
        
        // Validate and apply defaults
        return {
          title: listing.title || `${job.brief} — Website Template`,
          description: listing.description || `A clean, ready-to-use ${job.template_type || 'website'} template. Built with HTML/CSS/JS, fully responsive, easy to customize. Live demo included.`,
          price: listing.price || config.gumroad.defaultPrice || 9,
          tags: listing.tags || [job.template_type, 'html', 'css', 'template'].filter(Boolean)
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
  return {
    title: `${job.brief} — Website Template`,
    description:
      `A clean, ready-to-use ${job.template_type || 'website'} template. ` +
      `Built with HTML/CSS/JS, fully responsive, easy to customize. ` +
      `Live demo included.`,
    price: config.gumroad.defaultPrice || 9,
    tags: [job.template_type, 'html', 'css', 'template'].filter(Boolean)
  };
}

module.exports = {
  packageTemplate,
  generateListingCopy
};
