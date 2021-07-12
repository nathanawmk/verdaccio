import { EventEmitter } from 'events';

export type SearchItem = { name: string; path: string; time: number | Date };
export type onPackageSearchItem = [SearchItem, Function];

class SearchEmitter extends EventEmitter {
  // FIXME: function is a callback required for async.eachSeries
  // this should be removed soon async is gone
  public addPackage(pkg: onPackageSearchItem) {
    this.emit('package', pkg);
  }
  public end() {
    this.emit('end');
  }
}

export { SearchEmitter };
