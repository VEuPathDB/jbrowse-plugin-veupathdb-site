export const ABBREV_PLACEHOLDER = '{abbrev}'

export interface HubConnectionConf {
  type: 'JB2TrackHubConnection'
  connectionId: string
  name: string
  uri: string
  assemblyNames: string[]
}

export interface AttachInput {
  template: string
  pageHref: string
  viewAssemblyNames: string[][]
  existingConnectionIds: string[]
  // assembly name -> displayName, for every assembly the session knows
  knownAssemblies: Map<string, string>
}

export type TemplateProblem = 'unset' | 'missing-placeholder'

export function abbrevOf(assemblyName: string) {
  return assemblyName.replace(/_protein$/, '')
}

export function connectionIdOf(abbrev: string) {
  return `hub-${abbrev}`
}

export function templateProblem(template: string): TemplateProblem | undefined {
  if (!template.trim()) {
    return 'unset'
  }
  if (!template.includes(ABBREV_PLACEHOLDER)) {
    return 'missing-placeholder'
  }
  return undefined
}

// A runtime JB2TrackHubConnection needs an absolute uri; a root-relative one
// throws `Failed to construct 'URL': Invalid URL`.
export function hubUri(template: string, abbrev: string, pageHref: string) {
  return new URL(
    template.replaceAll(ABBREV_PLACEHOLDER, encodeURIComponent(abbrev)),
    pageHref,
  ).href
}

export function connectionsToAdd({
  template,
  pageHref,
  viewAssemblyNames,
  existingConnectionIds,
  knownAssemblies,
}: AttachInput): HubConnectionConf[] {
  if (templateProblem(template)) {
    return []
  }
  const existing = new Set(existingConnectionIds)
  const added = new Map<string, HubConnectionConf>()
  for (const name of viewAssemblyNames.flat()) {
    const abbrev = abbrevOf(name)
    const connectionId = connectionIdOf(abbrev)
    const displayName = knownAssemblies.get(abbrev)
    if (
      displayName === undefined ||
      existing.has(connectionId) ||
      added.has(connectionId)
    ) {
      continue
    }
    added.set(connectionId, {
      type: 'JB2TrackHubConnection',
      connectionId,
      name: displayName,
      uri: hubUri(template, abbrev, pageHref),
      assemblyNames: [abbrev, `${abbrev}_protein`].filter(n =>
        knownAssemblies.has(n),
      ),
    })
  }
  return [...added.values()]
}
