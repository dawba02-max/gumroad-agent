# Analyze Brief Prompt

Used by: agent_manager (objective_analyzer.js / prompt_builder.js)
Called during: ANALYZING state

## Purpose
Convert the user's raw one-line brief into structured build
parameters that builder_agent/ngen.js can consume directly.

## Input
A raw string from the user, e.g.:
  "SaaS dashboard template, dark mode"
  "portfolio site for a photographer, minimal"

## Output (JSON only, no prose)
```json
{
  "template_type": "saas | dashboard | portfolio | ecommerce | blog",
  "title": "short product title",
  "description": "1-2 sentence description of the site's purpose",
  "activePage": "which nav page should be active by default, e.g. Home",
  "body": "key sections/content to include, comma separated",
  "filename": "kebab-case filename for the generated page"
}
```

## Instructions to the model
- Pick template_type from the existing prompts/ set in
  builder_agent (blog.md, dashboard.md, ecommerce.md,
  portfolio.md, saas.md). If the brief doesn't clearly map to
  one, default to "portfolio".
- Keep title short enough to work as a Gumroad product title
  (under 60 characters).
- Do not invent pricing or marketing copy here — that happens
  later in listing_copy.md, after the demo exists.
- If the brief is ambiguous (e.g. missing a clear purpose),
  make a reasonable assumption and note it in a "notes" field
  rather than asking a clarifying question — this step runs
  unattended.
