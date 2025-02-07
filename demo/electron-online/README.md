Make sure `soundcloud-tracker-web` is in dev dependencies, since otherwise all of it's contents will be treated as normal Node / Electron dependency.
`

Also make sure` isomorphic-unfetch` is not hoisted in `soundcloud-tracker-auth`.

`"postinstall="lerna link"` is needed to make packager to see dependencies
