const os = require('os')
/**
 * npm install --save-dev @babel/core
 * const babel = require("@babel/core");

babel.transformSync("code", optionsObject);
 */

/**
 * npm install --save-dev @babel/plugin-transform-typescript
 * {
  "plugins": ["@babel/plugin-transform-typescript"]
}
 */

const path = require('path')

const isWindows = os.platform() === 'win32'

const windowsSlashRE = /\\/g

function slash(p) {
  return p.replace(windowsSlashRE, '/')
}

function normalizePath(id) {
  return path.posix.normalize(isWindows ? slash(id) : id)
}

console.log('isWindows :>> ', isWindows);
