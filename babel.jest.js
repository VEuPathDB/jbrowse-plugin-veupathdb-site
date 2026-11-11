// jest only: down-levels the ESM that @jbrowse/core ships to CJS
module.exports = {
  presets: [
    ['@babel/preset-env', { targets: { node: 'current' } }],
    '@babel/preset-react',
  ],
}
