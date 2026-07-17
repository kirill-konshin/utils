---
type: always_apply
description: IDEA / WebStorm patterns
paths:
    - '**/.idea/**/*.xml'
---

**ALL** IDEA / WebStorm projects must adhere to policy unless explicitly prohibited.

# Configure `.idea/jsLibraryMappings.xml`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project version="4">
  <component name="JavaScriptLibraryMappings">
    <includedPredefinedLibrary name="Node.js Core" />
  </component>
</project>
```

# Configure `.idea/prettier.xml`

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

# Configure `.idea/jsLinters/eslint.xml`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project version="4">
  <component name="EslintConfiguration">
    <files-pattern value="**/*.{js,ts,jsx,tsx,cjs,cts,mjs,mts,htm,html,vue}" />
    <option name="fix-on-save" value="true" />
  </component>
</project>
```

# Configure `.idea/vcs.xml`

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

# Configure `.idea/tailwindcss.xml`

Applies if project is using Tailwind.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project version="4">
  <component name="TailwindSettings">
    <option name="lspConfiguration" value="{&#10;  &quot;inspectPort&quot;: null,&#10;  &quot;emmetCompletions&quot;: false,&#10;  &quot;classAttributes&quot;: [&quot;class&quot;, &quot;className&quot;, &quot;activeClassName&quot;, &quot;disabledClassName&quot;, &quot;ngClass&quot;, &quot;class:list&quot;],&#10;  &quot;classFunctions&quot;: [],&#10;  &quot;codeActions&quot;: true,&#10;  &quot;codeLens&quot;: true,&#10;  &quot;hovers&quot;: true,&#10;  &quot;suggestions&quot;: true,&#10;  &quot;validate&quot;: true,&#10;  &quot;colorDecorators&quot;: true,&#10;  &quot;rootFontSize&quot;: 16,&#10;  &quot;lint&quot;: {&#10;    &quot;cssConflict&quot;: &quot;warning&quot;,&#10;    &quot;invalidApply&quot;: &quot;error&quot;,&#10;    &quot;invalidScreen&quot;: &quot;error&quot;,&#10;    &quot;invalidVariant&quot;: &quot;error&quot;,&#10;    &quot;invalidConfigPath&quot;: &quot;error&quot;,&#10;    &quot;invalidTailwindDirective&quot;: &quot;error&quot;,&#10;    &quot;invalidSourceDirective&quot;: &quot;error&quot;,&#10;    &quot;recommendedVariantOrder&quot;: &quot;warning&quot;,&#10;    &quot;usedBlocklistedClass&quot;: &quot;warning&quot;&#10;  },&#10;  &quot;showPixelEquivalents&quot;: true,&#10;  &quot;includeLanguages&quot;: {&#10;    &quot;ftl&quot;: &quot;html&quot;,&#10;    &quot;jinja&quot;: &quot;html&quot;,&#10;    &quot;jinja2&quot;: &quot;html&quot;,&#10;    &quot;smarty&quot;: &quot;html&quot;,&#10;    &quot;tmpl&quot;: &quot;gohtml&quot;,&#10;    &quot;cshtml&quot;: &quot;html&quot;,&#10;    &quot;vbhtml&quot;: &quot;html&quot;,&#10;    &quot;razor&quot;: &quot;html&quot;&#10;  },&#10;  &quot;files&quot;: {&#10;    &quot;exclude&quot;: [&#10;      &quot;**/.git/**&quot;,&#10;      &quot;**/.hg/**&quot;,&#10;      &quot;**/.svn/**&quot;,&#10;      &quot;**/node_modules/**&quot;,&#10;      &quot;**/.yarn/**&quot;,&#10;      &quot;**/.venv/**&quot;,&#10;      &quot;**/venv/**&quot;,&#10;      &quot;**/.next/**&quot;,&#10;      &quot;**/.parcel-cache/**&quot;,&#10;      &quot;**/.svelte-kit/**&quot;,&#10;      &quot;**/.turbo/**&quot;,&#10;      &quot;**/__pycache__/**&quot;&#10;    ]&#10;  },&#10;  &quot;experimental&quot;: {&#10;    &quot;configFile&quot;: null,&#10;    &quot;classRegex&quot;: [&#10;        &quot;Classes\\s*=\\s*['\&quot;`]([^'\&quot;`]*?)['\&quot;`]&quot;, &quot;['\&quot;`]([^'\&quot;`]*?)['\&quot;`]&quot;,&#10;        &quot;Styles\\s*=\\s*['\&quot;`]([^'\&quot;`]*?)['\&quot;`]&quot;, &quot;['\&quot;`]([^'\&quot;`]*?)['\&quot;`]&quot;&#10;    ]&#10;  }&#10;}" />
  </component>
</project>
```
