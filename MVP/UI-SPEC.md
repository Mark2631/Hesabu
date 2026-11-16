# Hesabu MVP UI and interaction specification

## Product experience

Hesabu should feel like a dependable business tool for everyday operators, not an analytics dashboard that happens to contain sales forms. The hierarchy should answer three questions quickly:

1. What happened to the business today?
2. What needs attention?
3. What is the next action?

Use short language. Keep the primary action obvious. Avoid oversized cards, unnecessary gradients, decorative icon grids and long explanatory text inside the workspace.

## Typography

**Recommended family: Inter.** It is already loaded by `index.html`, is neutral, familiar and readable for a data-heavy business workspace. Keep one family rather than mixing several fonts.

Suggested type scale:
- Page title: 22–26px, 600–700 weight.
- Section heading: 16–18px, 600 weight.
- Metric value: 20–24px, 600–700 weight, tabular numerals.
- Body copy: 14px, 400–500 weight.
- Table text and form labels: 12–13px.
- Secondary metadata: 11–12px.
- Mobile form inputs: 16px minimum.

Do not shrink everything to make the page look compact. Reduce visual noise, extra copy and padding first. Important values and controls must remain readable on a 360px-wide screen.

## Colour and surface system

Use a light canvas, white surfaces, near-black text and a restrained green/blue accent. The existing white/black direction is suitable. Keep green for positive/primary actions and blue for information or connected status. Amber and red are reserved for warnings and failed states.

Use a consistent border radius and spacing scale. Avoid multiple competing shadow treatments. Use borders and spacing to establish hierarchy.

## Public website

Separate the public page from the private workspace.

### Header
- Hesabu brand at the left.
- Navigation: Product, How it works, Security, Pricing.
- Sign in and a single primary "Get started" action.
- Sticky only if it remains compact on mobile.

### Opening section
Use a plain, direct value statement such as:

**Know what is happening in your business.**

Supporting copy should explain that Hesabu brings sales, payments, stock and daily expenses into one reliable business record. Avoid broad claims about automation or AI that are not yet delivered.

Primary action: Create a business account.
Secondary action: Explore the product.

### Service explanation
Describe the everyday workflow in plain language:
- Record sales and payments.
- Keep stock and purchasing current.
- See balances and operating costs.
- Share a daily business digest.

Show the flow as a connected process rather than a collection of disconnected feature cards.

### Trust section
Explain access control, business-level data separation, backups and integration status only after each is actually implemented. Do not promise compliance or live payment integrations prematurely.

### Detailed footer
Include compact groups for Product, Business tools, Company, Help and Legal. Include contact/support channels only when real addresses exist. Add a final line for copyright, privacy and terms. Do not invent a telephone number, business address or legal entity.

## Sign-up / onboarding

The onboarding question should be **How would you like Hesabu to support your daily work?**

Manual entry is the default foundation and is always available. Show two independent optional checkboxes:
- AI assistant — ask questions about saved sales, stock, expenses and customer balances.
- WhatsApp daily digest — prepare a daily summary for a chosen business WhatsApp number.

Both checkboxes can be on at the same time. Do not use a radio group or mutually exclusive mode selector. A user can change these settings later.

Collect the business name, industry, owner name and contact details, then create the Supabase Auth account and business in a single well-defined onboarding flow. Do not create a "successful" account until the backend confirms the operation.

## Workspace dashboard

Replace the long top card with a compact quick-action area:
- Heading: "Quick actions"
- One short line of context at most.
- Five actions: Record sale, Add expense, Receive payment, Buy stock, Update stock.
- Short helper labels only; avoid multi-line descriptions.
- Keep action tiles around 76–88px high on desktop and 72–80px on mobile.
- Use a 5-column layout when there is room, 3 columns on tablet, 2 columns on narrow mobile.

Place the business summary directly beneath the actions with four clear figures: Sales today, Money received, Expenses today and Stock alerts. Show cash position or outstanding balances in a secondary section where space allows.

Keep recent activity and customer follow-ups below the first summary row. Do not place every dashboard feature inside one card.

## Floating tools: WhatsApp and AI

The existing floating assistant should not be relabelled as a WhatsApp control. Use a coordinated floating dock or two labelled controls:
- **Daily digest** (WhatsApp icon/action)
- **Ask Hesabu** (AI assistant)

They must never cover each other, the mobile bottom navigation, or a form submit button. Use a single compact dock with a clear open/close interaction rather than two unrelated large circles. On mobile, respect safe-area insets and bottom navigation height.

### Daily digest interaction
1. Open a small digest preview with today's figures and business name.
2. Allow the user to select/edit the recipient number.
3. Validate and normalise Kenyan phone numbers.
4. Show the exact message to be shared.
5. "Open WhatsApp" launches click-to-chat with the message prefilled.
6. Tell the user that they must press Send in WhatsApp.

Scheduled/automatic sending is a separate feature that requires WhatsApp Business Platform Cloud API, server-side credentials, opt-in, message-template rules where applicable, delivery status handling and an unsubscribe/disable path. Do not claim that click-to-chat sends a message automatically.

### AI assistant interaction
The assistant can answer using business data only after it is connected to an authenticated business context. It should explain which period or records it used and distinguish calculated facts from advice. Generative AI requests must go through a server-side Edge Function with per-business authorization and rate limits. No model key belongs in the browser.

## Interaction quality

- Use small, purposeful hover/focus states.
- Keep motion between 120–180ms; honour `prefers-reduced-motion`.
- Use skeletons for loading data, not blocking spinners.
- Provide useful empty states, validation feedback and retry actions.
- Keep all important actions keyboard accessible and visible on touch screens.
- Every save, delete, payment and integration action needs a real pending/success/error state.
