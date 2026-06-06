FROM node:20

WORKDIR /app

ENV CI=true

COPY package.json package-lock.json ./
RUN npm ci

COPY wrangler.toml tsconfig.json vitest.config.ts ./

EXPOSE 8787

CMD ["npx", "wrangler", "dev"]
