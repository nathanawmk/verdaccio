import { Transform, pipeline, PassThrough } from 'stream';
import _ from 'lodash';
import semver from 'semver';
import { Package } from '@verdaccio/types';
import { logger } from '@verdaccio/logger';
import { IAuth } from '@verdaccio/auth';
import { HTTP_STATUS, getInternalError } from '@verdaccio/commons-api';
import { Storage } from '@verdaccio/store';

type PublisherMaintainer = {
  username: string;
  email: string;
};

type PackageResults = {
  name: string;
  scope: string;
  version: string;
  description: string;
  date: string;
  links: {
    npm: string;
    homepage?: string;
    repository?: string;
    bugs?: string;
  };
  author: { name: string };
  publisher: PublisherMaintainer;
  maintainer: PublisherMaintainer;
};

type SearchResult = {
  package: PackageResults;
  flags?: { unstable: boolean | void };
  local?: boolean;
  score: {
    final: number;
    detail: {
      quality: number;
      popularity: number;
      maintenance: number;
    };
  };
  searchScore: number;
};

type SearchResults = {
  objects: SearchResult[];
  total: number;
  time: string;
};

const personMatch = (person, search) => {
  if (typeof person === 'string') {
    return person.includes(search);
  }

  if (typeof person === 'object') {
    for (const field of Object.values(person)) {
      if (typeof field === 'string' && field.includes(search)) {
        return true;
      }
    }
  }

  return false;
};

const matcher = function (query) {
  const match = query.match(/author:(.*)/);
  if (match !== null) {
    return function (pkg) {
      return personMatch(pkg.author, match[1]);
    };
  }

  // TODO: maintainer, keywords, boost-exact
  // TODO implement some scoring system for freetext
  return (pkg) => {
    return ['name', 'displayName', 'description']
      .map((k) => {
        return pkg[k];
      })
      .filter((x) => {
        return x !== undefined;
      })
      .some((txt) => {
        return txt.includes(query);
      });
  };
};

function compileTextSearch(textSearch: string): (pkg: PackageResults) => boolean {
  const textMatchers = (textSearch || '').split(' ').map(matcher);
  return (pkg) => textMatchers.every((m) => m(pkg));
}

function removeDuplicates(results) {
  const pkgNames: any[] = [];
  return results.filter((pkg) => {
    if (pkgNames.includes(pkg?.package?.name)) {
      return false;
    }
    pkgNames.push(pkg?.package?.name);
    return true;
  });
}

function checkAccess(pkg: any, auth: any, remoteUser): Promise<Package | null> {
  return new Promise((resolve, reject) => {
    auth.allow_access({ packageName: pkg?.package?.name }, remoteUser, function (err, allowed) {
      if (err) {
        if (err.status && String(err.status).match(/^4\d\d$/)) {
          // auth plugin returns 4xx user error,
          // that's equivalent of !allowed basically
          allowed = false;
          return resolve(null);
        } else {
          reject(err);
        }
      } else {
        return resolve(allowed ? pkg : null);
      }
    });
  });
}

// async function sendResponse(
//   resultBuf,
//   resultStream,
//   auth,
//   req,
//   from: number,
//   size: number
// ): Promise<SearchResults> {
//   resultStream.destroy();
//   const checkAccessPromises: SearchResult[] = await Promise.all(
//     removeDuplicates(resultsCollection).map((pkgItem) => {
//       return checkAccess(pkgItem, auth, req.remote_user);
//     })
//   );

//   const final: SearchResult[] = checkAccessPromises.filter((i) => !_.isNull(i)).slice(from, size);
//   logger.debug(`search results ${final?.length}`);

//   const response: SearchResults = {
//     objects: final,
//     total: final.length,
//     time: new Date().toUTCString(),
//   };

//   logger.debug(`total response ${final.length}`);
//   return response;
// }

class TransFormResults extends Transform {
  private text: string;
  // FIXME: this type is not correct,
  private logger: any;
  public constructor(text, logger, options) {
    super(options);
    this.text = text;
    this.logger = logger;
  }

  /**
   * Transform either array of packages or a single package into a stream of packages.
   * From uplinks the chunks are array but from local packages are objects.
   * @param {string} chunk
   * @param {string} encoding
   * @param {function} done
   * @returns {void}
   * @override
   */
  public _transform(chunk, _encoding, callback) {
    const isInteresting = compileTextSearch(this.text);
    if (_.isArray(chunk)) {
      (chunk as SearchResult[])
        .filter((pkgItem) => {
          if (!isInteresting(pkgItem?.package)) {
            return;
          }
          logger.debug(`[remote] streaming name ${pkgItem?.package?.name}`);
          return true;
        })
        .forEach((pkgItem) => {
          this.push(pkgItem);
        });
      return callback();
    } else {
      if (!isInteresting(chunk)) {
        return callback();
      }
      logger.debug(`[local] streaming pkg name ${(chunk as PackageResults)?.name}`);
      this.push(chunk);
      return callback();
    }
  }
}

