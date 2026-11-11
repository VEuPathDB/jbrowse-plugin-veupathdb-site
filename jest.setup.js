// jsdom lacks a few globals @jbrowse/core reaches for; Node has them.
const { TextEncoder, TextDecoder } = require('util')

globalThis.TextEncoder ??= TextEncoder
globalThis.TextDecoder ??= TextDecoder
globalThis.structuredClone ??= v => v && JSON.parse(JSON.stringify(v))
