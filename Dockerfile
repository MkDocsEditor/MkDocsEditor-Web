# syntax=docker/dockerfile:1

FROM node:22.23.4-alpine3.24 AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build-only

FROM nginxinc/nginx-unprivileged:1.30.6-alpine3.24
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/40-mkdocseditor-config.sh /docker-entrypoint.d/40-mkdocseditor-config.sh
COPY --from=build /app/dist /usr/share/nginx/html
# The image runs as the unprivileged user "nginx" (uid 101) and listens on port 8080.
USER 101
EXPOSE 8080
ENV MKDOCSEDITOR_BACKEND_URL="" \
    MKDOCSEDITOR_WIKI_URL="" \
    MKDOCSEDITOR_ASSETLINKS_JSON=""
