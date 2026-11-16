# Hesabu code and product audit

Audit baseline: repository `main`, inspected on 16 November 2026.

## Findings

### 1. Authentication is only a visual shell — critical
`src/App.tsx`, `AuthPage` (around lines 806–859), has sign-in and create-account tabs, but form submission only sets an explanatory message. It does not call an authentication provider, create a user or establish a session. The workspace opens when a local-storage flag is set by the preview button.

**Impact:** accounts, staff roles and saved records are not tied to a verified identity. Never use the current local role switcher as an authorization boundary.

### 2. All operational records are browser-local — critical
`src/data.ts` defines `hesabu:platform:v3`; `readWorkspace()` and `saveWorkspace()` read/write the entire workspace using `localStorage`. `App.tsx` saves the application state from an effect.

**Impact:** records do not sync between devices or staff, are not a secure multi-user data store, and can be lost when browser storage is cleared. The existing seed is representative demo data.

### 3. Supabase is not present in the frontend — critical
The root `package.json` has no `@supabase/supabase-js` dependency. There is no Supabase client or cloud data adapter in `src`. No live project schema can be verified from the Supabase account currently connected to this workspace.

**Impact:** the current interface is not connected to the newly created Spike Digital project.

### 4. WhatsApp digest is prepared, not automatically sent — high
`getDailyDigest()`, `buildDailyDigestMessage()` and `openDailyDigestWhatsApp()` in `src/App.tsx` derive a message from the current browser records and open a `wa.me` click-to-chat URL. The destination number is stored in local storage and configured in Settings. The operator still reviews and sends the prepared message.

**Impact:** this is a useful manual sharing flow, but it is not scheduled or automatic delivery. Automatic delivery requires an approved WhatsApp Business Platform setup and a server-side sender.

### 5. The floating assistant is rule-based — high
`FloatingAssistant` in `src/App.tsx` calls `getWorkspaceAnswer()` to answer using hard-coded record queries. The UI correctly notes that generative AI and voice capture are not connected.

**Impact:** avoid branding the current control as a live generative AI service. Redesign the floating area as two coordinated actions: **Daily digest** and **AI assistant**. Each can be enabled independently in onboarding and settings.

### 6. Payment and sales-channel integrations are demonstrations — high
The payment request dialog labels the request as a sample and the created record notes that no real Safaricom request was sent. The README confirms that the Daraja flow does not call Safaricom, process a real callback or move money. The website checkout is a local demonstration, not a production webhook/API integration.

**Impact:** keep simulations clearly marked as preview-only until real credentials, callback verification, idempotency and reconciliation are implemented.

### 7. Dashboard action panel is too dominant — medium
`OverviewPage` in `src/App.tsx` renders a large black `.business-overview-panel` containing a heading, description and five tall action tiles. The "Business at a glance" numbers are a separate section beneath it. The CSS contains multiple later definitions of `.business-overview-panel` and related selectors, which makes the final appearance difficult to reason about.

**Recommendation:** make the top area a compact quick-action strip. Keep five actions, but use shorter labels and one-line helper text, reduce tile height, and keep key figures in a separate, immediately visible row.

### 8. The stylesheet contains competing visual layers — medium
`src/styles.css` is over 2,000 lines and contains several appended visual-system overrides. The first part uses green-heavy tokens; later sections redefine the palette around black/white with restrained green/blue accents. Some selectors, including `.business-overview-panel`, are redefined more than once.

**Impact:** later rules override earlier rules, so a small change can have unintended effects. Consolidate tokens and component rules after the new direction is agreed.

### 9. Dense text is too small in places — medium
The current CSS uses 8–10px for some badges, table labels/cells, hints and navigation metadata. This is particularly hard to read on small Android screens.

**Recommendation:** keep Inter, but establish clear size roles. Use 14px for normal body copy, 12–13px for table content and form labels, and reserve 11px for secondary metadata. Input text should remain at least 16px on mobile to avoid difficult zoom behaviour.

### 10. Reusable metric component has unused props — low
`MetricCard` accepts an icon and tone but does not render either. Remove unused props or deliberately render a small, consistent indicator. Do not add decorative icons just to fill space.

### 11. Current site entry is not a service landing page — medium
The root route renders `AuthPage` when preview access is absent. The page explains the product briefly, but it is primarily a sign-in panel and not a complete public service website. The footer in the authenticated workspace is a minimal preview-status line.

**Recommendation:** separate the public product page from the authenticated workspace. Add a proper navigation header, clear service explanation, workflow section, trust/security explanation, direct call to action, and a structured footer.

## Existing strengths worth preserving

- The domain model already separates sales, payments, receipts, inventory, purchasing, suppliers and journals.
- The finance helpers have meaningful unit tests for balanced journal entries, invoice allocations, weighted average cost and goods receiving.
- Sale creation currently validates requested stock quantity before posting in the demo.
- The digest already contains more than just sales: payments, expenses, supplier payments, gross profit, units sold, stock updates and low-stock count.
- The UI supports responsive navigation and reduced-motion preferences in parts of the stylesheet.

## Priority order

1. Confirm Spike Digital project access and inspect its actual schema/advisors.
2. Implement real auth and business tenancy with RLS.
3. Persist user and business onboarding preferences.
4. Add cloud data access and atomic business operations.
5. Redesign the top dashboard panel, global type scale and dual floating actions.
6. Build the public landing page and structured footer.
7. Complete and verify WhatsApp and AI integrations.
8. Run automated tests, tenant isolation tests and production review.
