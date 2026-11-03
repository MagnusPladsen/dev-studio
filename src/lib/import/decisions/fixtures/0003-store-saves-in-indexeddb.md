---
status: accepted
date: 2026-02-03
tags: [storage, saves]
---
# Store saves in IndexedDB

## Context and Problem Statement

Saves with screenshots outgrew localStorage.

## Decision Drivers

* Room for screenshots
* Works offline

## Considered Options

* IndexedDB
* A server

## Decision Outcome

Chosen option: "IndexedDB", because it keeps working offline.

### Consequences

* Good, because saves can hold screenshots.
* Bad, because the API is clumsy.

## More Information

Supersedes ADR-0002.
