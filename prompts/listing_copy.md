# Listing Copy Prompt

Used by: lib/packager.js (generateListingCopy)
Called during: PACKAGING state, after the template is built and deployed

## Purpose
Draft a Gumroad product listing (title, description, price,
tags) for a completed template, based on the original brief
and the template_type/business_type and demo_url.

## Input
```json
{
  "brief": "original user brief",
  "template_type": "business_type string (any, e.g. yoga studio, law firm)",
  "demo_url": "live demo link",
  "price": 49
}
```

## Output (JSON only, no prose)
```json
{
  "title": "Gumroad product title, under 60 characters",
  "description": "4-6 sentence sales description in plain language — MUST mention demo, $49, easy to configure, mobile-friendly",
  "price": 49,
  "tags": ["6-8 lowercase tags including website-template, html-template, no-code, mobile-friendly plus business-type tags"]
}
```

## Instructions to the model — MANDATORY INCLUSIONS
- Every description MUST include ALL of these points in natural sales language (no omission):
  1. Ready-to-launch live demo included (reference demo_url)
  2. Price $49 (use the provided price, default 49)
  3. No-code / easy to configure — buyer can customize without coding
  4. 100% mobile-responsive / mobile-friendly on all devices
  5. Built specifically for the given business_type (e.g. "perfect for yoga studios")
- Write for a Gumroad buyer, not a developer: focus on launch speed and business outcome, not tech stack.
- Do not claim CMS/backend features unless true.
- Keep tags: ALWAYS include "website-template", "html-template", "no-code", "mobile-friendly" plus 2-4 business-type-specific tags (e.g. "yoga", "fitness" for yoga studio).
- Title under 60 chars, include business_type.
- Price: use config default 49 unless job overrides.
