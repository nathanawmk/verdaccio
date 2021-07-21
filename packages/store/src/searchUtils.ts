import { Transform, pipeline } from 'stream';
import _ from 'lodash';

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

export class TransFormResults extends Transform {
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
          this.logger.debug(`[remote] streaming name ${pkgItem?.package?.name}`);
          return true;
        })
        .forEach((pkgItem) => {
          this.push(pkgItem);
        });
      callback();
    } else {
      if (!isInteresting(chunk)) {
        callback();
      }
      this.logger.debug(`[local] streaming pkg name ${(chunk as PackageResults)?.name}`);
      this.push(chunk);
      callback();
    }
  }
}
