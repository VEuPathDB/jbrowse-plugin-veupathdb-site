import { types } from '@jbrowse/mobx-state-tree'
import { observable, runInAction } from 'mobx'

import { holdInitTracks, splitLaunch } from './holdInitTracks'

import type { HoldSession, InitLaunch } from './holdInitTracks'

const ViewModel = types
  .model({
    launch: types.frozen<InitLaunch | undefined>(),
    regions: types.array(types.string),
  })
  .volatile(() => ({ launches: [] as (InitLaunch | undefined)[] }))
  .views(self => ({
    get pendingLaunch() {
      return self.launch
    },
    get assemblyNames() {
      return self.regions.length ? [self.launch?.assembly ?? 'volvox'] : []
    },
    get hasDisplayedRegions() {
      return self.regions.length > 0
    },
  }))
  .actions(self => ({
    setLaunch(launch?: InitLaunch) {
      self.launch = launch
      self.launches.push(launch)
    },
    // core's init autorun navigates, shows the launch's tracks, then clears it
    navigate() {
      if (!self.regions.length) {
        self.regions.push('ctgA')
      }
    },
    applyLaunch() {
      this.navigate()
      self.launch = undefined
    },
  }))

function fakeSession(trackIds: string[]) {
  const state = observable({
    tracks: new Set(trackIds),
    connections: [] as { connectionId: string }[],
    connectionInstances: [] as { connectionId: string; loading: boolean }[],
  })
  const hydrated: string[] = []
  const session: HoldSession = {
    getTrackById: id => (state.tracks.has(id) ? { trackId: id } : undefined),
    assemblyManager: {
      confByName: new Map([
        ['volvox', {}],
        ['volvox_protein', {}],
      ]),
    },
    get connections() {
      return state.connections
    },
    get connectionInstances() {
      return state.connectionInstances
    },
    hydrateConnection: id => {
      hydrated.push(id)
      runInAction(() => {
        state.connectionInstances.push({ connectionId: id, loading: true })
      })
    },
  }
  return {
    session,
    hydrated,
    attachHub: (id = 'hub-volvox') => {
      runInAction(() => {
        state.connections.push({ connectionId: id })
        state.connectionInstances.push({ connectionId: id, loading: true })
      })
    },
    hubLoaded: (trackIdsFromHub: string[], id = 'hub-volvox') => {
      runInAction(() => {
        trackIdsFromHub.forEach(t => state.tracks.add(t))
        state.connectionInstances.find(c => c.connectionId === id)!.loading =
          false
      })
    },
    hubFailed: (id = 'hub-volvox') => {
      runInAction(() => {
        const i = state.connectionInstances.findIndex(
          c => c.connectionId === id,
        )
        state.connectionInstances.splice(i, 1)
      })
    },
    restoreConnectionConf: (id = 'hub-volvox') => {
      runInAction(() => state.connections.push({ connectionId: id }))
    },
  }
}

function freshView(launch: InitLaunch) {
  return ViewModel.create({ launch })
}

describe('splitLaunch', () => {
  it('returns undefined when every track resolves', () => {
    expect(splitLaunch({ tracks: ['a', 'b'] }, () => true)).toBeUndefined()
  })

  it('keeps URL order in both halves and pins showHitTrack', () => {
    const split = splitLaunch(
      { assembly: 'volvox', loc: 'ctgA', tracks: ['h1', 'r1', 'h2', 'r2'] },
      id => id.startsWith('r'),
    )
    expect(split).toEqual({
      launch: {
        assembly: 'volvox',
        loc: 'ctgA',
        tracks: ['r1', 'r2'],
        showHitTrack: false,
      },
      held: ['h1', 'h2'],
    })
  })

  it('keeps an explicit showHitTrack and object track inits', () => {
    const hub = { trackId: 'h1', height: 200 }
    const split = splitLaunch(
      { tracks: [hub], showHitTrack: true },
      () => false,
    )
    expect(split?.launch.showHitTrack).toBe(true)
    expect(split?.held).toEqual([hub])
  })

  it('reads a bare string track', () => {
    expect(splitLaunch({ tracks: 'h1' }, () => false)?.held).toEqual(['h1'])
  })
})

