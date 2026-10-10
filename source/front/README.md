This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## AWS auth: mock vs. real Cognito

Nearly every page is wrapped in Amplify's `<Authenticator>` and imports
`amplify_outputs.json` (only produced by a real `npx ampx sandbox` run
against AWS). `NEXT_PUBLIC_AUTH_MODE` (see `.env.example`) switches that:

- `NEXT_PUBLIC_AUTH_MODE=mock` (default) - `AuthGate`
  (`src/components/auth/AuthGate.tsx`) skips Amplify/Cognito entirely and
  renders every page as the fixed `NEXT_PUBLIC_MOCK_USER_*` identity, and
  `src/lib/api/client.ts` sends a fixed bearer token to archieves-api
  instead of a real Cognito ID token. No AWS credentials, no Amplify
  sandbox, no real user pool needed. `amplify_outputs.json` still has to
  exist on disk (it's a static import, resolved by the bundler regardless
  of this switch) - `npm run dev`'s `predev` script
  (`scripts/ensure-amplify-outputs.mjs`) seeds it from the committed
  `amplify_outputs.example.json` placeholder automatically if missing.
- `NEXT_PUBLIC_AUTH_MODE=cognito` - the production behaviour: real
  `<Authenticator>` sign-in flow against a real Cognito user pool. Run
  `npx ampx sandbox` first (or copy a deployed backend's output) to get a
  real `amplify_outputs.json`, overwriting the placeholder.

Amplify is now used only for Cognito auth - `amplify/` no longer defines a
`data` resource. Game/round/end/point records live in archieves-api's own
database and are read/written over plain HTTP (`src/lib/api/client.ts`),
just like `/users`/`/statistics`. A signed-in identity (real or mock) is
attributed to its archieves-api `User` row lazily, via
`getCurrentAppUser()` (`src/lib/auth/currentUser.ts`), which calls
`POST /users/me/ensure` on first use.

## Running alongside archieves-api

The archieves-api backend lives in the same monorepo, at
[`../back`](../back) (`/users`, `/statistics`, ...). The browser calls
`/api/v1/*` on this app, and the route handler
(`src/app/api/v1/[...path]/route.ts`) forwards it to archieves-api with the
API key and the Cognito ID token. `python -m tools.dev` in `../back` starts
both together.

1. Start archieves-api (see [`../back/README.md`](../back/README.md)) and
   set `ARCHIEVES_API_URL` here to match it (default `http://127.0.0.1:8000`).
2. Keep `NEXT_PUBLIC_AUTH_MODE=mock` here in sync with `AUTH_MODE=mock`
   there (both are the default) so neither side needs real Cognito. Flip
   both to `cognito`/a real sandbox together when you need to debug against
   the real auth flow.
3. `npm run dev` (`:3100`).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3100](http://localhost:3100) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy

Amplify Hosting builds this app from `main` with the repo-root
`amplify.yml`. See [`docs/インフラ/デプロイ.md`](../../docs/インフラ/デプロイ.md).
