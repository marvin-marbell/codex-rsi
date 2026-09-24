---
name: gitops-release-verification
description: Verify revisions and consumer behavior through commit, review, merge, package, install or deployment.
---

# GitOps release verification

Keep revision identity across transitions that matter: source branch/base/head, merged commit, built or packed contents, installed entrypoint, served revision and recipient. Code in a checkout does not prove package inclusion; a passing bundle does not prove cold platform launch; a merge does not prove activation.

At each handoff, ask what the next consumer receives. Exercise the documented install command and supported runtime when claiming installability; inspect served asset/body and representative real data when claiming deployment. For a timer, require future schedule and observed tick; for a message, distinguish composition, submission, queue disposition and acknowledgement. Confirm external mutations by readback rather than trusting CLI exit or HTTP 200.

Preserve unrelated state, backup/rollback and permissions. Scoped stacked-phase approval may precede whole-stack readiness. If an owner still needs to activate, accept risk, pick a destination or ship an off-host copy, name that owner and stop the claim at the observed boundary. Never merge or deploy merely because review is green.
