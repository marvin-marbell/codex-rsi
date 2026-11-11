---
name: security-identity-transitions
description: Review material authorization, privacy and session-identity transitions.
---

# Security and identity transitions

Identify the actual actor, protected resource, authority and commit boundary. Preserve authentication, authorization, privacy choices and legitimate retry or recovery. Where the change makes ordering or identity races material, check the relevant affected paths rather than treating every hypothetical race as a release blocker.

A finding should explain a concrete trigger and consequence or a material risk that applies to the requested behavior. Keep diagnostics and shared evidence free of secrets. Use the user's existing authorization for the requested action; do not invent an independent approval hierarchy.
