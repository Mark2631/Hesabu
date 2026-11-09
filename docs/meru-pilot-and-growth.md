# Hesabu: Meru pilot and customer growth plan

**Status:** field-test plan, not a market-size forecast  
**Beachhead:** owner-operated dukas, kiosks and small groceries in Meru County  
**Product promise:** know what came in, what went out, who still owes you, and what cash should be in the till at closing.

## 1. The customer to win first

Hesabu should not launch as generic accounting software for every Kenyan SME. The first customer is a shop owner or family member who handles the till, records some sales in a notebook or memory, accepts both cash and M-Pesa, and sometimes lets known customers take goods on credit.

| Segment | Priority | Why it fits / what must be validated |
|---|---:|---|
| Owner-run dukas and kiosks | 1 | Frequent small transactions, cash plus M-Pesa, informal customer credit, owner often closes the till. |
| Small groceries and produce shops | 2 | Same daily money problem, plus stock movement and supplier payments. Validate whether stock tracking is useful or too much work. |
| Small hardware shops and agrovet retailers | 3 | Customer balances and supplier records matter, but product catalogues, units and larger credit accounts need stronger workflows. |
| M-Pesa agents | Later | Their till float, commissions, reversals and transaction statements create a different reconciliation problem. Do not market the current manual payment labels as agent reconciliation. |
| Supermarkets, multi-branch retailers and businesses with dedicated bookkeepers | Not the first cohort | More likely to need staff permissions, shared/cloud records, integrations and formal reporting that this offline local-only release does not provide. |

The initial buyer and daily user may be the same person. In family shops, however, the person entering transactions may not be the owner. Test both roles rather than assuming the owner will do every entry.

## 2. What the evidence says

The FSD Kenya Small Firm Diaries study followed 155 small firms in Nairobi, Kwale and Kisumu between October 2021 and November 2022. In that sample, more than 80% used a smartphone or computer for business, but only 30% of firms using those devices reported using them for record-keeping. Cost was cited as a technology-adoption barrier by 53%, required skills by 37%, and learning time by 20%. This is useful directional evidence, not a nationally representative estimate for every kiosk or duka. Source: https://www.fsdkenya.org/wp-content/uploads/2023/05/Kenya-Country-Data-Overview-Data-from-the-Small-Firm-Diaries.pdf

A 2026 International Growth Centre policy brief reports that a Nairobi experiment using a smartphone POS app with automated analytics increased daily record-keeping by 7–9 percentage points compared with an app without those analytics; users also improved inventory knowledge and reported higher daily sales. The lesson for Hesabu is important: collecting entries is not enough. The shopkeeper must get a useful answer back from those entries. Source: https://www.theigc.org/publications/data-without-insight-why-small-businesses-under-invest-record-keeping-evidence-kenya

A 2026 Caribou and Turn.io study on WhatsApp and livelihoods in Kenya, India, Nigeria and Pakistan describes trusted peers and intermediaries as important in helping people adopt and use business tools effectively. This supports assisted demonstrations and referrals through existing trader networks over an install-ad campaign as the first acquisition channel. Source: https://caribou.global/publications/whatsapp-and-womens-livelihoods/

## 3. Positioning: sell the result, not the software

Do not introduce Hesabu as “accounting”, “ERP”, “POS automation” or “AI bookkeeping”. Those labels imply training, complexity or a payment integration that is not present.

**Core message:** “Ujue pesa imeingia, imetoka, na nani bado anakudai.”  
**English:** “Know what came in, what went out, and who still owes you.”

The first demo should show only three things:

1. Record one real or representative sale in less than a minute.
2. Record a customer taking goods on credit and show where that balance appears.
3. Show the cash/M-Pesa split and how the owner closes the physical cash drawer.

The demo must say plainly that M-Pesa is currently recorded manually; Hesabu does not yet import transactions or initiate STK Push. It must also say that this release stores the ledger on the device. Never imply cloud backup or multi-phone sync.

## 4. Acquisition channels to test in Meru

### A. Founder-led shop visits — primary channel

Work in small geographic clusters so follow-up is practical. Start with one market/estate cluster, then a second cluster with a different shop mix. Visit at a quiet time, ask permission, and keep the first conversation under five minutes.

Open with a question, not a sales pitch: “When you close today, how do you know how much cash should be in the drawer and which customers still owe you?”

If the owner describes a real problem, ask them to show the current notebook or method. Do not photograph or copy customer records. Offer a two-minute demo using invented sample entries, then let the shopkeeper enter one transaction themselves.

