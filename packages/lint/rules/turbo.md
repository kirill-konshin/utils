---
type: always_apply
description: Set of rules for MONOREPO projects which use Turbo or NX
paths:
    - '**/turbo.json'
    - '**/package.json'
---

# Root

```jsonc
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["tsconfig.json"],
  "tasks": {

    // define task defaults

    "build": {},
    "wait": {
      "cache": false
    },
    "test": {
      "outputs": ["coverage/**/*"]
    },
    "start": {
      "persistent": true,
      "cache": false
      "dependsOn": ["^wait"]
    },

    // root tasks

    "//#lint": {
      "cache": false
    },
  }
}
```

# Leaf

```jsonc
{
    "$schema": "https://turbo.build/schema.json",
    "extends": ["//"],
    "tasks": {
        "build:demo": {
            "dependsOn": ["^build"],
            // list minimal amount of inputs & outputs
            "inputs": ["$TURBO_DEFAULT$", "src/**/*", "assets/**/*"],
            "outputs": ["dist/**/*"],
            // list all ENV that affect build and must invalidate cache
            "env": ["CSC_KEY_PASSWORD", "CSC_IDENTITY_AUTO_DISCOVERY"],
        },
    },
}
```
