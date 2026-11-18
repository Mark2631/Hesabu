import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const authClient = await readFile(new URL('../src/lib/supabase.ts', import.meta.url), 'utf8');

test('public product information is available before authentication', () => {
  assert.match(app, /if \(!showAuthScreen && !cloudAccount\) return <PublicLandingPage/);
  assert.match(app, /href="#product">Explore features<\/a>/);
});

test('public landing uses the requested shop photography instead of invented operating figures', () => {
  assert.match(app, /src="\/hesabu-shop-owner\.webp"/);
  assert.doesNotMatch(app, /SAMPLE DATA|KSh 48,250|KSh 35,600|KSh 4,850|HS-0021/);
});

test('signup adopts the session returned by Supabase immediately', () => {
  assert.match(authClient, /writeSession\(session\);\s*return \{ session, user: payload\.user \?\? session\.user \}/);
  assert.doesNotMatch(authClient, /writeSession\(null\);\s*return \{ session: null/);
});

test('new account setup creates its business workspace without a second sign-in', () => {
  assert.match(app, /const businessId = await createBusiness\(input\);/);
  assert.match(app, /setCloudAccount\(\{ user: result\.session\.user, business:/);
  assert.match(app, /setShowAuthScreen\(false\);/);
});

test('the frontend no longer handles email-confirmation callbacks or confirmation links', () => {
  assert.doesNotMatch(authClient, /completeAuthCallback|auth\/v1\/verify|confirmation link/i);
  assert.doesNotMatch(app, /Your email address has been confirmed|confirmation link|confirm your email address/i);
});

test('invited team members accept their invitation after signup', () => {
  assert.match(app, /const businessId = await acceptCloudBusinessInvitation\(invitation\);/);
  assert.match(app, /clearPendingTeamInvitation\(\);/);
});
