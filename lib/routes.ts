/**
 * Where signing in lands you.
 *
 * The team feed rather than your own forms: most sessions start by looking at
 * what everyone else shipped, and your own workspace is one click away in the
 * header. Named here because two places decide it — the login page (email and
 * password, which redirects client-side) and the OAuth callback route — and
 * they must not drift apart.
 */
export const HOME_AFTER_SIGN_IN = '/creator/team'
