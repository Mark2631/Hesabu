# Connect the Hesabu Supabase project

The target project has been identified from the Supabase dashboard screenshot:

- Project reference: `waadpyucxpgvbkpzbnju`
- Project URL: `https://waadpyucxpgvbkpzbnju.supabase.co`
- Account: Mark Sanchez (`marksanchez2631@gmail.com`)
- Dashboard status shown: Healthy
- Dashboard activity shown: no migrations, no branches and no backups

However, the connected Supabase API in this workspace currently lists other projects under the Mark Sanchez connector and returns a permission error for this reference. The project schema and advisor reports therefore remain unread.

## What to do

1. Open the connected Apps/Connectors settings and reconnect Supabase to the Mark Sanchez account that owns project `waadpyucxpgvbkpzbnju`.
2. Confirm that the connection can list and read that exact project.
3. Return to this conversation and say that the project connection is ready.

You do not need to send a database password, service-role key or secret key in chat. Once the correct organisation is visible, the project reference and region can be read through the connected Supabase integration.

## What will be inspected before any database write

- Organisation and project reference.
- Project status and region.
- Existing schemas, tables, columns, constraints and indexes.
- Existing migrations and any pre-existing application data.
- RLS enabled/disabled state and current policies.
- Security, performance and health advisor findings.

The two draft migrations under `MVP/supabase/migrations/` will only be reconciled against the actual schema. They will not be applied blindly. Any existing tables or user data must be preserved unless a separate migration decision says otherwise.

## Frontend configuration when ready

The Vercel project that owns `hesabu-seven.vercel.app` is linked to `Mark2631/Hesabu`. The Supabase URL and publishable key have now been added to the `build/hesabu-mvp-cloud-foundation` Preview branch environment only. Production was left untouched. This configures the preview build but does not prove live database access or apply any migration.

The React/Vite app will need the project URL and a **publishable** key in its environment. The example variable names are in `.env.example`. Add them to the preview and production environments only after the project reference has been confirmed.

- Local development: `.env.local` (ignored by Git).
- Vercel: project environment variables for the target environment.
- Never prefix a Supabase secret/service-role key with `VITE_`.
