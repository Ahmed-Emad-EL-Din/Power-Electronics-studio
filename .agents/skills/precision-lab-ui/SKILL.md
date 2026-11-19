---
name: precision-lab-ui
description: Design-engineering skill for Power Electronics Studio (VoltCraft). Synthesizes Anthropic frontend-design, Vercel Web Interface Guidelines, Leonxlnx taste-skill (Cockpit Density 8–10), and UI/UX Pro Max semantic design tokens for professional EDA/CAD instrument UIs.
sources:
  - https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md
  - https://github.com/vercel-labs/web-interface-guidelines/blob/main/command.md
  - https://github.com/Leonxlnx/taste-skill
  - https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
---

# Precision Lab UI Skill

## 1. Aesthetic Direction — Hardware CAD / Test Instrument Cockpit
- **Visual Density**: Level 8–9 (*Engineering Cockpit*). Compact, disciplined spacing (`4px` / `8px` grid), crisp `1px` structural hairlines, zero SaaS marketing card bloat, zero decorative neon glows, zero outer drop-shadow soup.
- **Subject Grounding**: Take inspiration from Keysight PathWave, Rohde & Schwarz scopes, Altium Designer, and Linear — calm neutral slate/graphite surfaces where **color is reserved for electrical meaning** (channel traces, pass/warn/danger margins, active phase/stage).
- **No Generic AI Defaults**:
  - Never use pure `#000000` (causes OLED halation) or pure `#FFFFFF` glare canvases.
  - Never apply `transition: all` (list explicit properties: `transition-colors`, `transition-transform`).
  - Never add decorative ALL-CAPS eyebrow labels or redundant gradient text headlines.
  - Never repeat identical charts or metric cards across adjacent tabs ("One Canonical Home per Tool").

## 2. Semantic Token Contract (Light + Dark Parity)
Always style via CSS custom properties (`--bg-canvas`, `--bg-panel`, `--bg-elevated`, `--bg-inset`, `--border-hairline`, `--border-strong`, `--text-primary`, `--text-secondary`, `--text-muted`, `--accent-brand`, `--status-pass`, `--status-warn`, `--status-danger`) rather than hardcoded legacy hex backgrounds (`#111827`, `#0B0E17`, etc.).
- **Typography**:
  - UI & prose: `'IBM Plex Sans'` (`font-feature-settings: "cv02", "cv03", "cv04", "cv11"`).
  - Engineering numbers, units, tables, and cursor readouts: `'IBM Plex Mono'` with `font-variant-numeric: tabular-nums` so numbers never jitter when scrubbing sliders or cursors.
- **Contrast**: WCAG AA minimum (`>= 4.5:1` body text, `>= 3:1` UI borders & chart axes) verified in both Light and Dark themes.

## 3. Accessibility & Interaction Gates (Vercel Web Interface Guidelines)
- Icon-only buttons (`Undo`, `Redo`, `Close`, `Theme`, `Pin`) MUST include `aria-label`.
- Interactive actions MUST use `<button>` (not clickable `<div>`/`<span>`).
- Every control MUST expose `:focus-visible` ring (`2px solid var(--accent-brand)`), never bare `outline: none`.
- Modals and side drawers MUST set `overscroll-behavior: contain` and support `Esc` close.
- Loading labels end with ellipsis `…` (`Searching…`, `Recalculating…`); honor `prefers-reduced-motion`.
- Large part tables (`> 50` rows) must paginate or virtualize (`content-visibility: auto`) with no layout thrashing (`getBoundingClientRect` outside event/ResizeObserver callbacks).
