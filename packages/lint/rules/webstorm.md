---
type: always_apply
description: IDEA / WebStorm patterns
paths:
    - '**/.idea/**/*.xml'
    - '**/.idea/**/*.iml'
---

**ALL** IDEA / WebStorm projects must adhere to policy unless explicitly prohibited.

Preserve already existing settings, add what's safe, ask user how to merge if there are conflicts.

# Configure `.idea/%projectName%.iml`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<module type="WEB_MODULE" version="4">
    <component name="NewModuleRootManager">
        <content url="file://$MODULE_DIR$">
            <excludeFolder url="file://$MODULE_DIR$/.yarn" />
            <excludePattern pattern=".turbo" />
            <excludePattern pattern=".nx" />
            <excludePattern pattern="build" />
            <excludePattern pattern="coverage" />
            <excludePattern pattern="dist" />
        </content>
        <orderEntry type="inheritedJdk" />
        <orderEntry type="sourceFolder" forTests="false" />
    </component>
</module>
```

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
    <option name="myFilesPattern" value="{**/*,*}.{js,jsx,ts,tsx,cjs,cts,mjs,mts,md,mdx,htm,html,vue,css,scss,sass,less,yml,yaml,json,json5,graphql,graphqls,xml}" />
  </component>
</project>
```

# Configure `.idea/jsLinters/eslint.xml`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project version="4">
  <component name="EslintConfiguration">
    <files-pattern value="**/*.{js,jsx,ts,tsx,cjs,cts,mjs,mts,md,mdx,htm,html,vue}" />
    <option name="fix-on-save" value="true" />
  </component>
</project>
```

# Configure `.idea/vcs.xml`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project version="4">
  <component name="CommitMessageInspectionProfile">
    <profile version="1.0">
      <inspection_tool class="BodyLimit" enabled="true" level="WARNING" enabled_by_default="true">
        <option name="RIGHT_MARGIN" value="100" />
      </inspection_tool>
      <inspection_tool class="SubjectBodySeparation" enabled="true" level="WARNING" enabled_by_default="true" />
      <inspection_tool class="SubjectLimit" enabled="true" level="WARNING" enabled_by_default="true">
        <option name="RIGHT_MARGIN" value="100" />
      </inspection_tool>
    </profile>
  </component>
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

# Configure `.idea/jsonSchemas.xml`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project version="4">
  <component name="JsonSchemaMappingsProjectConfiguration">
    <state>
      <map>
        <entry key="Gemini CLI settings">
          <value>
            <SchemaInfo>
              <option name="name" value="Gemini CLI settings" />
              <option name="relativePathToSchema" value="https://raw.githubusercontent.com/google-gemini/gemini-cli/refs/heads/main/schemas/settings.schema.json" />
              <option name="applicationDefined" value="true" />
              <option name="patterns">
                <list>
                  <Item>
                    <option name="path" value=".gemini/settings.json" />
                  </Item>
                </list>
              </option>
            </SchemaInfo>
          </value>
        </entry>
        <entry key="Yarn Config (.yarnrc.yml)">
          <value>
            <SchemaInfo>
              <option name="name" value="Yarn Config (.yarnrc.yml)" />
              <option name="relativePathToSchema" value="https://yarnpkg.com/configuration/yarnrc.json" />
              <option name="applicationDefined" value="true" />
              <option name="patterns">
                <list>
                  <Item>
                    <option name="path" value=".yarnrc.yml" />
                  </Item>
                </list>
              </option>
            </SchemaInfo>
          </value>
        </entry>
      </map>
    </state>
  </component>
</project>
```

# Configure `indexLayout.xml`

Ban build directories from search using examples:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project version="4">
  <component name="UserContentModel">
    <attachedFolders />
    <explicitIncludes>
    </explicitIncludes>
    <explicitExcludes>
      <Path>path-to-eve/.eve</Path>
      <Path>path-to-vite/dist</Path>
      <Path>path-to-next/.next</Path>
    </explicitExcludes>
  </component>
</project>
```

# Git Worktrees

`.idea/%projectName%.iml`, `.idea/modules.xml` and `.idea/.name` are usually tracked. Every git worktree therefore checks out a module with the same name as the main checkout's, and WebStorm refuses to attach it: `Cannot attach project: Module name '%projectName%' already exists`.

- When creating a worktree, ALWAYS give it a distinct module and project name derived from the branch, e.g. `Packing Travel App` for `travel-app`:
    1. **Rename** — do not copy — `.idea/%projectName%.iml` to `.idea/%projectName% %Branch Title%.iml`. The module name is the file name, and attaching the worktree registers whichever `.iml` it finds: a copy beside the original still attaches as `%projectName%`.
    2. Point `.idea/modules.xml` at the renamed file.
    3. Write the same name into `.idea/.name`.
    4. A main project the worktree is attached to lists it in its own `.idea/modules.xml`: point that entry at the renamed file too.
- Keep the rename local, and NEVER commit it or merge it back:
    - The tracked `.iml` first: stage the branch's own edits to it (`git add .idea/%projectName%.iml`), then `git update-index --skip-worktree .idea/%projectName%.iml`, then rename. The staged content is what the branch commits; the rename never shows as a deletion. An edit the branch later makes to the renamed file has to be staged back the same way.
    - Ignore the renamed file in the shared `.git/info/exclude` with the pattern `.idea/%projectName% *.iml`.
    - A **tracked** `.idea/modules.xml` or `.idea/.name`: run `git update-index --skip-worktree` on it.
    - An **untracked** one (often `modules.xml` is in `.idea/.gitignore` and `.name` does not exist yet): `skip-worktree` fails on it, so leave it to `.idea/.gitignore` or add it to the shared `.git/info/exclude` as well (e.g. `.idea/.name`).
    - Verify with `git status --short .idea`: nothing from the rename is listed, only the staged edits.
- Before a rebase, merge or checkout that updates those files (tracked ones only):
    1. Rename the `.iml` back and run `git update-index --no-skip-worktree` on every file marked above.
    2. Restore them with `git checkout -- <files>`.
    3. Redo the rename afterwards.
- A worktree created **inside** the main checkout (e.g. `.claude/worktrees/<name>`, where agents put theirs) is indexed by the main project as part of itself, a second copy of every source and `node_modules`, and the main project's save actions start reformatting the worktree's files. Exclude its folder in the main checkout's `.idea/%projectName%.iml` (`<excludeFolder url="file://$MODULE_DIR$/.claude/worktrees" />`) and list it in `.gitignore`, so the folder rule under [GitIgnore](#gitignore) holds. Attaching such a worktree can replace the main checkout's own entry in its `.idea/modules.xml`: keep both — the main `.idea/%projectName%.iml` and the worktree's renamed one — then reload the project. A nested worktree shows as its own module node inside the tree, not as a separate top-level project; for a top-level entry, create the worktree outside the main checkout.
