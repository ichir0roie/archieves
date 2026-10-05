import { createServerRunner } from "@aws-amplify/adapter-nextjs";
import outputs from "../../../amplify_outputs.json";

/** route handler から、ブラウザのクッキーにある Cognito のセッションを読むための口。 */
export const { runWithAmplifyServerContext } = createServerRunner({ config: outputs });
