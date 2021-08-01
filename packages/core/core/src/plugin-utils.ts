import { Callback, Config, IPackageStorage, Logger, Token, TokenFilter } from '@verdaccio/types';
import { searchUtils } from '.';

interface IPlugin {
  version?: string;
  // In case a plugin needs to be cleaned up/removed
  close?(): void;
}

export interface IPluginStorage<T> extends IPlugin {
  logger: Logger;
  config: T & Config;
  add(name: string, callback: Callback): void;
  remove(name: string, callback: Callback): void;
  get(callback: Callback): void;
  init(): Promise<void>;
  getSecret(): Promise<string>;
  setSecret(secret: string): Promise<any>;
  getPackageStorage(packageInfo: string): IPackageStorage;
  search(emitter: searchUtils.SearchEmitter, query: searchUtils.SearchQuery): void;
  saveToken(token: Token): Promise<any>;
  deleteToken(user: string, tokenKey: string): Promise<any>;
  readTokens(filter: TokenFilter): Promise<Token[]>;
}
