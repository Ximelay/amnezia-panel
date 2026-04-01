FROM node:24-alpine AS builder

ARG SKIP_ENV_VALIDATION=1
ARG NEXT_PUBLIC_VPN_NAME
ARG NEXT_PUBLIC_USES_TELEGRAM_BOT

WORKDIR /app

COPY package.json yarn.lock ./

ENV SKIP_ENV_VALIDATION=$SKIP_ENV_VALIDATION
ENV NEXT_PUBLIC_VPN_NAME=$NEXT_PUBLIC_VPN_NAME
ENV NEXT_PUBLIC_USES_TELEGRAM_BOT=$NEXT_PUBLIC_USES_TELEGRAM_BOT

RUN yarn install --frozen-lockfile --ignore-scripts; \
    yarn next telemetry disable;

COPY . .
RUN yarn build

FROM node:24-alpine

RUN apk add --no-cache nginx netcat-openbsd

WORKDIR /app

COPY --from=builder /app/.next /app/.next
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/public /app/public
COPY --from=builder /app/nginx.conf /etc/nginx/nginx.conf
COPY --from=builder /app/prisma /app/prisma
COPY --from=builder /app/prisma.config.ts /app/prisma.config.ts
COPY --from=builder /app/start.sh /app/start.sh
RUN chmod +x /app/start.sh

EXPOSE 8443

CMD ["/app/start.sh"]