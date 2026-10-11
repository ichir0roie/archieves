import { defineBackend } from "@aws-amplify/backend";
import { auth } from "./auth/resource";

const backend = defineBackend({
  auth,
});
const { cfnUserPool } = backend.auth.resources.cfnResources;
// defineAuth はユーザ名でのログインを持たないので、L1 を直に書き換える。
// usernameAttributes を空にするとユーザ名で登録・ログインし、aliasAttributes の email でもログインできる(確かめたメールだけ)。
// どちらも作ったあとの User Pool では変えられず、変えると User Pool が作り直される(登録した利用者は消え、sub も変わる)
cfnUserPool.usernameAttributes = [];
cfnUserPool.aliasAttributes = [
  "email",
];
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
