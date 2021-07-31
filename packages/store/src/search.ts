// eslint-disable no-invalid-this

import { PassThrough, Transform } from 'stream';
import lunr from 'lunr';
import lunrMutable from 'lunr-mutable-indexes';
import _ from 'lodash';
import { logger } from '@verdaccio/logger';
import { Version, IPluginStorage, Config, Package } from '@verdaccio/types';
import { IProxy, ProxyList, ProxySearchParams } from '@verdaccio/proxy';
import { VerdaccioError } from '@verdaccio/commons-api';
import { IStorage, IStorageHandler } from './type';
export interface ISearchResult {
  ref: string;
  score: number;
}

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
          logger.info(`[remote] streaming name ${pkgItem?.package?.name}`);
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
      logger.info(`[local] streaming pkg name ${(chunk as PackageResults)?.name}`);
      this.push(chunk);
      return callback();
    }
  }
}

export interface IWebSearch {
  index: lunrMutable.index;
  storage: IStorageHandler;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query(query: string): ISearchResult[];
  add(pkg: Version): void;
  remove(name: string): void;
  reindex(): void;
  configureStorage(storage: IStorageHandler): void;
}

export class SearchManager {
  public readonly uplinks: ProxyList;
  public readonly storage: IStorage;
  constructor(uplinks: ProxyList, storage: IStorage) {
    this.uplinks = uplinks;
    this.storage = storage;
  }

  public get proxyList() {
    const uplinksList = Object.keys(this.uplinks);

    return uplinksList;
  }

  public async search(searchPassThrough: PassThrough, options: ProxySearchParams): Promise<any> {
    const upLinkList = this.proxyList;

    const searchUplinksStreams = upLinkList.map((uplinkId) => {
      const uplink = this.uplinks[uplinkId];
      if (!uplink) {
        // this should never tecnically happens
        logger.fatal({ uplinkId }, 'uplink @upLinkId not found');
        throw new Error(`uplink ${uplinkId} not found`);
      }
      return this.consumeSearchStream(uplinkId, uplink, options, searchPassThrough);
    });

    try {
      await Promise.all([...searchUplinksStreams]);
    } catch (err) {
      logger.error({ err }, ' error on uplinks search @{err}');
      searchPassThrough.emit('error', err);
      throw err;
    }

    searchPassThrough.end();
    // @ts-ignore
    // const localStream = this.storage.streamSearch('not_used');
    // // we close the stream
    // localStream.pipe(searchPassThrough, { end: true });
    // localStream.on('error', (err: VerdaccioError): void => {
    //   logger.error({ err: err }, 'search error: @{err?.message}');
    //   searchPassThrough.end();
    // });
  }

  /**
   * Consume the upstream and pipe it to a transformable stream.
   */
  private consumeSearchStream(
    uplinkId: string,
    uplink: IProxy,
    options: ProxySearchParams,
    searchPassThrough: PassThrough
  ): Promise<any> {
    // TODO: review how to handle abort
    const abortController = new AbortController();
    return uplink.search({ ...options, abort: abortController }).then((bodyStream) => {
      bodyStream.pipe(searchPassThrough, { end: false });
      bodyStream.on('error', (err: VerdaccioError): void => {
        logger.error(
          { uplinkId, err: err },
          'search error for uplink @{uplinkId}: @{err?.message}'
        );
        searchPassThrough.end();
      });
      return new Promise((resolve) => bodyStream.on('end', resolve));
    });
  }
}

/**
 * Handle the search Indexer.
 */
class Search implements IWebSearch {
  public readonly index: lunrMutable.index;
  // @ts-ignore
  public storage: IStorageHandler;

  /**
   * Constructor.
   */
  public constructor() {
    this.index = lunrMutable(function (): void {
      // FIXME: there is no types for this library
      /* eslint no-invalid-this:off */
      // @ts-ignore
      this.field('name', { boost: 10 });
      // @ts-ignore
      this.field('description', { boost: 4 });
      // @ts-ignore
      this.field('author', { boost: 6 });
      // @ts-ignore
      this.field('keywords', { boost: 7 });
      // @ts-ignore
      this.field('version');
      // @ts-ignore
      this.field('readme');
    });

    this.index.builder.pipeline.remove(lunr.stemmer);
  }

  public init() {
    return Promise.resolve();
  }

  /**
   * Performs a query to the indexer.
   * If the keyword is a * it returns all local elements
   * otherwise performs a search
   * @param {*} q the keyword
   * @return {Array} list of results.
   */
  public query(query: string): ISearchResult[] {
    const localStorage = this.storage.localStorage as IStorage;

    return query === '*'
      ? (localStorage.storagePlugin as IPluginStorage<Config>).get((items): any => {
          items.map(function (pkg): any {
            return { ref: pkg, score: 1 };
          });
        })
      : this.index.search(`*${query}*`);
  }

  /**
   * Add a new element to index
   * @param {*} pkg the package
   */
  public add(pkg: Version): void {
    this.index.add({
      id: pkg.name,
      name: pkg.name,
      description: pkg.description,
      version: `v${pkg.version}`,
      keywords: pkg.keywords,
      author: pkg._npmUser ? pkg._npmUser.name : '???',
    });
  }

  /**
   * Remove an element from the index.
   * @param {*} name the id element
   */
  public remove(name: string): void {
    this.index.remove({ id: name });
  }

  /**
   * Force a re-index.
   */
  public reindex(): void {
    this.storage.getLocalDatabase((error, packages): void => {
      if (error) {
        // that function shouldn't produce any
        throw error;
      }
      let i = packages.length;
      while (i--) {
        this.add(packages[i]);
      }
    });
  }

  /**
   * Set up the {Storage}
   * @param {*} storage An storage reference.
   */
  public configureStorage(storage: IStorageHandler): void {
    this.storage = storage;
    this.reindex();
  }
}

const SearchInstance = new Search();

export { SearchInstance };
