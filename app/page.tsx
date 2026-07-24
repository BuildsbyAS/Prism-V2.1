import Link from 'next/link'

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[720px] flex-col justify-center px-5 py-16">
      <p className="text-[14px] font-medium text-muted">Prism · Noon Product</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-[40px] sm:leading-[1.1]">
        Structured feedback,
        <br />
        built in minutes.
      </h1>
      <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-muted">
        Build a feedback flow — compare prototypes, rate, slide, choose, comment — publish it via a
        link, and read decision-ready results. Designed first for design comparison, built for any
        internal feedback.
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Link
          href="/creator"
          className="rounded-[16px] bg-ink px-5 py-2.5 text-[14px] font-medium text-white transition hover:opacity-90"
        >
          Go to your workspace →
        </Link>
        <Link
          href="/login"
          className="rounded-[16px] border border-line-strong px-5 py-2.5 text-[14px] font-medium text-ink transition hover:bg-black/[0.03]"
        >
          Sign in
        </Link>
      </div>

      <div className="mt-14 grid gap-4 sm:grid-cols-3">
        <Feature title="Welcome → decide → done" body="A clean three-screen journey you author, framing exactly what voters evaluate." />
        <Feature title="Live prototypes" body="Embed images, video, Figma frames, or hosted React prototypes voters interact with." />
        <Feature title="Your call on results" body="Show voters the live tally, or just collect responses — one toggle." />
      </div>
    </main>
  )
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[26px] border border-line bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_16px_44px_-24px_rgba(0,0,0,0.18)]">
      <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
      <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{body}</p>
    </div>
  )
}
