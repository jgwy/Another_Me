FROM node:24-alpine
WORKDIR /app
RUN npm install -g pnpm@11.5.2
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --frozen-lockfile
COPY . .
ENV DATABASE_URL=postgresql://another_me:another_me@postgres:5432/another_me
RUN pnpm --filter @another-me/api db:generate
EXPOSE 4000
CMD ["pnpm", "--filter", "@another-me/api", "dev"]
