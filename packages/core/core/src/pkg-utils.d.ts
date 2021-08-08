import { Package } from '@verdaccio/types';
/**
 * Function filters out bad semver versions and sorts the array.
 * @return {Array} sorted Array
 */
export declare function semverSort(listVersions: string[]): string[];
/**
 * Get the latest publihsed version of a package.
 * @param package metadata
 **/
export declare function getLatest(pkg: Package): string;
/**
 * Function gets a local info and an info from uplinks and tries to merge it
 exported for unit tests only.
  * @param {*} local
  * @param {*} upstream
  * @param {*} config sds
  */
export declare function mergeVersions(local: Package, upstream: Package): void;
