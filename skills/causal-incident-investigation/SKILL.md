---
name: causal-incident-investigation
description: Investigate failures that may cross runtime, data, transport, cache or process boundaries.
---

# Causal incident investigation

Locate the user-visible failed transition before naming a root cause. Trace the shortest path from source through decision, state mutation, transport and consumer; label each link observed, inferred or merely reported. A healthy upstream process does not prove the downstream branch ran.

Choose one cheap probe that makes competing causes predict different results. Pair a negative search with a positive control on the same source. Distinguish a stale snapshot from fresh-but-excluded index content, a bad backend from a broken route, and a callback from committed state. If a test fails during setup, it has not exercised the intended defect. Check actual runtime identity, selected files, package version and terminal exit before changing configuration.

Reproduce the original symptom in the relevant environment, fix the owning boundary, and repeat that path. Sweep siblings when the class is silent or recurrent, not as a universal ritual. Withdraw a refuted hypothesis and name what remains unobserved.
