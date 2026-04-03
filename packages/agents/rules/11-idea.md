---
type: always_apply # or agent_requested
description: IDEA / WebStorm patterns # Required for agent_requested
---

_EVERY_ IDEA / WebStorm project must adhere to policy unless explicitly prohibited in comment before the action or workflow definition.

# Configure `.idea/jsLibraryMappings.xml`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project version="4">
  <component name="JavaScriptLibraryMappings">
    <includedPredefinedLibrary name="Node.js Core" />
  </component>
</project>
```

# Configure `prettier.xml`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project version="4">
  <component name="PrettierConfiguration">
    <option name="myConfigurationMode" value="AUTOMATIC" />
    <option name="myRunOnSave" value="true" />
    <option name="myRunOnReformat" value="true" />
    <option name="myFilesPattern" value="{**/*,*}.{js,ts,jsx,tsx,cjs,cts,mjs,mts,htm,html,vue,css,scss,sass,less,md,yml,json}" />
  </component>
</project>
```

# Configure `jsLinters/eslint.xml`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project version="4">
  <component name="EslintConfiguration">
    <files-pattern value="**/*.{js,ts,jsx,tsx,cjs,cts,mjs,mts,htm,html,vue}" />
    <option name="fix-on-save" value="true" />
  </component>
</project>
```

# Configure `vcs.xml`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project version="4">
  <component name="GitSharedSettings">
    <option name="FORCE_PUSH_PROHIBITED_PATTERNS">
      <list />
    </option>
  </component>
  <component name="VcsDirectoryMappings">
    <mapping directory="$PROJECT_DIR$" vcs="Git" />
  </component>
</project>
```

# GitIgnore

Folders defined in `.gitignore` should match with `.idea/%project_name%.iml` (usually only one IML file).

## Configure `.idea/.gitignore`:

```gitignore
# Default ignored files
/shelf/
/workspace.xml
# Editor-based HTTP Client requests
/httpRequests/
AugmentWebviewStateStore.xml
```

# Configure `.idea/codeStyles/codeStyleConfig.xml`

```xml
<component name="ProjectCodeStyleConfiguration">
  <state>
    <option name="PREFERRED_PROJECT_CODE_STYLE" value="DiS" />
  </state>
</component>
```
