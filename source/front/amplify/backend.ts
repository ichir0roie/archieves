import { defineBackend } from "@aws-amplify/backend";
import { auth } from "./auth/resource";

const backend = defineBackend({
  auth,
});
const { cfnUserPool } = backend.auth.resources.cfnResources;
// 6 文字は Cognito が許す最短。文字の種類は求めない
cfnUserPool.policies = {
  passwordPolicy: {
    minimumLength: 6,
    requireLowercase: false,
    requireNumbers: false,
    requireSymbols: false,
    requireUppercase: false,
    temporaryPasswordValidityDays: 20,
  },
};
