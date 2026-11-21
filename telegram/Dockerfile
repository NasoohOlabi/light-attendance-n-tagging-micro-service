FROM oven/bun:1.3.0 AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY patches ./patches
RUN HUSKY=0 bun install --frozen-lockfile --production --ignore-scripts
COPY telegram ./telegram
COPY shared ./shared
COPY server/profile.ts ./server/profile.ts
RUN bun build ./telegram/runtime.ts --target=bun --outfile=/app/bot.js

FROM oven/bun:1.3.0
WORKDIR /app
COPY --from=build /app/bot.js ./bot.js
ENV NODE_ENV=production
CMD ["bun", "/app/bot.js"]
