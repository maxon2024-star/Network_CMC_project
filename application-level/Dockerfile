# Этап 1: сборка React-приложения
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

ENV VITE_TRANSPORT_SSE_URL=/api/v1/telemetry/stream
ENV VITE_AGENT_API_URL=/api/v1

RUN npm run build

# Этап 2: раздача статики и проксирование API/SSE через Nginx
FROM nginx:1.27-alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

ENV NGINX_ENVSUBST_FILTER=PROXY_

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
