# Review Message Template

Used by: communication_agent (telegram_send)
Called during: AWAITING_REVIEW state

## Purpose
Notify the user that a new template is built, deployed, and
packaged, and is waiting for an approve/reject decision before
it publishes to Gumroad.

## Message template
```
New product ready for review — job {{job_id}}

Brief: {{brief}}
Type: {{template_type}}

Demo: {{demo_url}}

Listing draft:
  Title: {{listing_draft.title}}
  Price: ${{listing_draft.price}}
  Tags: {{listing_draft.tags joined by comma}}

{{listing_draft.description}}

Reply:
  "yes" or "approve" -> publish to Gumroad as-is
  "no" or "reject"   -> discard this job
  "revise: <notes>"  -> send back for another build pass
```

## Reply handling (communication_agent webhook)
communication_agent's telegram_receive should route replies
matching this job's pending review back into workflow.js:

- /^(yes|approve)$/i          -> `node workflow.js approve <job_id>`
- /^(no|reject)$/i            -> `node workflow.js reject <job_id>`
- /^revise:\s*(.+)$/i         -> `node workflow.js reject <job_id> "<notes>"`
                                  (revision notes get stored in
                                  job.revision_notes and fed back
                                  into ANALYZING on the next run)

## Notes for implementation
- Track which job_id a pending Telegram message refers to
  (e.g. a small "pending_review" map keyed by chat_id) since a
  user may have more than one job awaiting review at once.
- reviewTimeoutMinutes in config.json can be used to auto-remind
  or auto-expire a stale review request; not enforced by
  workflow.js itself yet.
