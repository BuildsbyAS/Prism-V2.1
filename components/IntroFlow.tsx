import { Fragment } from 'react'

// A small schematic of the review journey shown on the intro screen. The middle
// step — choosing what you liked — is the part the two prototypes implement
// differently, so it's highlighted. Kept neutral: never reveals A/B = Pills/Checkbox.
const STEPS: { no: number; label: string; compare?: boolean }[] = [
  { no: 1, label: 'Rate an order' },
  { no: 2, label: 'Choose what you liked', compare: true },
  { no: 3, label: 'Review & submit' },
]

function PhoneInner({ step }: { step: number }) {
  if (step === 1) {
    return (
      <>
        <div className="space-y-1.5">
          <div className="h-1.5 w-3/4 rounded-full bg-black/[0.1]" />
          <div className="h-1.5 w-1/2 rounded-full bg-black/[0.06]" />
        </div>
        <div className="mt-auto pb-0.5 text-center text-[11px] tracking-[0.2em] text-black/25">
          ★★★☆☆
        </div>
      </>
    )
  }
  if (step === 2) {
    return (
      <div className="space-y-2.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center justify-between gap-1.5">
            <div className="h-1.5 flex-1 rounded-full bg-black/[0.1]" />
            <div className="h-2.5 w-2.5 shrink-0 rounded-[3px] border border-black/30" />
          </div>
        ))}
      </div>
    )
  }
  return (
    <>
      <div className="space-y-1.5">
        <div className="h-1.5 w-full rounded-full bg-black/[0.08]" />
        <div className="h-1.5 w-5/6 rounded-full bg-black/[0.08]" />
        <div className="h-1.5 w-2/3 rounded-full bg-black/[0.08]" />
      </div>
      <div className="mt-auto h-3.5 rounded-md bg-ink" />
    </>
  )
}

export default function IntroFlow() {
  return (
    <div className="mt-8">
      <div className="flex flex-col items-center gap-1 sm:flex-row sm:items-start sm:gap-0">
        {STEPS.map((s, i) => (
          <Fragment key={s.no}>
            <div className="flex w-[112px] flex-col items-center gap-2">
              <div
                className={`relative flex h-[150px] w-[88px] flex-col rounded-[22px] border bg-card p-2.5 ${
                  s.compare ? 'border-ink' : 'border-line'
                }`}
              >
                <div className="mx-auto mb-2 h-1 w-7 rounded-full bg-black/[0.12]" />
                <PhoneInner step={s.no} />
              </div>
              <div className="px-1 text-center">
                <div className="text-[11px] font-semibold leading-tight">{s.label}</div>
                {s.compare && (
                  <div className="mt-0.5 text-[10.5px] font-medium text-muted">
                    you compare this
                  </div>
                )}
              </div>
            </div>
            {i < STEPS.length - 1 && (
              <div className="flex shrink-0 items-center justify-center text-lg leading-none text-muted sm:pt-[64px]">
                <span className="rotate-90 sm:rotate-0">→</span>
              </div>
            )}
          </Fragment>
        ))}
      </div>
      <p className="mt-4 text-[13px] leading-relaxed text-muted">
        The two versions differ in the middle step — that&rsquo;s what you&rsquo;re voting on.
      </p>
    </div>
  )
}
