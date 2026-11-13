import { addDisposer } from '@jbrowse/mobx-state-tree'
import { autorun } from 'mobx'

import { abbrevOf, connectionIdOf } from './hubAttach'

import type { IAnyStateTreeNode } from '@jbrowse/mobx-state-tree'

export type TrackInit = string | { trackId: string; [key: string]: unknown }

export interface InitLaunch {
  assembly?: string
  tracks?: TrackInit | TrackInit[]
  showHitTrack?: boolean
  [key: string]: unknown
}

export interface HoldSession {
  getTrackById(trackId: string): unknown
  assemblyManager: { confByName: Map<string, unknown> }
  connections: { connectionId: string }[]
  connectionInstances?: { connectionId: string; loading: boolean }[]
  hydrateConnection?: (connectionId: string) => void
}

export interface HoldView {
  pendingLaunch?: InitLaunch
  assemblyNames: string[]
  hasDisplayedRegions: boolean
  setLaunch(launch?: InitLaunch): void
}

function asArray<T>(arg: T | T[] | undefined) {
  return arg === undefined ? [] : Array.isArray(arg) ? arg : [arg]
}

function trackIdOf(t: TrackInit) {
  return typeof t === 'string' ? t : t.trackId
}

/**
 * Split a launch's tracks into those that resolve now and those that don't, in
 * URL order. Undefined when nothing needs holding. `showHitTrack` is pinned to
 * what core would have derived from the full list, since the held tracks are
 * missing from the launch it sees.
 */
export function splitLaunch(
  launch: InitLaunch,
  resolves: (trackId: string) => boolean,
) {
  const tracks = asArray(launch.tracks)
  const held = tracks.filter(t => !resolves(trackIdOf(t)))
  if (held.length === 0) {
    return undefined
  }
  return {
    launch: {
      ...launch,
      tracks: tracks.filter(t => resolves(trackIdOf(t))),
      showHitTrack: launch.showHitTrack ?? false,
    },
    held,
  }
}

/**
 * Hold a fresh LinearGenomeView's init tracks that don't resolve yet until its
 * organism's hub connection has loaded or failed, then launch them again
 * through core's init path, which reports any still-unknown id itself.
 */
export function holdInitTracks(
  view: HoldView & IAnyStateTreeNode,
  session: HoldSession,
) {
  const launch = view.pendingLaunch
  if (!launch || view.hasDisplayedRegions) {
    return
  }
  const assembly = launch.assembly ?? view.assemblyNames[0]
  if (!assembly) {
    return
  }
  const abbrev = abbrevOf(assembly)
  if (!session.assemblyManager.confByName.has(abbrev)) {
    return
  }
  const split = splitLaunch(launch, id => !!session.getTrackById(id))
  if (!split) {
    return
  }
  view.setLaunch(split.launch)

  const connectionId = connectionIdOf(abbrev)
  let held: TrackInit[] | undefined = split.held
  let seen = false
  addDisposer(
    view,
    autorun(
      () => {
        if (!held) {
          return
        }
        const instance = session.connectionInstances?.find(
          c => c.connectionId === connectionId,
        )
        seen ||= !!instance
        // a failed connect() removes its instance, so seen-then-gone is settled
        const settled = instance ? !instance.loading : seen
        if (
          !seen &&
          view.hasDisplayedRegions &&
          session.connections.some(c => c.connectionId === connectionId)
        ) {
          // a restored session keeps its hub dormant until asked
          session.hydrateConnection?.(connectionId)
        }
        if (settled && view.hasDisplayedRegions && !view.pendingLaunch) {
          const tracks = held
          held = undefined
          view.setLaunch({ tracks })
        }
      },
      { name: 'VEuPathDBSiteHoldInitTracks' },
    ),
  )
}
