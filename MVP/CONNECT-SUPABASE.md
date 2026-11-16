# Connect the Spike Digital Supabase project

The target database cannot be inspected from the Supabase connection currently available to this workspace. The available connection exposes a personal organisation and Nexus Co.; it does not expose **Spike Digital**.

## What to do

1. In ChatGPT, open your connected Apps/Connectors settings and reconnect Supabase using the account that owns the Spike Digital organisation.
2. Make sure that account grants project access to the Hesabu project.
3. Return to this conversation and say that the Spike Digital connection is ready.

You do not need to send a database password, service-role key or secret key in chat. Once the correct organisation is visible, the project reference and region can be read through the connected Supabase integration.

## What will be inspected before any database write

- Organisation and project reference.
- Project status and region.
- Existing schemas, tables, columns, constraints and indexes.
- Existing migrations and any pre-existing application data.
- RLS enabled/disabled state and current policies.
- Security, performance and health advisor findings.

The draft migration under `supabase/migrations/` will only be reconciled against the actual schema. It will not be applied blindly. Any existing tables or user data must be preserved unless a separate, explicit migration decision says otherwise.

## Frontend configuration when ready

The Vercel project that owns `hesabu-seven.vercel.app` is linked to `Mark2631/Hesabu`. Its current environment-variable list is empty, so the frontend has no Supabase URL/key configured yet. The MVP branch has a Vercel preview deployment, but it still runs against the local sample workspace.

The React/Vite app will need the project URL and a **publishable** key in its environment. The example variable names are in `.env.example`. Add them to the preview and production environments only after the project reference has been confirmed.

- Local development: `.env.local` (ignored by Git).
- Vercel: project environment variables for the target environment.
- Never prefix a Supabase secret/service-role key with `VITE_`.
