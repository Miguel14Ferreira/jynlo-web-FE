FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
# The build refuses to run without the browser-side GIPHY key (see
# scripts/configure-giphy.mjs). Platforms such as Render pass service environment
# variables to a Docker build only when the Dockerfile declares them as ARG.
# The key is already public in the shipped bundle and stays in this build stage.
ARG JYNLO_GIPHY_API_KEY
RUN npm run build

FROM nginx:1.27-alpine

ENV BACKEND_UPSTREAM=http://desporto24be:8080

COPY default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist/desporto24/ /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
