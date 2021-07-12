import fs from 'fs';
import Path from 'path';
import buildDebug from 'debug';

import _ from 'lodash';
import async from 'async';
import {
  Callback,
  Config,
  IPackageStorage,
  IPluginStorage,
  LocalStorage,
  Logger,
  StreamLocalData,
} from '@verdaccio/types';
import { errorUtils, validatioUtils, searchUtils } from '@verdaccio/core';
import { getMatchedPackagesSpec } from '@verdaccio/utils';

import LocalDriver, { noSuchFile } from './package-cache';
import { loadPrivatePackages } from './pkg-utils';
import TokenActions from './token';
import { _dbGenPath } from './utils';
import { mkdirPromise, writeFilePromise } from './fs';

const DB_NAME = '.verdaccio-db.json';

const debug = buildDebug('verdaccio:plugin:local-storage');

export const ERROR_DB_LOCKED =
  'Database is locked, please check error message printed during startup to prevent data loss';

class LocalDatabase extends TokenActions implements IPluginStorage<{}>, StreamLocalData {
  public path: string;
  public logger: Logger;
  public data: LocalStorage | void;
  public config: Config;
  public locked: boolean;

  public constructor(config: Config, logger: Logger) {
    super(config);
    this.config = config;
    this.logger = logger;
    this.locked = false;
    this.data = undefined;
    this.path = _dbGenPath(DB_NAME, config);
    debug('plugin storage path %o', this.path);
  }

  public async init(): Promise<void> {
    debug('plugin init');
    this.data = await this._fetchLocalPackages();
    await this._sync();
  }

  public async getSecret(): Promise<string> {
    if (typeof this.data === 'undefined') {
      throw Error('no data secret available');
    }

    return Promise.resolve(this.data.secret);
  }

  public async setSecret(secret: string): Promise<void> {
    if (typeof this.data === 'undefined') {
      throw Error('no data secret available');
    } else {
      this.data.secret = secret;
    }

    await this._sync();
  }