### B. Referrals through trusted intermediaries

After a shop has used the app for at least a week, ask whether one nearby shopkeeper has the same problem. Test introductions through wholesalers, regular suppliers, market association leaders, chama organisers and independent bookkeepers. These are referral hypotheses, not partnerships to claim before agreement.

A referral only counts when the referred shop completes its first entry. A forwarded message or download is not activation.

### C. WhatsApp demonstration

Use short, low-data clips or a sequence of screenshots showing one task at a time: record sale, record credit, close the till, open the report. Send one-to-one after the recipient agrees to receive it. Test Kiswahili-first wording as well as English. Do not buy lists, scrape phone numbers, add shopkeepers to groups without permission or run unsolicited broadcasts.

The call to action should be “Let me show you with one sale”, not “Download our revolutionary accounting app”.

### D. Local training and business-support networks

Approach local enterprise trainers, SACCO business-development officers, county enterprise programmes and bookkeepers only after the first pilot has evidence of repeat use. Offer a short practical session using test data. Do not ask an institution to endorse the product before it has been tested with real shops.

## 5. A four-week pilot with explicit gates

The figures below are proposed pilot targets. They are not claims about expected national conversion rates.

| Stage | Pilot target | What to record |
|---|---:|---|
| Shops approached | 50 | Segment, location cluster, whether owner/operator was reached. |
| Useful discovery conversations | 30 | Current record method, credit practice, cash/M-Pesa mix, closing problem, device constraints. |
| Assisted trials | 15 | Whether the shopkeeper completed an entry without the promoter taking over. |
| First-day activated | 10 | At least 3 real entries and a clear understanding of the home summary. |
| Week-2 retained | 6 | Shopkeeper returns on at least 3 separate trading days in week two. |
| First close completed | 6 | Owner counts physical cash and understands the over/short result. |

**Week 1 — learn.** Interview 10–15 shops across dukas, kiosks and groceries. Observe the existing paper workflow. Do not lead the witness by showing the app first. Record the exact words used for sales, credit, supplier payments and till differences.

**Week 2 — assisted onboarding.** Trial with 5–8 shops. Help each one record a sale, an expense and a credit transaction. Ask the operator to repeat the steps while you watch. Note every hesitation and every point where they ask what a label means.

**Week 3 — unassisted use.** Reduce promoter involvement. Ask the shopkeeper to use Hesabu for their normal day and close the till. Visit or call only with permission. Log app failures and missing workflows separately from user training problems.

**Week 4 — retention review.** Check which shops recorded transactions on multiple days, which completed closes, which stopped using it and why. Interview both retained and churned shops. Fix the most common blocker before adding more features or widening the target.

## 6. Retention: create a daily payoff

The intended loop is:

**Record → understand → close → return.**

- **Record:** Sale, expense and credit must be reachable from the first screen, with minimal typing. Voice remains optional because browser speech recognition can depend on network and device support.
- **Understand:** Immediately show money received, money spent, cash versus M-Pesa, and outstanding customer balances. Do not label net cash movement as profit.
- **Close:** Ask for the physical cash count at the end of the shop's configured trading day. Show expected cash and the difference clearly.
- **Return:** Carry the previous close forward as the next opening float and make yesterday's report easy to find.
- **Protect trust:** Remind users to download a backup. A device-only ledger is vulnerable to phone loss, browser data clearing and device changes; do not hide this limitation.

The new home-screen installation guidance supports repeat access. Test whether shopkeepers install it themselves or need the promoter to demonstrate the browser menu. Do not treat a home-screen icon as retention: repeat transaction days are the measure.

## 7. Product metrics to collect during the pilot

For this release, keep the pilot tracker in a separate sheet or research notebook. The app has no cloud analytics or multi-device account system. Do not silently transmit customer names, phone numbers, debts or transaction amounts to create a dashboard.

| Metric | Definition | Pilot decision |
|---|---|---|
| Time to first value | Minutes from opening the app to the shopkeeper recording the first entry | Aim for under 5 minutes with assisted setup; investigate every trial that takes over 10 minutes. |
| First-day activation | 3 or more real entries on day one | If low, simplify the entry flow before buying traffic. |
| Close adoption | A physical cash count completed on an operating day | If users record entries but do not close, improve the value and clarity of the close flow. |
| Weekly active shop | A shop records entries on at least 3 separate trading days in a week | The principal early retention measure. |
| Week-2 retention | An activated shop records an entry in week two | Interview every shop that does not return. |
| Data safety behaviour | Backup downloaded at least once during the pilot | If low, improve backup education and later evaluate cloud backup. |
| Referral activation | A referred shop records its first entry | Measures useful word-of-mouth, not just link sharing. |

