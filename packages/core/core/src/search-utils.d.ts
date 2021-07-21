// / <reference types="node" />
import { EventEmitter } from 'events';
export declare type SearchItem = {
  name: string;
  path: string;
  time: number | Date;
};
export declare type onPackageSearchItem = [SearchItem, Function];
declare class SearchEmitter extends EventEmitter {
  addPackage(pkg: onPackageSearchItem): void;
  end(): void;
}
export { SearchEmitter };
