/**
 * gumroad_client.js
 * ------------------------------------------------------------
 * Gumroad API client for publishing packaged templates.
 *
 * Docs: https://app.gumroad.com/api
 * Auth: access token from gumroad.com/settings/advanced -> Applications
 *       Set GUMROAD_ACCESS_TOKEN env var, or config.json gumroad.accessToken
 *
 * OAuth scopes needed: edit_products or account
 *
 * File upload flow:
 *   1. POST /v2/files/presign → get upload_id + presigned URLs
 *   2. PUT each 100MB part to S3
 *   3. POST /v2/files/complete → finalize upload
 *   4. POST /v2/products with files[][url]
 * ------------------------------------------------------------
 */

const fs = require('fs');
const https = require('https');
const path = require('path');
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
 * Upload a file to S3 via Gumroad's presigned upload flow.
 * @param {string} filePath - Local path to the file
 * @returns {string} file_url - Canonical S3 URL to attach to product
 */
async function uploadFile(filePath) {
  const fileName = path.basename(filePath);
  const fileSize = fs.statSync(filePath).size;

  // Step 1: Presign the upload
  const presignResult = await request('POST', '/files/presign', {
    filename: fileName,
    file_size: fileSize.toString()
  });

  if (!presignResult.success) {
    throw new Error(`Presign failed: ${JSON.stringify(presignResult)}`);
  }

  const { upload_id, key, parts } = presignResult;

  // Step 2: Upload each part to S3
  const etags = [];
  const fileContent = fs.readFileSync(filePath);

  for (const part of parts) {
    const start = (part.part_number - 1) * 100 * 1024 * 1024;
    const end = Math.min(start + 100 * 1024 * 1024, fileSize);
    const partData = fileContent.slice(start, end);

    const etag = await uploadPart(part.presigned_url, partData);
    etags.push({ part_number: part.part_number, etag });
  }

  // Step 3: Complete the upload
  const completeParams = { upload_id, key };
  for (const etag of etags) {
    completeParams[`parts[][part_number]`] = etag.part_number.toString();
    completeParams[`parts[][etag]`] = etag.etag;
  }

  const completeResult = await request('POST', '/files/complete', completeParams);

  if (!completeResult.success) {
    throw new Error(`Complete failed: ${JSON.stringify(completeResult)}`);
  }

  return completeResult.file_url;
}

function uploadPart(presignedUrl, data) {
  return new Promise((resolve, reject) => {
    const url = new URL(presignedUrl);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'PUT',
      headers: {
        'Content-Length': data.length
      }
    };

    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => (responseData += chunk));
      res.on('end', () => {
        const etag = res.headers['etag'];
        if (etag) {
          resolve(etag.replace(/"/g, ''));
        } else {
          reject(new Error('No ETag in response'));
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

/**
 * Creates a new Gumroad product listing with optional file upload.
 * @param {object} listing - { title, description, price, tags, filePath }
 * @returns {object} - { success, product: { id, url, ... } }
 */
async function createProduct(listing) {
  const params = {
    name: listing.title,
    description: listing.description || '',
    price: Math.round((listing.price || 0) * 100),
    tags: JSON.stringify(listing.tags || [])
  };

  // Upload file if provided
  if (listing.filePath && fs.existsSync(listing.filePath)) {
    const fileUrl = await uploadFile(listing.filePath);
    params['files[][url]'] = fileUrl;
  }

  return request('POST', '/products', params);
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
  listProducts,
  uploadFile
};
