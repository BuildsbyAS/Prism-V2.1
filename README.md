# RnR 2.0 — A/B preference poll

A single shareable page that puts two Ratings & Reviews prototypes side by side,
lets visitors try both, vote **A / B / Both**, leave an optional note, and see
**live results**. Built with Next.js + Supabase, deployed on Vercel.

- **A** = Pills prototype · **B** = Checkbox prototype
- Both prototypes are bundled as static builds in `public/proto/{pills,checkbox}`.

## How it works

- `app/page.tsx` — the poll UI (a client component).
- `lib/supabase.ts` — browser Supabase client (reads the two `NEXT_PUBLIC_*` env vars).
- `supabase/schema.sql` — the `votes` table + Row-Level Security policies.
- Without env vars the app runs in **demo mode** (votes kept in-browser only).

## 1. Set up Supabase

1. Create a free account + project at <https://supabase.com> (New project → pick a
   name + database password → wait ~2 min for it to provision).
2. Open **SQL Editor → New query**, paste the contents of
   [`supabase/schema.sql`](supabase/schema.sql), and click **Run**.
3. Open **Project Settings → API** and copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **Project API keys → `anon` `public`** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Both keys are safe to expose publicly — RLS only allows inserting and reading votes.

## 2. Run locally

```bash
npm install
# put your keys in .env.local
npm run dev   # http://localhost:3000
```

## 3. Deploy to Vercel

```bash
vercel            # link + preview deploy
vercel --prod     # production
```

Add the two `NEXT_PUBLIC_*` env vars in **Vercel → Project → Settings →
Environment Variables** (or `vercel env add`), then redeploy so they're inlined
into the build. The production URL is your shareable poll link.

## Viewing results

Voters see live tallies after submitting. You can also see every row (including
comments) in **Supabase → Table editor → `votes`**.
