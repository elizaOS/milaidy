# Character Modal — HSR Chamfered Panel Styling

**Date:** 2026-02-22
**Status:** Approved

## Problem

The 4-tab card containers in CharacterView feel flat and generic — no game identity. Inputs and tag lists sit directly on the page with no visual panel enclosure.

## Design

Keep the existing gold `#d4af37` color system. Apply three new CSS classes modeled on Honkai Star Rail's character detail panel aesthetic:

### `.char-panel` — Main section wrapper
- `clip-path` chamfered corners (right-top + left-bottom diagonal cut)
- `background: linear-gradient(135deg, gold-tint 5%, near-black 92%)`
- `border-left: 3px solid gold-0.6` + thin gold border on other sides
- CSS `::before`/`::after` L-bracket corner decorations (top-right + bottom-left)
- Hover: faint gold box-shadow glow

### `.char-subpanel` — Column sub-containers (bio/adj/topics, style columns)
- `border: 1px solid gold-0.08` + `border-top: 2px solid gold-0.4` accent line
- `background: rgba(0,0,0,0.25)`
- No clip-path (inner panels stay rectangular)

### `.char-tag` — Tag badges inside TagEditor
- `border-left: 2px solid gold-0.5` + gold-tint bg
- Hover: gold glow shadow

## Files Changed

| File | Change |
|------|--------|
| `apps/app/src/styles/anime.css` | Add `.char-panel`, `.char-subpanel`, `.char-tag` |
| `apps/app/src/components/CharacterView.tsx` | Apply new classes to sectionCls, TagEditor container, tag badges |
