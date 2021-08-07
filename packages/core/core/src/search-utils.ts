import { EventEmitter } from 'events';
import { Author } from '@verdaccio/types';
export type SearchMetrics = {
  quality: number;
  popularity: number;
  maintenance: number;
};
export type SearchItem = { name: string; path: string; time?: number | Date };
export type Score = {
  final: number;
  detail: SearchMetrics;
};
export type SearchPackageItem = {
  name: string;
  scope: string;
  version: string;
  keywords: string[];
  date: string;
  links?: {
    npm: string; // only include placeholder for URL eg: {url}/{packageName}
    homepage?: string;
    repository?: string;
    bugs?: string;
  };
  publisher: {
    username: string;
    // email is being ignored
  };
  maintainers?: Author[];
  flags?: {
    unstable?: boolean;
  };
  score: Score;
};
export type onPackageSearchItem = [SearchItem, Function];

class SearchEmitter extends EventEmitter {
  // FIXME: function is a callback required for async.eachSeries
  // this should be removed soon async is gone
  public addPackage(pkg: SearchItem) {
    this.emit('package', pkg);
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
