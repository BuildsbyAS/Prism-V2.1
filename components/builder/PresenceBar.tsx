'use client'

import { X } from '@phosphor-icons/react'
import Tooltip from '@/components/Tooltip'
import { personColor, personInitials, personName } from '@/lib/format'
import type { PresencePeer } from '@/lib/presence'

/** Past this the stack becomes a count — five faces is already a crowded bar. */
const MAX_FACES = 4

/**
 * Who else has this form open, sitting beside the Publish button.
 *
 * A form has collaborators, so the question "is anyone else in here right now"
 * has to be answerable before you rename a page under someone. Faces rather than
 * a count: the point is *who*, and one click on a face follows them.
 *
 * Your own avatar is included and comes first. Without it the row reads as a
 * list of strangers with no anchor, and on a form nobody else is in it would
 * simply be empty — which looks broken rather than quiet.
 */
export default function PresenceBar({
  peers,
  /** The form's creator, always labelled as such — see the publish dialog. */
  ownerEmail,
  /** Turns a screen id into something worth reading in a tooltip. */
  screenLabel,
  /** Email of the peer currently being followed, if any. */
  following,
  onFollow,
  onStopFollowing,
}: {
  peers: PresencePeer[]
  ownerEmail: string | null
  screenLabel: (screen: string) => string
  following: string | null
  onFollow: (email: string) => void
  onStopFollowing: () => void
}) {
  if (peers.length === 0) return null
  const shown = peers.slice(0, MAX_FACES)
  const overflow = peers.length - shown.length
  const followed = peers.find((p) => p.email === following)

  return (
    <div className="flex items-center gap-2">
      {followed && (
        // Follow mode is a state you can be in without meaning to — you clicked a
        // face, and now the canvas moves on its own. It says so, and says how to
        // stop. Their colour is a dot rather than the whole pill: a saturated fill
        // beside Publish read as a warning, which this isn't.
        <button
          type="button"
          onClick={onStopFollowing}
          className="hidden items-center gap-1.5 rounded-full border border-line-strong bg-card py-1 pl-2 pr-2 text-[13px] font-medium text-ink transition hover:bg-black/[0.03] lg:inline-flex"
        >
          <span
            className="u-circle h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: personColor(followed.email) }}
            aria-hidden="true"
          />
          Following {personName(followed.email).split(' ')[0]}
          <X size={11} weight="bold" aria-hidden="true" className="text-muted" />
        </button>
      )}
      <div className="flex items-center">
        {shown.map((peer) => {
          const isOwner = Boolean(ownerEmail && peer.email.toLowerCase() === ownerEmail.toLowerCase())
          const who = peer.self ? 'You' : personName(peer.email)
          const label = `${who}${isOwner ? ' · owner' : ''} · ${screenLabel(peer.screen)}${
            peer.self ? '' : following === peer.email ? ' · following' : ' · click to follow'
          }`
          const face = (
            // u-circle opts out of the global corner smoothing, which turns a
            // full-radius square into a visible squircle — the same treatment the
            // dashboard's avatars use, at the same 28px.
            <span
              className="u-circle grid h-7 w-7 place-items-center rounded-full text-[11px] font-semibold text-white ring-2 ring-bg"
              style={{ backgroundColor: personColor(peer.email) }}
            >
              {personInitials(peer.email)}
            </span>
          )
          return (
            <Tooltip key={peer.email} label={label} side="bottom" className="-ml-2 first:ml-0">
              {peer.self ? (
                face
              ) : (
                <button
                  type="button"
                  onClick={() => (following === peer.email ? onStopFollowing() : onFollow(peer.email))}
                  aria-label={label}
                  aria-pressed={following === peer.email}
                  // The followed face keeps a ring in the accent colour so the
                  // stack itself shows who you're watching.
                  className={`u-circle rounded-full transition hover:opacity-90 ${
                    following === peer.email ? 'ring-2 ring-ink/60 ring-offset-1 ring-offset-bg' : ''
                  }`}
                >
                  {face}
                </button>
              )}
            </Tooltip>
          )
        })}
        {overflow > 0 && (
          <span className="u-circle -ml-2 grid h-7 min-w-7 place-items-center rounded-full bg-black/[0.08] px-1 text-[11px] font-semibold text-muted ring-2 ring-bg">
            +{overflow}
          </span>
        )}
      </div>
    </div>
  )
}