describe('holdInitTracks', () => {
  it('holds a hub track, then shows it once the hub loads', () => {
    const { session, attachHub, hubLoaded } = fakeSession(['volvox_refseq'])
    const view = freshView({ assembly: 'volvox', tracks: ['hub_genes'] })
    holdInitTracks(view, session)
    expect(view.launch?.tracks).toEqual([])
    view.applyLaunch()
    attachHub()
    expect(view.launches).toHaveLength(1)
    hubLoaded(['hub_genes'])
    expect(view.launches.at(-1)).toEqual({ tracks: ['hub_genes'] })
  })

  it('shows held tracks in URL order after the resolvable ones', () => {
    const { session, attachHub, hubLoaded } = fakeSession(['volvox_refseq'])
    const view = freshView({
      assembly: 'volvox',
      tracks: ['hub_b', 'volvox_refseq', 'hub_a'],
    })
    holdInitTracks(view, session)
    expect(view.launch?.tracks).toEqual(['volvox_refseq'])
    view.applyLaunch()
    attachHub()
    hubLoaded(['hub_a', 'hub_b'])
    expect(view.launches.at(-1)).toEqual({ tracks: ['hub_b', 'hub_a'] })
  })

  it('does not touch a launch whose tracks all resolve', () => {
    const { session } = fakeSession(['volvox_refseq'])
    const launch = { assembly: 'volvox', tracks: ['volvox_refseq'] }
    const view = freshView(launch)
    holdInitTracks(view, session)
    expect(view.launch).toBe(launch)
    expect(view.launches).toHaveLength(0)
  })

  it('releases an id the loaded hub lacks, so core reports it', () => {
    const { session, attachHub, hubLoaded } = fakeSession([])
    const view = freshView({ assembly: 'volvox', tracks: ['hub_genez'] })
    holdInitTracks(view, session)
    view.applyLaunch()
    attachHub()
    hubLoaded(['hub_genes'])
    expect(view.launches.at(-1)).toEqual({ tracks: ['hub_genez'] })
  })

  it('releases held tracks when the hub fails to load', () => {
    const { session, attachHub, hubFailed } = fakeSession([])
    const view = freshView({ assembly: 'volvox', tracks: ['hub_genes'] })
    holdInitTracks(view, session)
    view.applyLaunch()
    attachHub()
    hubFailed()
    expect(view.launches.at(-1)).toEqual({ tracks: ['hub_genes'] })
  })

  it('waits for the original launch to be applied before releasing', () => {
    const { session, attachHub, hubLoaded } = fakeSession([])
    const view = freshView({ assembly: 'volvox', tracks: ['hub_genes'] })
    holdInitTracks(view, session)
    view.navigate()
    attachHub()
    hubLoaded(['hub_genes'])
    expect(view.launches).toHaveLength(1)
    view.applyLaunch()
    expect(view.launches.at(-1)).toEqual({ tracks: ['hub_genes'] })
  })

  it('waits on the organism hub for a protein assembly', () => {
    const { session, attachHub, hubLoaded } = fakeSession([])
    const view = freshView({
      assembly: 'volvox_protein',
      tracks: ['hub_domains'],
    })
    holdInitTracks(view, session)
    view.applyLaunch()
    attachHub('hub-volvox')
    hubLoaded(['hub_domains'], 'hub-volvox')
    expect(view.launches.at(-1)).toEqual({ tracks: ['hub_domains'] })
  })

  it('hydrates a dormant restored hub connection', () => {
    const { session, hydrated, restoreConnectionConf, hubLoaded } = fakeSession(
      [],
    )
    restoreConnectionConf()
    const view = freshView({ assembly: 'volvox', tracks: ['hub_genes'] })
    holdInitTracks(view, session)
    view.applyLaunch()
    expect(hydrated).toEqual(['hub-volvox'])
    hubLoaded(['hub_genes'])
    expect(view.launches.at(-1)).toEqual({ tracks: ['hub_genes'] })
  })

  it('leaves an assembly the session does not know alone', () => {
    const { session } = fakeSession([])
    const launch = { assembly: 'mystery', tracks: ['t'] }
    const view = freshView(launch)
    holdInitTracks(view, session)
    expect(view.launch).toBe(launch)
  })

  it('leaves an already navigated view alone', () => {
    const { session } = fakeSession([])
    const view = ViewModel.create({
      launch: { tracks: ['hub_genes'] },
      regions: ['ctgA'],
    })
    holdInitTracks(view, session)
    expect(view.launches).toHaveLength(0)
  })

  it('releases once, not on every later hub change', () => {
    const { session, attachHub, hubLoaded, hubFailed } = fakeSession([])
    const view = freshView({ assembly: 'volvox', tracks: ['hub_genes'] })
    holdInitTracks(view, session)
    view.applyLaunch()
    attachHub()
    hubLoaded(['hub_genes'])
    view.applyLaunch()
    hubFailed()
    expect(view.launches).toHaveLength(2)
  })
})
