# P1 RESTRUCTURE & REVIEW

Build derived from the SFN-SLC-VIPPRO source tree in the supplied archive.

## Implemented
- AI Markdown rendering: bold/italic/headings/lists/quotes/code/links, escaped first to avoid raw HTML execution.
- AI source provenance badges: Internal / Sky First / Web.
- AI class context expanded from resource titles to up to 20 class resources and safe URLs.
- AI conversation context expanded from 12 to 30 recent messages.
- AI system prompt changed from generic assistant/search behavior toward tutoring behavior: diagnose intent, explain, check understanding, encourage retry, distinguish internal/official/web/inference.
- Classroom sidebar terminology reorganized for Vietnamese learning context; teacher-only areas remain role-gated.
- Calm sky-blue design tokens override the previous multi-color gradient system; classroom and general UI now share one visual direction.
- AI rich-text and source UI styled for readable educational responses.

## Structural decision
The returned ZIP uses SFN-SLC-VIPPRO as the only application root. The legacy outer source tree is not duplicated. Migration filenames are left unchanged in this P1 build to avoid silently changing already-applied D1 migration identity.

## Still requires runtime/production testing
P0 join/deep-link, real WebRTC/SFU, camera/mic permissions in in-app browsers, and production secrets cannot be proven by static validation.
