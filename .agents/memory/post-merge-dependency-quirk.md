---
name: Post-merge dependency quirk
description: Imported backend requirements include a package unavailable from Replit's package index.
---

The post-merge setup must exclude `emergentintegrations==0.2.0` when installing the current backend requirements because that package is not available from Replit's package index and is not imported by the backend.

**Why:** A strict requirements install caused every task merge setup to fail before frontend dependencies could be installed.

**How to apply:** Keep the source requirement file unchanged for compatibility, but filter that unavailable entry in the idempotent post-merge install script unless the package becomes available or the backend begins importing it.