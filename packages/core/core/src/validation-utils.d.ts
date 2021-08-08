import { Package } from '@verdaccio/types';
/**
 * From normalize-package-data/lib/fixer.js
 * @param {*} name  the package name
 * @return {Boolean} whether is valid or not
 */
export declare function validateName(name: string): boolean;
/**
 * Validate a package.
 * @return {Boolean} whether the package is valid or not
 */
export declare function validatePackage(name: string): boolean;
/**
 * Validate the package metadata, add additional properties whether are missing within
 * the metadata properties.
 * @param {*} object
 * @param {*} name
 * @return {Object} the object with additional properties as dist-tags ad versions
 */
export declare function validateMetadata(object: Package, name: string): Package;
/**
 * Check whether an element is an Object
 * @param {*} obj the element
 * @return {Boolean}
 */
export declare function isObject(obj: any): boolean;
