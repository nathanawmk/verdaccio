import { EventEmitter } from 'events';
import { Author } from '@verdaccio/types';
export type SearchMetrics = {
  quality: number;
  popularity: number;
  maintenance: number;
};
export type UnStable = {
  flags?: {
    // if is false is not be included in search results (majority are stable)
    unstable?: boolean;
  };
};
export type SearchItemPkg = {
  name: string;
  path: string;
  time?: number | Date;
};
export type SearchItem = {
  package: SearchItemPkg;
  score: Score;
} & UnStable;

export type Score = {
  final: number;
  detail: SearchMetrics;
};

export type SearchPackageBody = {
  name: string;
  scope: string;
  description: string;
  author: string | Author;
  version: string;
  keywords: string | string[] | undefined;
  date: string;
  links?: {
    npm: string; // only include placeholder for URL eg: {url}/{packageName}
    homepage?: string;
    repository?: string;
    bugs?: string;
  };
  publisher?: any;
  maintainers?: Author[];
};

export type SearchPackageItem = {
  package: SearchPackageBody;
  score: Score;
  searchScore?: number;
} & UnStable;
class SearchEmitter extends EventEmitter {
  // FIXME: function is a callback required for async.eachSeries
  // this should be removed soon async is gone
  public addPackage(pkg: SearchItem) {
    this.emit('package', pkg);
  }
  public error() {
    this.emit('error');
  }
  public end() {
    this.emit('end');
  }
}

export const UNSCOPED = 'unscoped';

export type SearchQuery = {
  text: string;
  size: number;
} & SearchMetrics;

export { SearchEmitter };
