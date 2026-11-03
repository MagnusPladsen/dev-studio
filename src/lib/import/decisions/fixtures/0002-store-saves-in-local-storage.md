# 2. Store saves in local storage

Date: 2026-01-20

## Status

Superseded by [3. Store saves in IndexedDB](0003-store-saves-in-indexeddb.md)

## Context

Players need their progress kept between sessions.

## Decision

Save games go to localStorage as JSON.

## Consequences

Simple, but limited to about 5 MB.
