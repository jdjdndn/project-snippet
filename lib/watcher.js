const chokidar = require('chokidar');
const path = require('path')
const fs = require('fs')
const { normalizePath } = require('../utils/index')
class Watch {
  constructor(context, options = {}, changeCallback, removeCallback) {
    options.cwd = options.cwd || '.'
    this.watcher = chokidar.watch(['src/**/*', ...options.dirs], {
      persistent: true,
      cwd: options.cwd,
      ...options,
      disableGlobbing: true
    });
    this.watcher
      .on('change', relativePath => {
        const paths = Array.isArray(relativePath) ? relativePath : [relativePath]
        const entries = []
        paths.forEach(itemPath => {
          let absolutePath = normalizePath(path.join(context, options.cwd, itemPath))
          if (fs.statSync(absolutePath).isFile()) {
            entries.push(absolutePath)
          }
        })

        changeCallback(entries)
      }).on('unlink', relativePath => {
        const entries = (Array.isArray(relativePath) ? relativePath : [relativePath]).map(itemPath => normalizePath(path.join(context, options.cwd, itemPath)))
        removeCallback(entries)
      });
  }

  close() {
    this.watcher.close()
  }
}

module.exports = Watch