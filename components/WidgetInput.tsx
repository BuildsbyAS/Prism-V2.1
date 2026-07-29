'use client'

import { Microphone, Star as StarIcon } from '@phosphor-icons/react'

import { useEffect, useRef, useState } from 'react'
import type { Widget, AnswerValue } from '@/lib/types'
import { uploadAsset } from '@/lib/assets'

interface Props {
  widget: Widget
  value: AnswerValue | undefined
  onChange: (value: AnswerValue) => void
  // Suppress the question label — used by the builder's inline preview (the label
  // is edited above the input) and when the widget's title is toggled off.
  hideLabel?: boolean
}

/** Renders a single feedback widget for the voter and reports its value up. */
export default function WidgetInput({ widget, value, onChange, hideLabel = false }: Props) {
  const { config } = widget
  const label = config.label || defaultLabel(widget)

  return (
    <div>
      {!hideLabel && (
        <p className="mb-2 text-[15px] font-medium">
          {label}
          {config.required && <span className="ml-1 text-red-500">*</span>}
        </p>
      )}

      {widget.type === 'rating' && (
        <Rating allowHalf={Boolean(config.allowHalf)} value={typeof value === 'number' ? value : 0} onChange={onChange} />
      )}

      {widget.type === 'slider' && (
        <Slider
          min={config.min ?? 0}
          max={config.max ?? 100}
          minLabel={config.minLabel}
          maxLabel={config.maxLabel}
          value={typeof value === 'number' ? value : Math.round(((config.min ?? 0) + (config.max ?? 100)) / 2)}
          onChange={onChange}
        />
      )}

      {widget.type === 'radio' && (
        <div className="space-y-2">
          {(config.choices?.length ? config.choices : ['Option 1', 'Option 2']).map((choice) => {
            const selected = value === choice
            return (
              <button
                key={choice}
                type="button"
                onClick={() => onChange(choice)}
                className={`flex w-full items-center gap-2.5 rounded-[16px] border px-4 py-2.5 text-left text-sm transition ${
                  selected
                    ? 'border-transparent bg-black/[0.06] font-medium'
                    : 'border-line-strong hover:bg-black/[0.03]'
                }`}
              >
                <span
                  className={`grid h-4 w-4 place-items-center rounded-full border ${
                    selected ? 'border-ink' : 'border-line-strong'
                  }`}
                >
                  {selected && <span className="h-2 w-2 rounded-full bg-ink" />}
                </span>
                {choice}
              </button>
            )
          })}
        </div>
      )}

      {widget.type === 'text' && (
        <textarea
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          rows={config.long ? 4 : 2}
          maxLength={2000}
          placeholder={config.placeholder || 'Type your answer…'}
          className="w-full resize-none rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm outline-none placeholder:text-muted focus:border-ink"
        />
      )}

      {widget.type === 'voice' && (
        <VoiceInput value={typeof value === 'string' ? value : ''} onChange={onChange} />
      )}
    </div>
  )
}

function fmtTime(s: number): string {
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

/** Voice feedback — record from the mic, play back, or re-record. The recording
 *  is stored as a base64 data URL (the same shape uploaded media uses). */
function VoiceInput({ value, onChange }: { value: string; onChange: (v: AnswerValue) => void }) {
  const [recording, setRecording] = useState(false)
  const [saving, setSaving] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const MAX_SEC = 120

  function clearTimer() {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
  }
  useEffect(() => clearTimer, [])

  function stop() {
    recorderRef.current?.stop()
    setRecording(false)
    clearTimer()
  }

  async function start() {
    setError(null)
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Recording isn’t supported in this browser.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        setSaving(true)
        uploadAsset(blob, { prefix: 'voice' })
          .then((url) => onChange(url))
          .catch(() => setError('Couldn’t save the recording.'))
          .finally(() => setSaving(false))
      }
      recorder.start()
      recorderRef.current = recorder
      setRecording(true)
      setElapsed(0)
      timerRef.current = setInterval(() => {
        setElapsed((s) => {
          if (s + 1 >= MAX_SEC) stop()
          return s + 1
        })
      }, 1000)
    } catch {
      setError('Microphone access was blocked.')
    }
  }

  if (value) {
    return (
      <div className="flex items-center gap-3">
        <audio src={value} controls className="h-10 w-full min-w-0" />
        <button type="button" onClick={() => onChange('')} className="flex-none rounded-[14px] border border-line-strong px-3 py-2 text-[13px] font-medium text-muted transition hover:bg-black/[0.03] hover:text-ink">
          Re-record
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {recording ? (
        <button type="button" onClick={stop} className="flex w-full items-center justify-center gap-2 rounded-[16px] bg-red-600 px-5 py-2.5 text-[14px] font-medium text-white transition hover:opacity-90">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-white" /> Stop recording · {fmtTime(elapsed)}
        </button>
      ) : saving ? (
        <div className="flex w-full items-center justify-center gap-2 rounded-[16px] border border-line-strong px-5 py-2.5 text-[14px] font-medium text-muted">
          Saving recording…
        </div>
      ) : (
        <button type="button" onClick={start} className="flex w-full items-center justify-center gap-2 rounded-[16px] border border-line-strong px-5 py-2.5 text-[14px] font-medium text-ink transition hover:bg-black/[0.03]">
          <Microphone size={16} aria-hidden="true" /> Record a voice note
        </button>
      )}
      {error && <p className="text-[13px] text-red-600">{error}</p>}
    </div>
  )
}

