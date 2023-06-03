var Watchpack = require("watchpack");

class Watch {
  constructor(context, callback, options = {}) {
    this.context = context
    this.callback = callback
    this.options = options
    this.wp = new Watchpack({
      aggregateTimeout: 1000,
      poll: true,
      followSymlinks: true,
      ...options,
      ignored: ["**/.git", "**/node_modules/*", '.vscode', 'package.json', '.gitignore', ...options.ignored].filter(Boolean),
    });
    this.watch()
  }

  watch() {
    this.wp.watch({
      files: [],
      directories: [this.context],
      missing: [],
      startTime: Date.now() - 10000,
      ...this.options
    });

    const _this = this
    this.wp.on("change", function (filePath, mtime, explanation) {
      _this.callback(filePath, mtime, explanation);
    });
  }

  close() {
    this.wp.close();
    this.wp = null
  }
}

module.exports = Watch