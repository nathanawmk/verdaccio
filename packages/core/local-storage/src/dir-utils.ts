import { resolve, join, posix } from 'path';
import buildDebug from 'debug';
import { searchUtils, validatioUtils } from '@verdaccio/core';
import { readdirPromise } from './fs';

const debug = buildDebug('verdaccio:plugin:local-storage:utils');

export async function readDirectory(storagePath) {
  await readdirPromise(storagePath, {
    withFileTypes: true,
  });
}

/**
 * Retrieve a list of absolute paths to all folders in the given storage path
 * @param storagePath the base path of the storage
 * @return a promise that resolves to an array of absolute paths
 */
export async function getFolders(storagePath): Promise<string[]> {
  const dirents = await readdirPromise(storagePath, { withFileTypes: true });
  const files = await Promise.all(
    dirents.map((dirent) => {
      const res = resolve(storagePath, dirent.name);
      return dirent.isDirectory() ? getFolders(res) : storagePath;
    })
  );
  return Array.prototype.concat(...files);
}

/**
 * Search packages on the the storage. The storage could be
 * - storage
 *    - pkg1
 *    - @company
 *      - pkg2 -> @scompany/pkg2
 *    - storage1
 *      - pkg2
 *      - pkg3
 *    - storage2
 *        - @scope
 *           - pkg4 > @scope/pkg4
 * The search return a data structure like:
 *  [
 *   {
 *    name: 'pkg1', // package name could be @scope/pkg1
 *    path: absolute/path/package/name
 *   }
 *  ]
 * @param {string} storagePath is the base path of the storage folder,
 * inside could be packages, storages and @scope packages.
 * @param {Set<string>} storages storages are defined peer package access pattern via `storage` property
 * @param query is the search query from the user via npm search command.
 * and are intended to organize packages in a tree structure.
 * @returns {Promise<searchUtils.SearchItem[]>}
 */
export async function searchOnStorage(
  storagePath: string,
  storages: Map<string, string>,
  query: searchUtils.SearchQuery
): Promise<searchUtils.SearchItem[]> {
  const results: any[] = [];
  const matchedStorages = Array.from(storages).map(([key]) => {
    const path = join(storagePath, key, posix.sep);
    return path;
  });
  debug('search on %o', storagePath);
  debug('storage folders %o', matchedStorages.length);
  const foldersOnStorage = await getFolders(storagePath);
  debug('folders on storage %o', foldersOnStorage.length);
  for (let store of foldersOnStorage) {
    debug('folder storage %o', store);
    const isStorage = matchedStorages.findIndex((storage) => store.match(storage));
    if (isStorage === -1) {
      const pkgName = store.replace(join(storagePath, posix.sep), '');
      if (validatioUtils.validateName(pkgName)) {
        debug('add to search %o', pkgName);
        results.push({
          name: pkgName,
          path: store,
        });
      }
    } else {
      const pkgName = store.replace(matchedStorages[isStorage], '');
      if (validatioUtils.validateName(pkgName)) {
        debug('add to search %o', pkgName);
        results.push({
          name: pkgName,
          path: store,
        });
      }
    }
  }

  return results.filter((item: searchUtils.SearchItem) => {
    return item?.name?.match(query.text) !== null;
  }) as searchUtils.SearchItem[];
}
