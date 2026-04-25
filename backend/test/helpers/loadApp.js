"use strict";

const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..", "..");
const srcRoot = path.join(projectRoot, "src");

const clearProjectModules = () => {
  for (const modulePath of Object.keys(require.cache)) {
    if (modulePath.startsWith(srcRoot)) {
      delete require.cache[modulePath];
    }
  }
};

const withFreshApp = (overrides, factory) => {
  const targets = Object.entries(overrides).map(([relativePath, exports]) => ({
    resolvedPath: path.join(projectRoot, relativePath),
    exports
  }));

  const previousEntries = new Map();
  const appPath = path.join(projectRoot, "src/app.js");

  try {
    clearProjectModules();

    for (const target of targets) {
      previousEntries.set(
        target.resolvedPath,
        Object.prototype.hasOwnProperty.call(require.cache, target.resolvedPath)
          ? require.cache[target.resolvedPath]
          : null
      );

      require.cache[target.resolvedPath] = {
        id: target.resolvedPath,
        filename: target.resolvedPath,
        loaded: true,
        exports: target.exports
      };
    }

    const app = require(appPath);
    return factory(app);
  } finally {
    clearProjectModules();

    for (const [resolvedPath, previousEntry] of previousEntries.entries()) {
      if (previousEntry) {
        require.cache[resolvedPath] = previousEntry;
      } else {
        delete require.cache[resolvedPath];
      }
    }
  }
};

module.exports = { withFreshApp };
