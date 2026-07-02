'use client'

import { useEffect, useRef, useState } from 'react'
import IntroFlow from './IntroFlow'

/**
 * Shows the real flow diagram from `public/flow.png`. If that file is missing
 * (404) it falls back to the built-in CSS schematic, so the intro is never
 * empty. To change the diagram, replace `public/flow.png` and redeploy.
 */
export default function IntroVisual() {
  const ref = useRef<HTMLImageElement>(null)
  const [status, setStatus] = useState<'loading' | 'ok' | 'err'>('loading')

  // A cached image can finish loading before React attaches onLoad during
  // hydration — so check `complete` on mount to avoid getting stuck on loading.
  useEffect(() => {
    const img = ref.current
    if (img && img.complete) setStatus(img.naturalWidth > 0 ? 'ok' : 'err')
  }, [])

  return (
    <>
      {/* Full-bleed, centered on the viewport so the diagram can be larger than
          the text column. The img stays mounted (hidden until ok) so it loads. */}
      <div
        className={
          status === 'ok'
            ? 'mt-10 ml-[calc(50%-50vw)] flex w-screen flex-col items-center px-4'
            : 'hidden'
        }
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={ref}
          src="/flow.png"
          alt="The review flow: rate an order, choose what you liked (the step the two versions differ on), then review and submit."
          onLoad={() => setStatus('ok')}
          onError={() => setStatus('err')}
          className="w-full max-w-4xl"
        />
        <p className="mt-4 max-w-xl text-center text-[13px] leading-relaxed text-muted">
          The middle step is where the two versions differ — that&rsquo;s what you&rsquo;re
          voting on.
        </p>
      </div>
      {status !== 'ok' && <IntroFlow />}
    </>
  )
}
