---
name: data-contract-semantics
description: Preserve field meaning when changing APIs, persisted data, retrieval, metrics or model output.
---

# Data-contract and semantic integrity

Trace the affected producer and consumer and preserve meaningful distinctions such as units, identity, absence, unknown values and revision. Use a focused mixed or negative case when it can expose a real risk; do not turn every possible malformed value into a release requirement. Preserve audit history and avoid presenting invented or stale values as observed facts.
