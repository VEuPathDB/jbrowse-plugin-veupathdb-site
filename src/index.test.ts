import {
  ConfigurationSchema,
  readConfObject,
} from '@jbrowse/core/configuration'

import VEuPathDBSitePlugin, { attachHubs, configSchema } from './index'

const TEMPLATE = '/hubs/{abbrev}.hub.json'

const AssemblyConf = ConfigurationSchema('FakeAssembly', {
  name: { type: 'string', defaultValue: '' },
  displayName: { type: 'string', defaultValue: '' },
})

function fakeSession(opts: { withSessionConnections: boolean }) {
  const confByName = new Map(
    [
      ['volvox', 'Volvox imaginary'],
      ['volvox_protein', 'Volvox proteins'],
    ].map(([name, displayName]) => [
      name!,
      AssemblyConf.create({ name, displayName }),
    ]),
  )
  const connections: { connectionId: string }[] = []
  const calls: string[] = []
  const add = (prefix: string) => (conf: { connectionId: string }) => {
    calls.push(`${prefix}:${conf.connectionId}`)
    connections.push(conf)
    return conf
  }
  const session = {
    views: [
      { assemblyNames: ['volvox_protein'] },
      { assemblyNames: ['volvox'] },
    ],
    connections,
    assemblyManager: { has: (n: string) => confByName.has(n), confByName },
    addConnectionConf: add('config'),
    makeConnection(conf: { connectionId: string }, init: object) {
      calls.push(`make:${conf.connectionId}:${JSON.stringify(init)}`)
    },
    ...(opts.withSessionConnections
      ? { addSessionConnectionConf: add('session') }
      : {}),
  }
  return {
    session: session as unknown as Parameters<typeof attachHubs>[0],
    calls,
  }
}

describe('VEuPathDBSitePlugin', () => {
  it('is named VEuPathDBSite and carries the namespaced schema', () => {
    const plugin = new VEuPathDBSitePlugin()
    expect(plugin.name).toBe('VEuPathDBSite')
    expect(plugin.configurationSchema).toBe(configSchema)
  })

  it('defaults hubUrlTemplate to empty', () => {
    expect(readConfObject(configSchema.create({}), 'hubUrlTemplate')).toBe('')
  })
})

describe('attachHubs', () => {
  it('adds one silent session connection for a genome and its proteins', () => {
    const { session, calls } = fakeSession({ withSessionConnections: true })
    attachHubs(session, TEMPLATE)
    expect(calls).toEqual([
      'session:hub-volvox',
      'make:hub-volvox:{"silent":true}',
    ])
  })

  it('is idempotent once the connection exists', () => {
    const { session, calls } = fakeSession({ withSessionConnections: true })
    attachHubs(session, TEMPLATE)
    attachHubs(session, TEMPLATE)
    expect(calls).toHaveLength(2)
  })

  it('falls back to addConnectionConf without session connections', () => {
    const { session, calls } = fakeSession({ withSessionConnections: false })
    attachHubs(session, TEMPLATE)
    expect(calls[0]).toBe('config:hub-volvox')
  })
})
