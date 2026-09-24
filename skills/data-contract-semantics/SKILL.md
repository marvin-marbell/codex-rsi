---
name: data-contract-semantics
description: Verify field meanings when changing APIs, persisted data, retrieval, metrics or model output.
---

# Data-contract and semantic integrity

Find the customer-facing source, not a similarly named legacy table or convenient cache. Trace producer, response, mutation, storage, cache key, consumer and in-flight migration. Give each fact one owner: a GET may own available methods while a POST owns only selection; a model should not emit deterministic identifiers or scores unavailable in its inputs.

Ask what every value means before celebrating arithmetic or parsing: unit, denominator, currency, per-row language, null versus omitted, unknown versus zero, long versus short, old versus new identity, and actual upstream page size. Use a mixed case or malformed sibling to expose false success. Localize compatibility to the endpoint whose contract permits it; never convert malformed data into empty success.

Exercise real response shapes and negative transitions. Read back consumer-visible projection, not only a writer return. Preserve historical audit rows without serving stale fields as current truth. If provider semantics or product eligibility are absent, identify the owner rather than inventing them from UI examples.
