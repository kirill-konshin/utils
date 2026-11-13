---
type: always_apply
description: Security rules for every project
---

- A form that carries a password, token or other secret ALWAYS submits with POST: `<form action={serverAction}>` gets it from React, every other form sets `method="post"` explicitly, also when JavaScript handles the submit — a submit before hydration is the browser's own, and its default GET puts the secret in the URL
- NEVER put credentials or secrets in a URL: query strings, redirects, links and request logs keep them