Use shop codes in the pilot tracker. Keep customer-identifiable data and actual ledger values on the shop's device. Collect only the minimum information needed for product research and obtain permission before follow-up.

## 8. Pricing and expansion rules

Keep the first pilot free. Do not charge for a ledger that users have not yet trusted with a full trading day. Do not sell cloud sync, automated M-Pesa reconciliation or multi-user access until those capabilities actually exist.

After repeat use is established, test willingness to pay through interviews and a clearly explained paid pilot. Ask what a missed debt, an unexplained cash difference or time spent rewriting a book costs them. Test a modest monthly price against the value they describe; do not infer willingness to pay from a positive comment.

Expand from Meru to another town or shop category only after a first cohort shows repeat weekly use and can explain the benefit without the promoter present.

## 9. Trust and compliance guardrails

The Office of the Data Protection Commissioner’s 2025 MSME guidance covers lawful basis, transparency, data minimisation, storage limitation, security, commercial use and data sharing. If Hesabu later adds cloud accounts, analytics, referrals or marketing through customer contact details, these uses need explicit product and compliance design. Do not reuse a shop's customer list for Hesabu marketing. Source: https://www.odpc.go.ke/wp-content/uploads/2025/11/ODPC-%E2%80%93-Guidance-Note-on-Processing-by-MSMEs.pdf

Before a public launch, resolve the current Vercel deployment protection: the preview's SSO setting blocks ordinary visitors on its vercel.app URL. A share link is a temporary reviewer workaround, not a public distribution channel.

## 10. Immediate execution backlog

1. Verify public access and a clean first load on Android Chrome before recruiting shops.
2. Test responsive layouts at 320, 360, 390, 430, 768, 900, 1024 and 1440 CSS pixels.
3. Run the five-minute assisted onboarding with three different shop operators; observe without taking over.
4. Fix the three most common usability blockers before adding dashboards or advanced accounting.
5. Run the 50-shop funnel above and publish a short pilot report: activation, week-2 use, close adoption, failure reasons and requested features.

**The stop/go rule:** do not scale promotion because people say the idea is good. Scale only when shopkeepers can record a normal day's activity, close the till and come back to do it again without the promoter standing beside them.


## 11. The deeper product proposition: protect what they are building

Hesabu is not sold as bookkeeping homework. The owner has already done the work of opening the shop, finding suppliers, serving customers and taking financial risk. The product should make that effort easier to protect and build on.

The Kenya Small Firm Diaries study is a useful correction to the idea that all owners are either aggressive growth-seekers or survivalist traders. In its 155-firm sample, 61% described a vision combining growth and stability; 59% named savings as their primary risk-management measure; 63% said they would use a loan for cash-flow needs or inventory, while 56% said they rarely or never needed loans. This is a specific study sample, not a universal profile of Kenyan shopkeepers. It nevertheless suggests that steady growth, liquidity and control are stronger starting points than promises of rapid expansion.
Source: https://www.fsdkenya.org/wp-content/uploads/2023/05/A-new-perspective-on-Small-Firms-in-Kenya-Summary-of-Key-Findings-from-the-Small-Firm-Diaries.pdf

The August 2026 IGC policy brief reports a Nairobi experiment where a POS app with automated analytics increased daily record-keeping by 7–9 percentage points compared with the same app without analytics. It also reports better inventory knowledge, more diversified stock and higher daily sales among app users. The practical product lesson is to return a useful interpretation after each record, not to congratulate users for data entry.
Source: https://www.theigc.org/publications/data-without-insight-why-small-businesses-under-invest-record-keeping-evidence-kenya

The GSMA's 2026 work on Pochi la Biashara and women micro-entrepreneurs in Kenya also highlights trust, privacy, safety, financial control and digital confidence as design issues. Do not assume every owner has the same comfort with financial tools or the same authority over the business's phone and money.
Source: https://www.gsma.com/solutions-and-impact/connectivity-for-good/mobile-for-development/gsma_resources/pochi-la-biashara-and-women-micro-entrepreneurs-in-kenya-from-insight-to-action/

### The owner motivations to respect