/**
 * Endpoint for npm search v1
 * Empty value
 *  - {"objects":[],"total":0,"time":"Sun Jul 25 2021 14:09:11 GMT+0000 (Coordinated Universal Time)"}
 * req: 'GET /-/v1/search?text=react&size=20&frpom=0&quality=0.65&popularity=0.98&maintenance=0.5'
 */
export default function (route, auth: IAuth, storage: Storage): void {
  route.get('/-/v1/search', async (req, res, next) => {
    // TODO: implement proper result scoring weighted by quality, popularity and maintenance query parameters
    let [text, size, from /* , quality, popularity, maintenance */] = [
      'text',
      'size',
      'from' /* , 'quality', 'popularity', 'maintenance' */,
    ].map((k) => req.query[k]);

    size = parseInt(size, 10) || 20;
    from = parseInt(from, 10) || 0;
    const data: any[] = [];
    const transformToSearchPkg = new Transform({
      objectMode: true,
      transform(chunk: Package, _encoding, callback) {
        try {
          if (chunk?.name) {
            // this is the path for local packages which does not comes from the npmjs search endpoint
            // this has to be on sync what we get from npmjs (the hard part), eventually might mutate
            const searchPkg = {
              package: chunk,
              // not sure if flags is need it
              flags: {
                unstable: Object.keys(chunk.versions).some((v) => semver.satisfies(v, '^1.0.0'))
                  ? undefined
                  : true,
              },
              local: true,
              score: {
                final: 1,
                detail: {
                  quality: 1,
                  popularity: 1,
                  maintenance: 0,
                },
              },
              searchScore: 100000,
            };
            return callback(null, searchPkg);
          } else {
            return callback(null, chunk);
          }
        } catch (err) {
          logger.error({ err }, 'transform search pkg failed @{err}');
          callback(err);
        }
      },
    });
    const transformResults = new TransFormResults(text, logger, { objectMode: true });

    const streamPassThrough = new PassThrough({ objectMode: true });
    storage.searchManager?.search(streamPassThrough, {
      headers: req.headers,
      query: req.query,
      url: req.url,
    });

    // console.log('--searchStream', searchStream);
    const outPutStream = new PassThrough({ objectMode: true });
    pipeline(streamPassThrough, transformResults, transformToSearchPkg, outPutStream, (err) => {
      if (err) {
        next(getInternalError(err ? err.message : 'unknown error'));
      } else {
        // console.log('Pipeline succeeded.');
      }
    });

    outPutStream.on('data', (chunk) => {
      data.push(chunk);
    });

    outPutStream.on('finish', async () => {
      const checkAccessPromises: SearchResult[] = await Promise.all(
        removeDuplicates(data).map((pkgItem) => {
          return checkAccess(pkgItem, auth, req.remote_user);
        })
      );

      const final: SearchResult[] = checkAccessPromises
        .filter((i) => !_.isNull(i))
        .slice(from, size);
      logger.debug(`search results ${final?.length}`);

      const response: SearchResults = {
        objects: final,
        total: final.length,
        time: new Date().toUTCString(),
      };

      res.status(HTTP_STATUS.OK).json(response);
    });
  });
}
// const isInteresting = compileTextSearch(text);
// try {
// const resultStream = await storage.search(0, { req, forceStream: true });
// let resultBuf = [] as any;
// let completed = false;

// resultStream.on('data', (pkg: SearchResult[] | PackageResults) => {
//   // console.log('-->', pkg);
//   // packages from the upstreams
//   if (_.isArray(pkg)) {
//     resultBuf = resultBuf.concat(
//       (pkg as SearchResult[]).filter((pkgItem) => {
//         if (!isInteresting(pkgItem?.package)) {
//           return;
//         }
//         logger.debug(`[remote] pkg name ${pkgItem?.package?.name}`);
//         return true;
//       })
//     );
//   } else {
//     // packages from local
//     // due compability with `/-/all` we cannot refactor storage.search();
//     if (!isInteresting(pkg)) {
//       return;
//     }
//     logger.debug(`[local] pkg name ${(pkg as PackageResults)?.name}`);
//     resultBuf.push(pkg);
//   }
// });

// resultStream.on('error', function () {
//   logger.error('search endpoint has failed');
//   res.socket.destroy();
// });

/**
 * we should stream back the results
 */
// resultStream.on('end', async () => {
//   if (!completed) {
//     completed = true;
//     try {
//       const response = await sendResponse(resultBuf, resultStream, auth, req, from, size);
//       logger.info('search endpoint ok results @{total}', { total: response.total });
//       res.status(HTTP_STATUS.OK).json(response);
//     } catch (err) {
//       logger.error('search endpoint has failed @{err}', { err });
//       next(err);
//     }
//   }
// });
// const resultStream = await storage.search(0, { req, forceStream: true });
// pipeline(resultStream,
// } catch (err) {
//   logger.error('search endpoint has failed @{err}', { err });
//   next(getInternalError(err.message));
// }
// });
