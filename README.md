<p align="center">
  <img alt="Logo" src="public/logo.png" width="144"/>
</p>

# MkDocsEditor-Web

Web client for [MkDocsEditor](https://github.com/MkDocsEditor): browse and edit an MkDocs wiki
together, in real time, from a phone or a desktop browser. It talks to the
[MkDocsEditor backend](https://github.com/MkDocsEditor/MkDocsEditor-Backend).

## Features

- Sign in with the users configured in the backend (readers, editors, admins).
- Browse the wiki as a folder tree, search pages and folders (Ctrl+K), create, rename and
  delete pages and folders.
- Upload files into a folder (menu or drag and drop). Paste or drop an image into the editor
  and it is uploaded next to the page and embedded.
- Edit together in real time: the Markdown editor (CodeMirror 6) syncs with
  [Automerge](https://automerge.org). Everyone sees the others' cursors and selections with
  names and colours, plus a list of who is online.
- Editing works offline. Changes are kept in the browser and merged after the reconnect, even
  when the server lost its state meanwhile. The connection state is always visible, and text
  is never thrown away silently.
- "Who wrote what?" highlights who wrote which part of a page.
- Version history (when the backend has git enabled): see what each version changed, compare
  it with the current text, and restore it.
- Preview close to MkDocs Material: admonitions, task lists, footnotes, tables, definition
  lists, code highlighting, and images and links relative to the page. Edit, split and preview
  modes.
- The file browser updates live when pages change elsewhere, and shows who has which page
  open.
- Link to the published wiki page (optional).
- Works on phones and desktops, light and dark mode. The interface is in English.

## Backend

The client needs the [MkDocsEditor backend](https://github.com/MkDocsEditor/MkDocsEditor-Backend)
with sync protocol v1 (see its `docs/sync-protocol.md`). Configure users in the backend
(`server.auth.users`, passwords from `mkdocsrest hash-password`). For the version history,
set `git.enabled: true` and keep the wiki in a git repository.

The browser talks to the backend directly, so the backend URL must be reachable from the
users' browsers. A reverse proxy in front of the backend must pass websocket upgrades for
`/document/{id}/ws/` and `/events/ws/`.

## Configuration

The app reads `config.json` next to `index.html` at start:

```json
{
  "backendUrl": "https://mkdocs-api.example.com",
  "wikiUrl": "https://wiki.example.com"
}
```

| Key          | Docker variable            | Meaning                                                                    |
| ------------ | -------------------------- | -------------------------------------------------------------------------- |
| `backendUrl` | `MKDOCSEDITOR_BACKEND_URL` | Base URL of the backend                                                    |
| `wikiUrl`    | `MKDOCSEDITOR_WIKI_URL`    | Base URL of the published wiki, for the "View in the wiki" link (optional) |

For local development, copy `public/config.example.json` to `public/config.json` (ignored by
git), or set `VITE_BACKEND_URL` and `VITE_WIKI_URL`.

## Docker

```bash
docker run -d -p 8080:8080 \
  -e MKDOCSEDITOR_BACKEND_URL=https://mkdocs-api.example.com \
  -e MKDOCSEDITOR_WIKI_URL=https://wiki.example.com \
  mkdocseditor/mkdocseditor-web:latest
```

The image is based on `nginx-unprivileged`, runs as uid 101 and listens on port 8080. At
start it writes `config.json` from the environment to `/tmp`, so a read-only root file
system works when `/tmp` is writable. `/healthz` answers `ok` for health checks. Unknown
paths fall back to `index.html`, so deep links work. Pushes to `master` publish
`mkdocseditor/mkdocseditor-web:latest` on Docker Hub.

To build the image yourself: `docker build -t mkdocseditor-web .`

## Development

Requirements: Node.js 22, and Go plus git for the end-to-end tests.

```bash
npm install
npm run dev          # dev server on http://localhost:5173
npm run lint         # ESLint
npm run format:check # Prettier
npm run type-check   # vue-tsc
npm run test:unit    # Vitest (unit and component tests)
npm run test:e2e     # Playwright against a real backend, see below
npm run build        # type-check and production build into dist/
```

Stack: Vue 3, Vite, TypeScript (strict), Vue Router, Pinia, Vuetify, CodeMirror 6,
Automerge, markdown-it.

### Code layout

| Path                            | Contents                                                                         |
| ------------------------------- | -------------------------------------------------------------------------------- |
| `src/api/`                      | REST client and types                                                            |
| `src/stores/`                   | Pinia stores: auth, tree, live updates, notifications                            |
| `src/sync/`                     | Automerge session: sync protocol, offline copy (IndexedDB), presence, authorship |
| `src/editor/`                   | CodeMirror editor, its binding to the session, remote cursors, uploads           |
| `src/markdown/`                 | Preview rendering (markdown-it with MkDocs extensions)                           |
| `src/views/`, `src/components/` | Pages and UI components                                                          |
| `e2e/`                          | Playwright tests and the test backend setup                                      |

### End-to-end tests

`npm run test:e2e` builds the app, builds the backend, starts it with a small German test
wiki (a git repository) and three users (admin, editor, reader), and runs the tests in a
desktop and a phone browser. Run `npx playwright install chromium` once.

| Variable           | Default            | Meaning                                                     |
| ------------------ | ------------------ | ----------------------------------------------------------- |
| `E2E_BACKEND_BIN`  |                    | Use this backend binary instead of building one             |
| `E2E_BACKEND_DIR`  | `e2e/.tmp/backend` | Backend checkout to build (cloned from GitHub when missing) |
| `E2E_BACKEND_LOG`  |                    | Write the backend log to this file                          |
| `E2E_BACKEND_PORT` | `17414`            | Port of the test backend                                    |
| `E2E_WEB_PORT`     | `4174`             | Port of the app under test                                  |

CI runs the same tests against the backend's `master`.

# License

AGPLv3+
