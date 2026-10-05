// AuthGate.tsx imports amplify_outputs.json unconditionally (it's a static
// import, resolved by the bundler at build time), so *some* copy of the
// file must exist on disk before `next dev`/`next build` runs, even in
// NEXT_PUBLIC_AUTH_MODE=mock where its contents go unused. Real per-sandbox
// output is gitignored (amplify_outputs*), so seed the committed placeholder
// the first time a dev checks the repo out; never overwrite a real one.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, "amplify_outputs.json");
const placeholder = path.join(root, "amplify_outputs.example.json");

if (!fs.existsSync(target)) {
  fs.copyFileSync(placeholder, target);
  console.log(
    "amplify_outputs.json missing - seeded from amplify_outputs.example.json. " +
      "Run `npx ampx sandbox` and use NEXT_PUBLIC_AUTH_MODE=cognito to debug against real Cognito.",
  );
}
