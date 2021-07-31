import { PassThrough } from 'stream';
import { IProxy, ProxyList } from '@verdaccio/proxy';
import {
  Package,
  Config,
  IPluginStorageFilter,
  IPluginStorage,
  Callback,
  Logger,
  StoragePackageActions,
  ITokenActions,
  IStorageManager,
  Token,
  TokenFilter,
  Versions,
} from '@verdaccio/types';

export interface IGetPackageOptions {
  callback: Callback;
  name: string;
  keepUpLinkData: boolean;
  uplinksLook: boolean;
  req: any;
}

export interface IBasicStorage<T> extends StoragePackageActions {
  init(): Promise<void>;
  addPackage(name: string, info: Package, callback: Callback): void;
  updateVersions(name: string, packageInfo: Package, callback: Callback): void;
  getPackageMetadata(name: string, callback: Callback): void;
  search(startKey: string): any;
  getSecret(config: T & Config): Promise<any>;
}

export interface IStorage extends IBasicStorage<Config>, ITokenActions {
  config: Config;
  storagePlugin: IPluginStorage<Config> | null;
  logger: Logger;
}

export interface ISyncUplinks {
  uplinksLook?: boolean;
  etag?: string;
  req?: Request;
}

export type IPluginFilters = IPluginStorageFilter<Config>[];

export interface IStorageHandler extends IStorageManager<Config>, ITokenActions {
  config: Config;
  localStorage: IStorage | null;
  filters: IPluginFilters;
  uplinks: ProxyList;
  init(config: Config, filters: IPluginFilters): Promise<void>;
  saveToken(token: Token): Promise<any>;
  deleteToken(user: string, tokenKey: string): Promise<any>;
  readTokens(filter: TokenFilter): Promise<Token[]>;
  _syncUplinksMetadata(name: string, packageInfo: Package, options: any, callback: Callback): void;
  _updateVersionsHiddenUpLink(versions: Versions, upLink: IProxy): void;
}
