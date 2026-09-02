/**
 * gumroad_client.js
 * ------------------------------------------------------------
 * Minimal Gumroad API client for publishing packaged templates.
 *
 * Docs: https://app.gumroad.com/api
 * Auth: access token from gumroad.com/settings/advanced -> Applications
 *       Set GUMROAD_ACCESS_TOKEN env var, or config.json gumroad.accessToken
 *
 * Gumroad's public API supports creating/editing products via
 * POST/PUT to https://api.gumroad.com/v2/products, but direct
 * file upload through the API is limited — for products with
 * downloadable files, the common reliable path is:
 *   1. Create the product via API (name, price, description)
 *   2. Upload the file through the Gumroad web dashboard UI
 *      (this step currently has no stable public endpoint)
 * This client automates step 1 and clearly flags step 2 as a
 * manual action until Gumroad's file-upload API is confirmed
 * available on your account tier.
 * ------------------------------------------------------------
 */

const https = require('https');
const config = require('../config.json');

const ACCESS_TOKEN = process.env.GUMROAD_ACCESS_TOKEN || config.gumroad.accessToken;
const API_BASE = 'api.gumroad.com';

function request(method, urlPath, params = {}) {
  return new Promise((resolve, reject) => {
    if (!ACCESS_TOKEN) {
      return reject(
        new Error(
          'Missing Gumroad access token. Set GUMROAD_ACCESS_TOKEN env var or config.json gumroad.accessToken.'
        )
      );
    }

    const body = new URLSearchParams({ ...params, access_token: ACCESS_TOKEN }).toString();

    const options = {
      hostname: API_BASE,
      path: `/v2${urlPath}`,
      method,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse Gumroad response: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Creates a new Gumroad product listing.
 * NOTE: does not upload the actual downloadable file — see
 * file header. Returns the created product's id/url so the
 * file can be attached manually or via a confirmed upload flow.
 */
async function createProduct(listing) {
  return request('POST', '/products', {
    name: listing.title,
    description: listing.description,
    price: Math.round((listing.price || 0) * 100), // Gumroad expects cents
    tags: (listing.tags || []).join(',')
  });
}

async function updateProduct(productId, updates) {
  return request('PUT', `/products/${productId}`, updates);
}

async function getProduct(productId) {
  return request('GET', `/products/${productId}`);
}

async function listProducts() {
  return request('GET', '/products');
}

module.exports = {
  createProduct,
  updateProduct,
  getProduct,
  listProducts
};
