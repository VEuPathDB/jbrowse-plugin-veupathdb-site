# jbrowse-plugin-veupathdb-site

JBrowse 2 (v5) plugin for VEuPathDB site behaviour. Plugin name `VEuPathDBSite`,
UMD global `JBrowsePluginVEuPathDBSite`.

## Organism hub attach

A VEuPathDB root config declares every organism's assemblies (`<abbrev>` and
`<abbrev>_protein`) and no tracks; each organism's tracks live in its own hub, a
JBrowse 2 `config.json`. When any view shows an organism's genome or protein
assembly, the plugin attaches that organism's hub as a `JB2TrackHubConnection`,
once per session.

### Configuration

```json
{
  "configuration": {
    "VEuPathDBSite": {
      "hubUrlTemplate": "/jbrowse/hubs/{abbrev}.hub.json"
    }
  }
}
```

| slot             | type   | default | meaning                                                                                                                |
| ---------------- | ------ | ------- | ---------------------------------------------------------------------------------------------------------------------- |
| `hubUrlTemplate` | string | `""`    | URL of an organism's hub. `{abbrev}` is replaced by the organism abbreviation; relative URLs resolve against the page. |

- `{abbrev}` is the assembly name with a trailing `_protein` removed, so a
  genome view and a protein view of the same organism share one hub.
- The connection is `hub-<abbrev>`, named with the genome assembly's
  `displayName`, and lists whichever of `<abbrev>` / `<abbrev>_protein` the
  session knows. It is added to the session (`sessionConnections`), never to
  `config.json`, and skipped when the session already has that `connectionId` (a
  restored session).
- Unset: nothing is attached; one `console.info`. A template without `{abbrev}`:
  nothing is attached; one `console.warn`. The plugin never guesses a URL.
- A missing hub file shows JBrowse's connection error snackbar; the page stays
  usable.
- Restored sessions keep their hub connections dormant until the organism's
  track group is expanded (core's lazy `hydrateConnection`).

## Development

Node 24, pnpm 11.

```sh
pnpm install --frozen-lockfile
pnpm test        # jest
pnpm typecheck   # tsc --noEmit
pnpm lint        # eslint
pnpm build       # rollup UMD bundle -> dist/
pnpm serve       # repo root on :9005
```

### Manual QA against jbrowse-web

`test_config/` holds a root config with three organisms — `volvox` (the
jbrowse-components test genome plus a synthetic protein assembly), `synthA`
(synthetic genome and protein) and `nohub` (synthetic, no hub file) — and the
hubs of the first two under `test_config/hubs/`. The template is root-relative
(`/hubs/{abbrev}.hub.json`), so the hubs must be served on the page's origin:
run the jbrowse-components dev server on another port and put a proxy on :3000
that sends `/hubs/*` to `http://localhost:9005/test_config/hubs/*` and
everything else to the dev server.

```
http://localhost:3000/?config=http://localhost:9005/test_config/veupathdb-site-test.json
http://localhost:3000/?config=http://localhost:9005/test_config/veupathdb-site-test-unset.json
```

## Release

Push a `v*` tag; `.github/workflows/release.yml` builds, tests and attaches
`jbrowse-plugin-veupathdb-site-<version>.umd.production.min.js` (+ `.sha256`) to
the GitHub release.
