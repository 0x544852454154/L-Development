const log = (...args) => {
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
  console.log(`[${ts}]`, ...args);
};

const error = (...args) => {
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
  console.error(`[${ts}] [ERROR]`, ...args);
};

const warn = (...args) => {
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
  console.warn(`[${ts}] [WARN]`, ...args);
};

module.exports = { log, error, warn };