| Motivation | What it may mean in the shop | Product response |
|---|---|---|
| Independence and control | “I want to know where the money went without depending on someone else.” | Clear daily receipts, expenses, customer balances and a till count. |
| Stability | “I cannot risk the cash that keeps the shop open.” | Show money movement, cash versus M-Pesa, overdue balances and closing differences honestly. |
| Pride and competence | “I have built this business; I want to run it properly.” | Calm, respectful language; a clean weekly picture; never call the owner disorganised or failing. |
| Growth without reckless risk | “I want more stock or another branch, but not at the expense of today's shop.” | Owner-selected milestones and useful working-capital/stock insights, not generic growth slogans. |
| Family and future security | “The shop supports people and plans beyond the counter.” | Let the owner name their own milestone. Do not assume their personal or family circumstances. |
| Trust and privacy | “My customer balances and sales are not for everyone to see.” | Keep records private, explain device-only storage, make sharing a deliberate action and never repurpose customer contacts for marketing. |

These are design hypotheses to test in actual conversations, not psychological labels to assign to individual customers. Do not infer a person's ambition, family situation, confidence or gender role from their business type.

### The behavioural design rule

Use autonomy, competence and visible progress—not pressure.

- **Autonomy:** the shopkeeper chooses the business milestone; Hesabu does not tell them what success must look like.
- **Competence:** every number has a plain-language explanation and a clear next action.
- **Progress:** show a user's own milestone and repeated trading-day habits, not arbitrary points, streak penalties or comparisons with neighbouring shops.
- **Dignity:** never shame a missed day, a negative cash movement or a low target. Ask what the owner wants to improve.
- **Honesty:** distinguish recorded receipts, expenses, credit given, outstanding debt, physical cash and self-reported milestone progress. Do not call net cash movement profit.
- **Privacy:** business milestones and ledger data stay on the device in the current release. No silent analytics or customer-contact uploads.

### The product loop

**Record → understand → take one useful action → see progress → return.**

The new owner check-in on Today should summarise the last seven trading dates and surface one grounded action: follow up on a due balance, review low stock, examine weekly outgoings or add the next ordinary record. The personal milestone card lets the owner track something they genuinely care about—growing stock, buying equipment, clearing supplier debt, keeping a cash reserve or opening another branch.

Milestone progress is self-reported and separate from till cash. Hesabu must never imply that a target is funded, saved or achieved based on unverified ledger entries.

### Five interview questions that reveal real motivation

Do not start by asking whether a person likes Hesabu. Ask about the last concrete event:

1. “Think about the last time the shop had a difficult day. What happened?”
2. “What is one thing you wish you could know before closing the shop?”
3. “What are you trying to make this shop able to do in the next six to twelve months?”
4. “What is the biggest thing that could interrupt that plan?”
5. “Show me how you currently know whether you can restock, pay a supplier or take money out of the business.”

Follow with “Can you show me the last time that happened?” Avoid suggesting a loan, a second branch or a savings target before the owner describes their own priority.

### Positioning and message tests

Test these three value propositions with separate cohorts. Do not combine them into one long sales pitch.

- **Control:** “Know what came in, what went out and who still owes the shop.”
- **Stability:** “Close the day knowing what should be in the till—and what needs attention tomorrow.”
- **Progress:** “Build your shop towards the next goal, one clear decision at a time.”

Kiswahili candidate: **“Linda biashara uliyojenga. Jua pesa ilipo, madeni yaliyobaki na hatua inayofuata.”** Translate-test with shopkeepers in Meru; do not assume a literal translation is natural in every local language or context.

Ask which message the owner remembers unaided after a day, not only which one they say they like during the pitch.

### The necessity test

Hesabu is becoming a daily tool only when a shopkeeper can name a decision it helped them make. During the pilot, collect concrete examples such as:

- “I followed up because I saw the customer balance was due.”
- “I reordered before the item ran out.”
- “I found the till difference before leaving.”
- “I delayed a purchase because the week's recorded expenses were already above collections.”
- “I am tracking progress towards the equipment I chose.”

Do not count compliments, downloads, app opens or a saved milestone as evidence of necessity. Track the action, whether the owner would have taken it without Hesabu, and whether it made a practical difference.

### Product sequence from here

1. Verify that the new owner check-in produces correct advice using real pilot data and is understandable without explanation.
2. Validate that the milestone language and self-reported progress feel motivating rather than childish or intrusive.
3. Add weekly comparisons only after enough reliable entries exist; clearly label incomplete weeks and missing records.
4. Improve stock usefulness with simple reorder quantities and supplier costs, without claiming sales forecasts from sparse data.
5. Evaluate a secure backup/sync option and real M-Pesa integration only after owners demonstrate repeat use and demand. Keep every claim aligned with what is actually integrated.
