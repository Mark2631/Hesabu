import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const authClient = await readFile(new URL('../src/lib/supabase.ts', import.meta.url), 'utf8');

test('public product information is available before authentication', () => {
  assert.match(app, /if \(!showAuthScreen && !cloudAccount\) return <PublicLandingPage/);
  assert.match(app, /href="#product">Explore features<\/a>/);
});

test('public landing illustration contains no fabricated operating figures', () => {
  assert.doesNotMatch(app, /SAMPLE DATA|KSh 48,250|KSh 35,600|KSh 4,850|HS-0021/);
  assert.match(app, /public-workspace-art/);
});

test('successful registration returns the user to the sign-in form', () => {
  assert.match(app, /await onSignUp\([\s\S]*?\);\s*setMode\('signin'\);\s*setPassword\(''\);/);
  assert.match(app, /Account created\. Sign in with the email and password/);
});

test('signup never leaves a newly registered user authenticated', () => {
  assert.match(authClient, /writeSession\(null\);\s*return \{ session: null, user: payload\.user/);
});

test('email confirmation asks the user to sign in instead of entering the workspace', () => {
  assert.match(authClient, /if \(callbackType === 'signup'\) writeSession\(null\);/);
  assert.match(app, /Your email address has been confirmed\. Sign in to continue/);
});

test('business workspace creation is deferred until a successful sign-in', () => {
  const signupHandler = app.match(/const handleCloudSignUp = async \(input: SignUpInput\): Promise<void> => \{([\s\S]*?)\n  \};/);
  assert.ok(signupHandler);
  assert.doesNotMatch(signupHandler[1], /createBusiness\(/);
  assert.match(app, /const businessId = await createBusiness\(pending\);/);
});
