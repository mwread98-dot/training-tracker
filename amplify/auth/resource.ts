import { defineAuth } from "@aws-amplify/backend";

/**
 * Cognito-backed auth.
 * - Sign in with email + password.
 * - Two groups: "Coaches" and "Athletes".
 *
 * New users self-register (see src/components/Auth flow), but they land in
 * NO group until you manually add them. Do this once per person in the
 * AWS Console: Cognito > your user pool > Groups > Coaches/Athletes > Add user.
 * (Phase 2 idea: automate this with a post-confirmation Lambda trigger.)
 */
export const auth = defineAuth({
  loginWith: {
    email: true,
  },
  groups: ["Coaches", "Athletes"],
});
