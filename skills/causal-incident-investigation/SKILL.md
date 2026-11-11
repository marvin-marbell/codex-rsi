---
name: causal-incident-investigation
description: Investigate failures that may cross runtime, data, transport, cache or process boundaries.
---

# Causal incident investigation

Locate the user-visible failed transition before naming a root cause. Trace the shortest path from source through decision, state mutation, transport and consumer; label each link observed, inferred or merely reported. A healthy upstream process does not prove the downstream branch ran.

When existing evidence leaves an actionable uncertainty, choose a focused probe that distinguishes plausible causes. Use a positive control when it is needed to interpret a negative search. Distinguish a stale snapshot from fresh-but-excluded index content, a bad backend from a broken route, and a callback from committed state. If a test fails during setup, it has not exercised the intended defect. Inspect actual runtime identity, selected files, package version and exit status where relevant to the failure.

Use the existing reproduction when available, fix the owning boundary, and validate changed behavior in proportion to the risk. Sweep siblings when the class is silent or recurrent, not as a universal ritual. Withdraw a refuted hypothesis and name what remains unobserved.