function defaultLabel(w: Widget): string {
  switch (w.type) {
    case 'rating':
      return 'How would you rate this?'
    case 'slider':
      return 'Where do you land?'
    case 'radio':
      return 'Pick one'
    case 'text':
      return 'Tell us more'
    case 'voice':
      return 'Leave a voice note'
  }
}

function Rating({ allowHalf, value, onChange }: { allowHalf: boolean; value: number; onChange: (n: number) => void }) {
  // Preview the rating the pointer is over; fall back to the committed value.
  const [hover, setHover] = useState<number | null>(null)
  const shown = hover ?? value
  return (
    <div className="flex gap-1.5" onMouseLeave={() => setHover(null)}>
      {Array.from({ length: 5 }, (_, i) => i + 1).map((n) => (
        <div key={n} className="relative h-[30px] w-[30px]">
          <Star fill={shown >= n ? 1 : shown >= n - 0.5 ? 0.5 : 0} />
          {allowHalf && (
            <button
              type="button"
              aria-label={`${n - 0.5} stars`}
              onMouseEnter={() => setHover(n - 0.5)}
              onClick={() => onChange(n - 0.5)}
              className="absolute inset-y-0 left-0 z-10 w-1/2"
            />
          )}
          <button
            type="button"
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            onMouseEnter={() => setHover(n)}
            onClick={() => onChange(n)}
            className={allowHalf ? 'absolute inset-y-0 right-0 w-1/2' : 'absolute inset-0'}
          />
        </div>
      ))}
    </div>
  )
}

/** A single 30px star filled 0 / 50 / 100% — the fill is a filled star clipped
 *  to `fill` of the width, layered over the empty outline. */
function Star({ fill }: { fill: number }) {
  return (
    <span className="pointer-events-none absolute inset-0 block">
      <StarSvg filled={false} />
      {fill > 0 && (
        <span className="absolute left-0 top-0 h-full overflow-hidden" style={{ width: `${fill * 100}%` }}>
          <StarSvg filled />
        </span>
      )}
    </span>
  )
}

function StarSvg({ filled }: { filled: boolean }) {
  // Two weights of the same Phosphor star rather than one path with swapped
  // fills — an outline star drawn at fill weight reads heavier than the rest of
  // the set, and `duotone` would bring a second colour the UI doesn't use.
  return (
    <StarIcon
      size={30}
      weight={filled ? 'fill' : 'regular'}
      aria-hidden="true"
      className={`block ${filled ? 'text-ink' : 'text-line-strong'}`}
    />
  )
}

function Slider({
  min,
  max,
  minLabel,
  maxLabel,
  value,
  onChange,
}: {
  min: number
  max: number
  minLabel?: string
  maxLabel?: string
  value: number
  onChange: (n: number) => void
}) {
  return (
    <div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#18191d]"
      />
      <div className="mt-1 flex items-center justify-between text-[14px] text-muted">
        <span>{minLabel || min}</span>
        <span className="rounded-full bg-black/[0.06] px-2 py-0.5 text-[13px] font-medium tabular-nums text-ink">
          {value}
        </span>
        <span>{maxLabel || max}</span>
      </div>
    </div>
  )
}
