---
name: product-runtime-acceptance
description: Verify results depending on browser, mobile, native, accessibility, rendered content or customer interaction.
---

# Product runtime acceptance

Name the actual audience and surface: viewport/device, route, cold launch, initial HTTP document, hydrated UI, assistive tree or physical native behavior. Source strings, props, screenshots and mock handlers prove narrower properties. Validate reference inputs before comparing parity; use real data rather than injecting the feature being checked.

Follow a complete journey: initial state, gesture/keyboard or request, state change, authoritative server result and visible final state. Observe transitions where remount, responsive breakpoint, zoom, scroll owner or async completion can change the actor. A green component test cannot settle a device-only crash or unresolved backend eligibility. Equally, do not demand every device for an unrelated local edit.

Separate mechanical defects from product decisions. Do not fabricate labels, marketing claims, selected options or data to make a design look complete. Record accepted accessibility/visual limitations as ongoing limitations with an owner, not as passed checks.
