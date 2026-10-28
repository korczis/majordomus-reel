---
id: project.ui-uses-flowbite-pro
version: 1
kind: rule
title: Every user interface is built on Flowbite Pro
description: Every UI this repository builds or generates uses the owner's licensed Flowbite Pro shell, blocks and components on Tailwind.
statement: Build every user interface in this repository on the owner's licensed Flowbite Pro, starting from the matching Pro template or block, and review every UI change for Pro fidelity; no other UI kit and no ad-hoc component styling.
status: active
class: blocking
depends_on: []
tags: [ui, flowbite, design-system]
---

# Rationale

The owner holds a Flowbite Pro licence and requires it in every project (decision of 2026-10-28):
one design system across products, and no reinventing components the licence already pays for.

# Required behaviour

- Sources: `~/dev/poppyhead/assets/vendor/flowbite/` (admin shell, Pro dashboards, application and
  publisher blocks) and the owner's adaptation in
  `~/dev/poppyhead/lib/poppyhead_web/components/layouts/flowbite.html.heex`; the Claude Code skill
  `flowbite-pro` condenses them and carries a worked example.
- New or changed UI starts from the matching Pro template or block (shell, page header, cards,
  tables, tabs, drawers, empty states, forms, auth) and adapts its markup and class lists, on
  Tailwind with Flowbite JS (or the framework binding the Pro template uses).
- Native mobile UI follows the same visual language where the platform allows.
- Pro source files are never published verbatim.

# Failure behaviour

A UI change that does not follow Flowbite Pro is a review finding and is reworked before it lands.

# Verification

`node ~/.claude/skills/flowbite-pro/verify.mjs <repository>` checks for Flowbite, Tailwind, other
UI kits and this rule; a reviewer compares each UI change with the Pro template it starts from.
