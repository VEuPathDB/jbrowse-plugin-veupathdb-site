import {
  abbrevOf,
  connectionsToAdd,
  hubUri,
  templateProblem,
} from './hubAttach'

import type { AttachInput } from './hubAttach'

const PAGE = 'https://plasmodb.org/jbrowse/index.html?session=local-1'
const TEMPLATE = '/hubs/{abbrev}.hub.json'

const known = new Map([
  ['volvox', 'Volvox imaginary'],
  ['volvox_protein', 'Volvox imaginary proteins'],
  ['pfal3D7', 'Plasmodium falciparum 3D7'],
  ['pfal3D7_protein', 'P. falciparum 3D7 proteins'],
  ['nohub', 'Organism without hub'],
])

function input(overrides: Partial<AttachInput>): AttachInput {
  return {
    template: TEMPLATE,
    pageHref: PAGE,
    viewAssemblyNames: [],
    existingConnectionIds: [],
    knownAssemblies: known,
    ...overrides,
  }
}

describe('abbrevOf', () => {
  it('strips a trailing _protein', () => {
    expect(abbrevOf('pfal3D7_protein')).toBe('pfal3D7')
  })
  it('leaves a genome assembly name alone', () => {
    expect(abbrevOf('pfal3D7')).toBe('pfal3D7')
  })
  it('strips only a trailing _protein', () => {
    expect(abbrevOf('x_protein_y')).toBe('x_protein_y')
    expect(abbrevOf('x_protein_protein')).toBe('x_protein')
  })
})

describe('templateProblem', () => {
  it('reports an empty template as unset', () => {
    expect(templateProblem('')).toBe('unset')
    expect(templateProblem('  ')).toBe('unset')
  })
  it('reports a template without {abbrev}', () => {
    expect(templateProblem('/hubs/all.hub.json')).toBe('missing-placeholder')
  })
  it('accepts a template with {abbrev}', () => {
    expect(templateProblem(TEMPLATE)).toBeUndefined()
  })
})

describe('hubUri', () => {
  it('resolves a root-relative template against the page', () => {
    expect(hubUri(TEMPLATE, 'pfal3D7', PAGE)).toBe(
      'https://plasmodb.org/hubs/pfal3D7.hub.json',
    )
  })
  it('resolves a document-relative template against the page directory', () => {
    expect(hubUri('hubs/{abbrev}.hub.json', 'pfal3D7', PAGE)).toBe(
      'https://plasmodb.org/jbrowse/hubs/pfal3D7.hub.json',
    )
  })
  it('keeps an absolute template', () => {
    expect(
      hubUri('https://cdn.example.org/{abbrev}/hub.json', 'pfal3D7', PAGE),
    ).toBe('https://cdn.example.org/pfal3D7/hub.json')
  })
  it('replaces every {abbrev}', () => {
    expect(hubUri('/{abbrev}/{abbrev}.json', 'volvox', PAGE)).toBe(
      'https://plasmodb.org/volvox/volvox.json',
    )
  })
})

describe('connectionsToAdd', () => {
  it('adds the hub of an organism whose genome is open', () => {
    expect(
      connectionsToAdd(input({ viewAssemblyNames: [['volvox']] })),
    ).toEqual([
      {
        type: 'JB2TrackHubConnection',
        connectionId: 'hub-volvox',
        name: 'Volvox imaginary',
        uri: 'https://plasmodb.org/hubs/volvox.hub.json',
        assemblyNames: ['volvox', 'volvox_protein'],
      },
    ])
  })

  it('adds the same hub for an organism whose protein assembly is open', () => {
    const [conf] = connectionsToAdd(
      input({ viewAssemblyNames: [['volvox_protein']] }),
    )
    expect(conf?.connectionId).toBe('hub-volvox')
    expect(conf?.name).toBe('Volvox imaginary')
  })

  it('adds nothing for the protein view of an already attached organism', () => {
    expect(
      connectionsToAdd(
        input({
          viewAssemblyNames: [['volvox'], ['volvox_protein']],
          existingConnectionIds: ['hub-volvox'],
        }),
      ),
    ).toEqual([])
  })

  it('adds one connection when genome and protein are both open', () => {
    const confs = connectionsToAdd(
      input({ viewAssemblyNames: [['volvox'], ['volvox_protein']] }),
    )
    expect(confs.map(c => c.connectionId)).toEqual(['hub-volvox'])
  })

  it('adds one connection per organism for two organisms', () => {
    const confs = connectionsToAdd(
      input({ viewAssemblyNames: [['volvox'], ['pfal3D7_protein']] }),
    )
    expect(confs.map(c => [c.connectionId, c.uri])).toEqual([
      ['hub-volvox', 'https://plasmodb.org/hubs/volvox.hub.json'],
      ['hub-pfal3D7', 'https://plasmodb.org/hubs/pfal3D7.hub.json'],
    ])
  })

  it('adds only the missing organism of a synteny view', () => {
    const confs = connectionsToAdd(
      input({
        viewAssemblyNames: [['volvox', 'pfal3D7']],
        existingConnectionIds: ['hub-volvox'],
      }),
    )
    expect(confs.map(c => c.connectionId)).toEqual(['hub-pfal3D7'])
  })

  it('skips a connection already in a restored session', () => {
    expect(
      connectionsToAdd(
        input({
          viewAssemblyNames: [['volvox']],
          existingConnectionIds: ['hub-volvox', 'someone-elses-hub'],
        }),
      ),
    ).toEqual([])
  })

  it('names only the assemblies the session knows', () => {
    const [conf] = connectionsToAdd(input({ viewAssemblyNames: [['nohub']] }))
    expect(conf?.assemblyNames).toEqual(['nohub'])
  })

  it('ignores an assembly whose genome the session does not know', () => {
    expect(connectionsToAdd(input({ viewAssemblyNames: [['hg38']] }))).toEqual(
      [],
    )
  })

  it('attaches nothing when the template is unset', () => {
    expect(
      connectionsToAdd(
        input({ template: '', viewAssemblyNames: [['volvox']] }),
      ),
    ).toEqual([])
  })

  it('attaches nothing when the template has no {abbrev}', () => {
    expect(
      connectionsToAdd(
        input({
          template: '/hubs/all.hub.json',
          viewAssemblyNames: [['volvox'], ['pfal3D7']],
        }),
      ),
    ).toEqual([])
  })

  it('attaches nothing with no views open', () => {
    expect(connectionsToAdd(input({}))).toEqual([])
  })
})
