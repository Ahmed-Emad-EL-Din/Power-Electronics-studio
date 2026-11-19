# Power Electronics Studio — AI Agent Skills Index

Curated, verified, and domain-adapted AI coding agent skills synthesized from open-source GitHub skill repositories and technical engineering references. Any AI agent working in this repository should read the relevant `SKILL.md` before modifying UI, LCSC sourcing, or control-loop solver code.

| Skill | File | Upstream Sources | Use When |
| --- | --- | --- | --- |
| `precision-lab-ui` | [`.agents/skills/precision-lab-ui/SKILL.md`](./precision-lab-ui/SKILL.md) | `anthropics/skills` (`frontend-design`), `vercel-labs/agent-skills` (`web-design-guidelines`), `Leonxlnx/taste-skill`, `nextlevelbuilder/ui-ux-pro-max-skill` | Styling, color tokens, layout hierarchy, accessibility, dark/light parity, anti-AI-slop rules |
| `unslop` | [`.agents/skills/unslop/SKILL.md`](./unslop/SKILL.md) | `heydamir/unslop` (CC-BY-4.0, Damir Sokolovsky) | 9-pass redline design polish: spacing (4px scale), neutral ramp + quiet chrome, icons, copy, type, layout, details, visuals, motion |
| `lcsc-live-sourcing` | [`.agents/skills/lcsc-live-sourcing/SKILL.md`](./lcsc-live-sourcing/SKILL.md) | `tscircuit/jlcsearch`, `hashgraph-online/awesome-codex-plugins` (`aklofas/kicad-happy` `lcsc`, `jlcpcb`, `bom`) | Live LCSC/JLCPCB part search, stock/price enrichment, datasheet PDF resolution, BOM export |
| `pcmc-type2-control` | [`.agents/skills/pcmc-type2-control/SKILL.md`](./pcmc-type2-control/SKILL.md) | R. B. Ridley (1990), TI `SLVA662` & `SPRABE7A`, NXP `AN4716`, `switchmode.io` Part 1 & 2 | Peak Current-Mode Control (PCMC) plant modeling, slope compensation, Op-Amp & OTA Type-II design, Tustin 2P2Z |
