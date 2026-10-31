<p align="center">
  <img alt="Logo" src="public/logo.png" width="144"/>
</p>

# MkDocsEditor-Web

Web client for [MkDocsEditor](https://github.com/MkDocsEditor): browse and edit an MkDocs wiki
together, in real time, from a phone or a desktop browser. It talks to the
[MkDocsEditor backend](https://github.com/MkDocsEditor/MkDocsEditor-Backend).

> The client is being rewritten with Vue 3. This README grows with it.

## Development

Requirements: Node.js 22.

```bash
npm install
npm run dev          # dev server on http://localhost:5173
npm run lint         # ESLint
npm run format:check # Prettier
npm run type-check   # vue-tsc
npm run test:unit    # Vitest
npm run build        # type-check and production build into dist/
```

## Configuration

The app reads `config.json` next to `index.html` at start:

```json
{
  "backendUrl": "http://localhost:7413",
  "wikiUrl": "https://wiki.example.com"
}
```

For local development, copy `public/config.example.json` to `public/config.json` (ignored by
git), or set `VITE_BACKEND_URL` / `VITE_WIKI_URL`.

## Docker

```bash
docker build -t mkdocseditor-web .
docker run -p 8080:8080 \
  -e MKDOCSEDITOR_BACKEND_URL=https://mkdocs-api.example.com \
  -e MKDOCSEDITOR_WIKI_URL=https://wiki.example.com \
  mkdocseditor-web
```

The image is based on `nginx-unprivileged`, runs as uid 101, listens on port 8080 and writes
`config.json` from the environment at start. Pushes to `master` publish
`mkdocseditor/mkdocseditor-web:latest` on Docker Hub.

# License

AGPLv3+