  public async add(name: string): Promise<void> {
    if (typeof this.data === 'undefined') {
      throw Error('no data secret available');
    }

    if (this.data.list.indexOf(name) === -1) {
      this.data.list.push(name);
      debug('the private package %o has been added', name);
      await this._sync();
    } else {
      debug('the private package %o was not added', name);
      throw Error('package not added');
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public search(_onPackage: Callback, _onEnd: Callback): void {
    // FUTURE: remove when legacy class is gone, not need it here
  }

  public streamSearch(emitter: searchUtils.SearchEmitter): void {
    const storages = this._getCustomPackageLocalStorages();
    debug(`search custom local packages: %o`, JSON.stringify(storages));
    const base = Path.dirname(this.config.config_path);
    const self = this;
    const storageKeys = Object.keys(storages);
    debug(`search base: %o keys: %o`, base, storageKeys);

    async.eachSeries(
      storageKeys,
      function (storage, cb) {
        const position = storageKeys.indexOf(storage);
        const base2 = Path.join(position !== 0 ? storageKeys[0] : '');
        const storagePath: string = Path.resolve(base, base2, storage);
        debug('search path: %o : %o', storagePath, storage);
        fs.readdir(storagePath, (err, files) => {
          if (err) {
            return cb(err);
          }

          async.eachSeries(
            files,
            function (file, cb) {
              debug('local-storage: [search] search file path: %o', file);
              if (storageKeys.includes(file)) {
                return cb();
              }

              if (file.match(/^@/)) {
                // scoped
                const fileLocation = Path.resolve(base, storage, file);
                debug('search scoped file location: %o', fileLocation);
                fs.readdir(fileLocation, function (err, files) {
                  if (err) {
                    return cb(err);
                  }

                  async.eachSeries(
                    files,
                    (file2, cb) => {
                      if (validatioUtils.validateName(file2)) {
                        const packagePath = Path.resolve(base, storage, file, file2);

                        fs.stat(packagePath, (err, stats) => {
                          if (err) {
                            return cb(err);
                          }
                          const item = {
                            name: `${file}/${file2}`,
                            path: packagePath,
                            time: stats.mtime.getTime(),
                          };
                          emitter.addPackage([item, cb]);
                        });
                      } else {
                        cb();
                      }
                    },
                    cb
                  );
                });
              } else if (validatioUtils.validateName(file)) {
                const base2 = Path.join(position !== 0 ? storageKeys[0] : '');
                const packagePath = Path.resolve(base, base2, storage, file);
                debug('search file location: %o', packagePath);
                fs.stat(packagePath, (err, stats) => {
                  if (_.isNil(err) === false) {
                    return cb(err);
                  }
                  emitter.addPackage([
                    {
                      name: file,
                      path: packagePath,
                      time: self.getTime(stats.mtime.getTime(), stats.mtime),
                    },
                    cb,
                  ]);
                });
              } else {
                cb();
              }
            },
            cb
          );
        });
      },
      () => {
        emitter.end();
      }
    );
  }

  public async remove(name: string): Promise<void> {
    try {
      if (typeof this.data === 'undefined') {
        throw Error('no data secret available');
      }

      const data = await this.get();

      const pkgName = data.indexOf(name);
      if (pkgName !== -1) {
        this.data.list.splice(pkgName, 1);
        debug('remove package %o has been removed', name);
      }
      await this._sync();
    } catch (err) {
      this.logger.error({ err }, 'remove the private package has failed @{err}');
      throw errorUtils.getInternalError('error remove private package');
    }
  }

  public async get(): Promise<any> {
    if (typeof this.data === 'undefined') {
      throw Error('no data secret available');
    }

    const { list } = this.data;
    const totalItems = list?.length;
    debug('get full list of packages (%o) has been fetched', totalItems);
    return Promise.resolve(list);
  }

  public getPackageStorage(packageName: string): IPackageStorage {
    const packageAccess = getMatchedPackagesSpec(packageName, this.config.packages);

    const packagePath: string = this._getLocalStoragePath(
      packageAccess ? packageAccess.storage : undefined
    );
    debug('storage path selected: ', packagePath);
    if (_.isString(packagePath) === false) {
      debug('the package %o has no storage defined ', packageName);
      return;
    }

    const packageStoragePath: string = Path.join(
      Path.resolve(Path.dirname(this.config.config_path || ''), packagePath),
      packageName
    );

    debug('storage absolute path: ', packageStoragePath);

    return new LocalDriver(packageStoragePath, this.logger);
  }

  public async clean(): Promise<void> {
    await this._sync();
  }

  private getTime(time: number, mtime: Date): number | Date {
    return time ? time : mtime;
  }

  private _getCustomPackageLocalStorages(): object {
    const storages = {};

    // add custom storage if exist
    if (this.config.storage) {
      storages[this.config.storage] = true;
    }

    const { packages } = this.config;

    if (packages) {
      const listPackagesConf = Object.keys(packages || {});

      listPackagesConf.map((pkg) => {
        const storage = packages[pkg].storage;
        if (storage) {
          storages[storage] = false;
        }
      });
    }

    return storages;
  }

  private async _sync(): Promise<Error | null> {
    debug('sync database started');

    if (this.locked) {
      this.logger.error(ERROR_DB_LOCKED);
      return new Error(ERROR_DB_LOCKED);
    }
    // Uses sync to prevent ugly race condition
    try {
      const folderName = Path.dirname(this.path);
      debug('creating folder %o', folderName);
      await mkdirPromise(folderName, { recursive: true });
      debug('sync folder %o created succeed', folderName);
    } catch (err) {
      debug('sync create folder has failed with error: %o', err);
      return null;
    }

    try {
      await writeFilePromise(this.path, JSON.stringify(this.data));
      debug('sync write succeed');

      return null;
    } catch (err) {
      debug('sync failed %o', err);

      return err;
    }
  }

  private _getLocalStoragePath(storage: string | void): string {
    const globalConfigStorage = this.config ? this.config.storage : undefined;
    if (_.isNil(globalConfigStorage)) {
      throw new Error('property storage in config.yaml is required for using  this plugin');
    } else {
      if (typeof storage === 'string') {
        return Path.join(globalConfigStorage as string, storage as string);
      }

      return globalConfigStorage as string;
    }
  }

  private async _fetchLocalPackages(): Promise<LocalStorage> {
    try {
      return await loadPrivatePackages(this.path, this.logger);
    } catch (err) {
      // readFileSync is platform specific, macOS, Linux and Windows thrown an error
      // Only recreate if file not found to prevent data loss
      debug('error on fetch local packages %o', err);
      if (err.code !== noSuchFile) {
        this.locked = true;
        this.logger.error(
          'Failed to read package database file, please check the error printed below:\n',
          `File Path: ${this.path}\n\n ${err.message}`
        );
      }

      return { list: [], secret: '' };
    }
  }
}

export default LocalDatabase;
