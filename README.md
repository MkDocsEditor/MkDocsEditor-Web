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
- Share a page with a link (`/join/{id}?from={account}`). It holds no secret and grants nothing: it
  follows a sender who is still there, and otherwise opens the editor where the sender was last.
  Someone without an account can sign in or ask for access, and an admin decides under
  Admin → Requests.
- Account page: profile and colour, password, authenticator app, recovery codes, passkeys,
  and the signed-in devices (sign out one or all others).
- Connect the Android app: Account → Devices creates a single-use link (5 minutes), shown as
  a QR code to scan with the phone's camera. On a phone, the first sign-in offers to open the
  app directly. Links the app does not take land on `/connect`, which explains how to install
  the app with [Obtainium](https://obtainium.imranr.dev) (with pre-releases turned on).
- Admin pages: users (role, disable, delete, reset link), invites with QR code, audit log, and
  "second factor required" for everyone.
- Browse the wiki as a folder tree, search names and page text (Ctrl+K), create, rename and
  delete pages and folders.
- Upload files into a folder (menu or drag and drop). Paste or drop an image into the editor
  and it is uploaded next to the page and embedded.
- Edit together in real time: the Markdown editor (CodeMirror 6) syncs with
  [Automerge](https://automerge.org). Everyone sees the others' cursors and selections with
  names and colours, plus a list of who is online.
- Follow someone by clicking their avatar: the editor stays on what they are looking at, without
  moving your cursor. Scrolling pauses it for 5 seconds, and for up to 40 seconds if you scroll again
  right after it resumed. Typing ends it. A user who leaves stays as a faint cursor for as long as
  the server says (60 seconds), and following ends when that is gone. Every tab and device counts by
  itself, also your own, so you can follow yourself on another device. Under More → My cursor color,
  a tab can get its own cursor color for the others, without changing the one of your account.
- Editing works offline. Changes are kept in the browser and merged after the reconnect, even
  when the server lost its state meanwhile. The connection state is always visible, and text
  is never thrown away silently. Each account has its own local copies, so unsynced edits only
  ever sync under the account that made them.
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

The layers, from the bottom up. Each one only uses those below it, which ESLint enforces
(`no-restricted-imports` in `eslint.config.ts`):

| Path                            | Contents                                                                                |
| ------------------------------- | --------------------------------------------------------------------------------------- |
| `src/config.ts`                 | Runtime configuration                                                                   |
| `src/api/`                      | REST client and types, account and admin endpoints                                      |
| `src/services/`                 | Plain helpers without state of the app: search, tree index, names, passkeys, formatting |
| `src/markdown/`                 | Preview rendering (markdown-it with MkDocs extensions), also bundled alone for Android  |
| `src/sync/`                     | Connections and data on this device: Automerge session, live events, IndexedDB copies   |
| `src/stores/`                   | Pinia stores: auth, step-up, tree, pages, live updates, notifications                   |
| `src/composables/`              | Shared `use*` functions for components                                                  |
| `src/editor/`                   | CodeMirror editor, its binding to the session, remote cursors, uploads                  |
| `src/views/`, `src/components/` | Pages and UI components (`auth/`, `account/`, `admin/` for the account system)          |
| `e2e/`                          | Playwright tests and the test backend setup                                             |

### Design

The web client should feel familiar next to the Android app. Both follow Material Design 3, with the
same colours (`src/plugins/vuetify.ts`), font (Roboto) and components, and the same `md.sys` token
values (`src/styles/tokens.css`). The web client is denser, because it is meant for a desktop screen.

- **Defaults first:** `vuetify.ts` sets what a component looks like. A call site only states what
  differs, so a button has no `variant` unless it is a filled (`color="primary" variant="flat"`) or an
  outlined one. `src/styles/vuetify.css` covers what props cannot.
- **Type:** the classes of the Material type scale, such as `text-headline-small`, `text-title-medium`
  or `text-body-small`. Vuetify 4 does not have the older `text-h5` and `text-caption`.
- **Spacing:** 4, 8, 16, 24 or 32 pixels, as `pa-1`, `pa-2`, `pa-4`, `pa-6`, `pa-8` or `--app-space-*`.
- **Parts:** `PageHeader`, `SectionHeader` and `AppDialog` (`small`, `medium`, `large`) in
  `components/common`. Waiting is a `v-progress-linear`.
- **Motion:** state changes take 100 to 150ms on the standard curve. Overlays enter in 250ms on the
  emphasized decelerate curve, and leave in 150ms on the accelerate one.
- **Search:** Material's search bar in the app bar, with a search view docked to it from 960 pixels up
  and a full-screen one below.

`npm run lint` enforces this: ESLint for the classes and props, Stylelint for raw values in styles.

### End-to-end tests

`npm run test:e2e` builds the app, builds the backend, starts it with a small German test
wiki (a git repository) and three users (admin, editor, reader), and runs the tests in a
desktop and a phone browser. Run `npx playwright install chromium` once. The account tests
start extra backends (setup mode, strict rate limits) and use Chrome's virtual authenticator
for passkeys. The app reaches the test backend as `http://localhost:17414` (same site as the
app on `http://localhost:4174`).

Test files run in parallel. Every worker has its own backend, wiki and users, and its own port
of the app: the first worker uses the ports above, the next one `17415` and `4175`, and so on.

| Variable           | Default            | Meaning                                                     |
| ------------------ | ------------------ | ----------------------------------------------------------- |
| `E2E_BACKEND_BIN`  |                    | Use this backend binary instead of building one             |
| `E2E_BACKEND_DIR`  | `e2e/.tmp/backend` | Backend checkout to build (cloned from GitHub when missing) |
| `E2E_BACKEND_LOG`  |                    | Write the logs of the backends to this file                 |
| `E2E_BACKEND_PORT` | `17414`            | Port of the test backend of the first worker                |
| `E2E_WEB_PORT`     | `4174`             | Port of the app under test of the first worker              |
| `E2E_WORKERS`      | `4`                | How many workers run at once                                |

CI runs the same tests against the backend's `master`.

### Known issues

- **Remote edits arrive late on long pages.** Automerge 3 takes time in proportion to the length of
  the text to apply a remote change, even a single character
  ([automerge#1591](https://github.com/automerge/automerge/issues/1591)). On a page of 66,000
  characters that is about 25ms per sync message, against about 0.85ms in Automerge 2.2. Edits from
  another client therefore show up later than on Android, whose older Automerge core does not have
  this. The cost is per message, not per change: 20 changes applied together take about as long as
  one. A fix is in progress upstream
  ([automerge#1596](https://github.com/automerge/automerge/pull/1596)). Automerge 2.2.9 reads and
  writes the same documents and syncs with Automerge 3, so downgrading stays an option if this
  becomes a problem before the fix ships.

# License

AGPLv3+
