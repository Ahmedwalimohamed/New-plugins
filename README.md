# ChatGPT Skills Library

A small library of reusable ChatGPT/Codex skills.

## Included skills

### no-ai-slop

Source: https://github.com/petergyang/no-ai-slop

Purpose: Edit drafts into sharper, more human writing while preserving the writer's voice, or detect common AI-slop patterns without guessing authorship.

Upstream author: Peter Yang  
License: MIT

Files are kept under `skills/no-ai-slop/` with the upstream license in `licenses/no-ai-slop-LICENSE`.

### design-taste-frontend

Source: https://github.com/tasteskill/tasteskill

Purpose: Push AI-generated frontend work away from generic layouts with deliberate typography, layout variance, motion, component architecture, responsive fallbacks, and anti-slop visual rules.

License: MIT

Files are kept under `skills/design-taste-frontend/` with the upstream license in `licenses/design-taste-frontend-LICENSE`.

### frontend-design

Source: https://github.com/PracticalSwan/agent-skills/tree/main/frontend-design

Purpose: Production-oriented frontend design with accessibility, responsive behavior, complete UI states, performance guardrails, contextual art direction, and rendered verification.

License: MIT AND Apache-2.0, with third-party notices retained.

Files are kept under `skills/frontend-design/`, including its accessibility checklist and upstream license/notice files.

### ui-ux-design

Source: https://github.com/arvindand/agent-skills/tree/main/skills/ui-ux-design

Purpose: Practical UI/UX implementation guidance covering strong visual direction, semantic HTML, accessibility, interaction states, mobile-first layouts, palettes, typography, spacing, and component patterns.

Upstream author: Arvind Menon  
License: MIT

Files are kept under `skills/ui-ux-design/` with its reference guide and upstream license in `licenses/ui-ux-design-LICENSE`.

### web-interface-guidelines

Source: https://github.com/vercel-labs/web-interface-guidelines

Purpose: Audit frontend code against detailed interface rules covering accessibility, focus, forms, animation, typography, content, performance, responsive behavior, and visual quality.

Upstream author: Vercel Labs  
License: MIT

Files are kept under `skills/web-interface-guidelines/` with the upstream license in `licenses/web-interface-guidelines-LICENSE`.

## Recommended design workflow

1. Use `design-taste-frontend` to establish the visual direction and avoid generic AI-looking layouts.
2. Use `frontend-design` or `ui-ux-design` to implement the interface with production UX, accessibility, responsive behavior, and complete states.
3. Run `web-interface-guidelines` as the final audit before shipping.
