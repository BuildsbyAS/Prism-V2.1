# Prism — structured feedback, built in minutes

Prism is an internal feedback-and-comparison tool. A creator builds a feedback
flow — compare prototypes, rate, slide, choose, comment — publishes it as a
shareable link, and reads decision-ready results. It was designed first for
design comparison, but works for any internal feedback.

Built with **Next.js 16** (App Router) + **Supabase** (Postgres, Auth, Storage),
deployed on **Vercel**.

## The two sides of the product

**Creators** (Noon accounts) sign in, build forms in a workspace, and read results:

- `app/page.tsx` — landing page.
- `app/login/page.tsx` + `app/auth/callback/route.ts` — Google OAuth, gated to
  `@noon.com` accounts.
- `app/creator/page.tsx` — the creator dashboard (all your forms).
- `app/creator/[formId]/edit/page.tsx` — the form editor (Simple & Canvas
  builders live under `components/builder/`).
- `app/creator/[formId]/results/page.tsx` — aggregated results, per-widget.

**Voters** open a public link, work through the flow, and (optionally) see results:

- `app/f/[slug]/page.tsx` — the public feedback flow: welcome → pages → thank-you.

## How a form is shaped

A `form` owns ordered `pages`; each page carries `options` (the media/prototypes
being evaluated — image, video, Figma frame, or a hosted React prototype) and
`widgets` (the questions — `rating`, `slider`, `radio`, `text`, `voice`). Voter
submissions land as `responses` with `response_answers`. The full schema, RLS
policies, and the public `assets` storage bucket are defined in
[`supabase/schema.sql`](supabase/schema.sql).

Key libraries:

- `lib/supabase.ts` / `lib/supabase-server.ts` — browser & server Supabase clients.
- `lib/auth.ts` — current-creator hook and the `@noon.com` gate.
- `lib/store.ts` — data access for forms/pages/responses (+ demo-mode fallback).
- `lib/builder.ts`, `lib/types.ts`, `lib/embed.ts`, `lib/assets.ts`,
  `lib/image.ts`, `lib/format.ts` — builder state, types, media embedding, uploads.

**Demo mode:** without Supabase env vars the app runs fully in-browser with a
stub `@noon.com` creator always signed in, so the creator flow is explorable
with no backend.

## 1. Set up Supabase

1. Create a project at <https://supabase.com>.
2. **SQL Editor → New query** → paste [`supabase/schema.sql`](supabase/schema.sql)
   → **Run**. This creates the tables, RLS policies, and the `assets` bucket.
3. **Authentication → Providers → Google** — enable it and set the callback to
   `<your-app-url>/auth/callback`.
4. **Project Settings → API** — copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **Project API keys → `anon` `public`** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

The `anon` key is safe to expose — RLS enforces access (and the `@noon.com` gate
is enforced server-side via the `is_noon_user()` helper, not just at the OAuth
screen).

## 2. Run locally

```bash
npm install
# put NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local
npm run dev   # http://localhost:3000
```

Omit the env vars to run in demo mode.

## 3. Deploy to Vercel

```bash
vercel            # link + preview deploy
vercel --prod     # production
```

Add the two `NEXT_PUBLIC_*` env vars in **Vercel → Project → Settings →
Environment Variables**, then redeploy so they're inlined into the build. Point
the Supabase Google callback at your production URL.
