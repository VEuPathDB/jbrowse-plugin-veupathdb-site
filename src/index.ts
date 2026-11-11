import {
  ConfigurationSchema,
  readConfObject,
} from '@jbrowse/core/configuration'
import Plugin from '@jbrowse/core/Plugin'
import { addDisposer } from '@jbrowse/mobx-state-tree'
import { autorun } from 'mobx'

import { abbrevOf, connectionsToAdd, templateProblem } from './hubAttach'

import type { HubConnectionConf } from './hubAttach'
import type { AnyConfigurationModel } from '@jbrowse/core/configuration'
import type PluginManager from '@jbrowse/core/PluginManager'
import type { IAnyModelType, IAnyStateTreeNode } from '@jbrowse/mobx-state-tree'

export const PLUGIN_NAME = 'VEuPathDBSite'

export const configSchema = ConfigurationSchema(PLUGIN_NAME, {
  hubUrlTemplate: {
    type: 'string',
    defaultValue: '',
    description:
      "URL of an organism's track hub (a JBrowse 2 config.json); {abbrev} is replaced by the organism abbreviation. Relative URLs resolve against the page. Empty: no hubs are attached.",
  },
})

interface HubSession {
  jbrowse: { configuration: AnyConfigurationModel }
  views: { assemblyNames?: string[] }[]
  connections: { connectionId: string }[]
  assemblyManager: {
    has(name: string): boolean
    confByName: Map<string, AnyConfigurationModel>
  }
  // MST actions are bound to their node, so these are safe to call detached
  addSessionConnectionConf?: (conf: HubConnectionConf) => AnyConfigurationModel
  addConnectionConf: (conf: HubConnectionConf) => AnyConfigurationModel
  makeConnection: (conf: AnyConfigurationModel, init?: object) => unknown
}

function knownAssemblies(session: HubSession, viewNames: string[][]) {
  const known = new Map<string, string>()
  for (const name of viewNames.flat()) {
    const abbrev = abbrevOf(name)
    for (const n of [abbrev, `${abbrev}_protein`]) {
      const conf = session.assemblyManager.confByName.get(n)
      if (conf && !known.has(n)) {
        const displayName = readConfObject(conf, 'displayName') as
          string | undefined
        known.set(n, displayName?.trim() ? displayName : n)
      }
    }
  }
  return known
}

export function attachHubs(session: HubSession, template: string) {
  const viewAssemblyNames = session.views.map(v => v.assemblyNames ?? [])
  const confs = connectionsToAdd({
    template,
    pageHref: window.location.href,
    viewAssemblyNames,
    existingConnectionIds: session.connections.map(c => c.connectionId),
    knownAssemblies: knownAssemblies(session, viewAssemblyNames),
  })
  for (const conf of confs) {
    // session-scoped even for an admin: the hub belongs to this session, not to config.json
    const add = session.addSessionConnectionConf ?? session.addConnectionConf
    session.makeConnection(add(conf), { silent: true })
  }
}

function readTemplate(session: HubSession) {
  const value = readConfObject(session.jbrowse.configuration, [
    PLUGIN_NAME,
    'hubUrlTemplate',
  ]) as string | undefined
  return value ?? ''
}

function reportTemplate(template: string) {
  const problem = templateProblem(template)
  if (problem === 'unset') {
    console.info(
      `${PLUGIN_NAME}: configuration.${PLUGIN_NAME}.hubUrlTemplate is unset; no organism hubs will be attached`,
    )
  } else if (problem === 'missing-placeholder') {
    console.warn(
      `${PLUGIN_NAME}: hubUrlTemplate "${template}" has no {abbrev}; no organism hubs will be attached`,
    )
  }
}

export default class VEuPathDBSitePlugin extends Plugin {
  name = PLUGIN_NAME
  configurationSchema = configSchema

  install(pluginManager: PluginManager) {
    pluginManager.addToExtensionPoint(
      'Core-extendSession',
      (sessionModel: IAnyModelType) =>
        sessionModel.actions((self: IAnyStateTreeNode) => ({
          afterAttach() {
            const session = self as unknown as HubSession
            const template = readTemplate(session)
            reportTemplate(template)
            if (templateProblem(template)) {
              return
            }
            addDisposer(
              self,
              autorun(() => attachHubs(session, template), {
                name: 'VEuPathDBSiteHubAttach',
              }),
            )
          },
        })),
    )
  }
}
