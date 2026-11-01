<p align="center">
  <img alt="Logo" src="public/logo.png" width="144"/>
</p>

# MkDocsEditor-Web

Web client for [MkDocsEditor](https://github.com/MkDocsEditor): browse and edit an MkDocs wiki
together, in real time, from a phone or a desktop browser. It talks to the
[MkDocsEditor backend](https://github.com/MkDocsEditor/MkDocsEditor-Backend).

## Features

- Accounts with roles (readers, editors, admins): sign in with a password, optionally with a
  code from an authenticator app (TOTP) and recovery codes, or with a passkey. Works with
  password managers such as Bitwarden (passwords, passkeys and TOTP codes).
  After a sign-in without a passkey, the client suggests creating one ("Later" pauses the
  suggestion for a few days).
- New accounts by invite link only; the first admin comes from a one-time setup link. A
  forgotten password is reset with a single-use link from an admin. No email needed.
- Account page: profile and colour, password, authenticator app, recovery codes, passkeys,
  and the signed-in devices (sign out one or all others).
- Connect the Android app: Account → Devices creates a single-use link (5 minutes), shown as
  a QR code to scan with the phone's camera. On a phone, the first sign-in offers to open the
  app directly. Links the app does not take land on `/connect`, which explains how to install
  the app with [Obtainium](https://obtainium.imranr.dev) (with pre-releases turned on).
- Admin pages: users (role, disable, delete, reset link), invites with QR code, audit log, and
  "second factor required" for everyone.
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
with sync protocol v1 (see its `docs/sync-protocol.md`) and the account system of its
`docs/auth.md`. For the version history, set `git.enabled: true` and keep the wiki in a git
repository.

The browser talks to the backend directly, so the backend URL must be reachable from the
users' browsers. A reverse proxy in front of the backend must pass websocket upgrades for
`/document/{id}/ws/` and `/events/ws/`.

### Sessions, CORS and passkeys

The web client signs in with a session cookie of the backend (HttpOnly, SameSite=Lax). It
never sees the session token and stores no password or token in the browser. For the cookie
to work:

- The web client and the backend must be **same-site**, for example
  `https://edit.wiki.example.com` and `https://backend.wiki.example.com` (or `localhost` with
  two ports for development). An IP address and `localhost` are different sites.
- The backend must list the web client's origin in `server.cors.allowedOrigins`.

Backend settings that matter for the web client:

```yaml
server:
  cors:
    allowedOrigins: ['https://edit.wiki.example.com']
  trustedProxies: ['10.42.0.0/16'] # the reverse proxy, for client IPs and HTTPS detection
  auth:
    # The web client: setup, invite and reset links point here.
    clientUrl: 'https://edit.wiki.example.com'
    webauthn:
      # Passkeys are bound to this domain for good: the client's host or a parent domain.
      rpId: 'wiki.example.com'
```

The client serves the link pages `/setup`, `/invite` and `/reset`; the token is in the URL
fragment (`#mdl_…`), so it never reaches a web server log.

**Bitwarden's browser extension** can leave a page with two copies of its scripts, when the page
loads while the extension's service worker is stopped. On that page every passkey request opens
two windows and fails right away with "Something went wrong.". The cause is in the extension;
reloading the page helps, because the worker is running by then. The client says so and offers
the reload.

### First start

1. Start the backend with an empty state directory and no `server.auth.users`. It prints a
   one-time setup link (valid 24 hours):

   ```
   setup link: https://edit.wiki.example.com/setup#mdl_…
   setup token: mdl_…
   ```

   `mkdocsrest setup-link --config …` prints a fresh one while the server runs.

2. Open the link, choose a username and a password (or a passkey). This is the first admin.
3. Under **Account → Security**, add a passkey or an authenticator app.
4. Under **Admin → Invites**, create invite links for the others (with role and
   expiry) and hand them over, for example as QR code.

Upgrading from a backend with `server.auth.users`: the backend imports those users with
their passwords on the first start; they sign in as before. See the backend's `docs/auth.md`
section 14.

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

The Docker image also takes `MKDOCSEDITOR_ASSETLINKS_JSON` for Android App Links (see below).

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

### Android App Links (`assetlinks.json`)

Connect, invite, setup and reset links open the Android app directly when this host publishes
a Digital Asset Links file. Set `MKDOCSEDITOR_ASSETLINKS_JSON` to the raw JSON; the image
writes it at start and serves it at `/.well-known/assetlinks.json` with
`Content-Type: application/json` and no redirect (Android does not follow redirects there).
Without the variable that path answers 404.

```bash
-e MKDOCSEDITOR_ASSETLINKS_JSON='[{
  "relation": ["delegate_permission/common.handle_all_urls",
               "delegate_permission/common.get_login_creds"],
  "target": {"namespace": "android_app", "package_name": "<app package>",
             "sha256_cert_fingerprints": ["<signing certificate SHA-256>"]}
}]'
```

`get_login_creds` lets password managers and Android's Credential Manager offer the
passwords and passkeys saved for the web client in the app as well.

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
| `src/api/`                      | REST client and types, account and admin endpoints                               |
| `src/stores/`                   | Pinia stores: auth, step-up, tree, live updates, notifications                   |
| `src/sync/`                     | Automerge session: sync protocol, offline copy (IndexedDB), presence, authorship |
| `src/editor/`                   | CodeMirror editor, its binding to the session, remote cursors, uploads           |
| `src/markdown/`                 | Preview rendering (markdown-it with MkDocs extensions)                           |
| `src/views/`, `src/components/` | Pages and UI components (`auth/`, `account/`, `admin/` for the account system)   |
| `e2e/`                          | Playwright tests and the test backend setup                                      |

### End-to-end tests

`npm run test:e2e` builds the app, builds the backend, starts it with a small German test
wiki (a git repository) and three users (admin, editor, reader), and runs the tests in a
desktop and a phone browser. Run `npx playwright install chromium` once. The account tests
start extra backends (setup mode, strict rate limits) and use Chrome's virtual authenticator
for passkeys. The app reaches the test backend as `http://localhost:17414` (same site as the
app on `http://localhost:4174`).

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
