const experimental = process.env.__VERDACCIO_REFACTOR ?? false;

const LocalDatabase = experimental
  ? require('./legacy/local-database').default
  : require('./local-database').default;

export { LocalDatabase };

export default LocalDatabase;
