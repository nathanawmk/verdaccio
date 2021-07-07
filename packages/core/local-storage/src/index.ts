const experimental = process.env.__VERDACCIO_REFACTOR ?? false;

const LocalDatabase = experimental
  ? require('./private-db').default
  : require('./legacy/local-database').default;

export { LocalDatabase };

export default LocalDatabase;
