# Listing Copy Prompt

Used by: lib/packager.js (generateListingCopy)
Called during: PACKAGING state, after the template is built and deployed

## Purpose
Draft a Gumroad product listing (title, description, price,
tags) for a completed template, based on the original brief
and the template_type chosen during ANALYZING.

## Input
```json
{
  "brief": "original user brief",
  "template_type": "saas | dashboard | portfolio | ecommerce | blog",
  "demo_url": "live demo link"
}
```

## Output (JSON only, no prose)
```json
{
  "title": "Gumroad product title, under 60 characters",
  "description": "3-5 sentence sales description in plain language",
  "price": 0,
  "tags": ["3-6 lowercase tags"]
}
```

## Instructions to the model
- Write for a buyer browsing Gumroad, not a developer reading
  docs: focus on what the template lets someone do or launch
  quickly, not implementation details.
- Suggest a price based on comparable simple HTML/CSS/JS
  templates (typically $5-$25 range) unless config.json
  gumroad.defaultPrice overrides it.
- Do not claim features that weren't part of the brief or
  template_type (no "includes CMS" unless true, etc).
- Mention that a live demo is included, and reference demo_url
  as the demo link.
- Keep tags relevant to searchability on Gumroad (e.g.
  "html-template", "portfolio", "responsive") rather than
  generic marketing words.
