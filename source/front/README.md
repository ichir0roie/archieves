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
  (`scripts/ensure-amplify-outputs.js`) seeds it from the committed
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
`POST /users/find-or-create` on first use.

## Running alongside archieves-api

The [archieves-api](https://github.com/ichir0roie/archieves-api) backend is
a separate repo/server (`/users`, `/statistics`, ...) that this app talks to
over plain HTTP - no shared network or container setup needed, each repo
keeps using its own native dev server:

1. Start archieves-api (see its README) and set `NEXT_PUBLIC_API_BASE_URL`
   here to match its port.
2. Keep `NEXT_PUBLIC_AUTH_MODE=mock` here in sync with `AUTH_MODE=mock`
   there (both are the default) so neither side needs real Cognito. Flip
   both to `cognito`/a real sandbox together when you need to debug against
   the real auth flow.
3. `npm run dev` (`:3000`).

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

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
