import { Callback, Config, IPackageStorage, Token, TokenFilter } from '@verdaccio/types';
import { searchUtils } from '.';
interface IPlugin {
    version?: string;
    close?(): void;
}
export interface IPluginStorage<T> extends IPlugin {
    config: T & Config;
    add(name: string, callback: Callback): void;
    remove(name: string, callback: Callback): void;
    get(callback: Callback): void;
    init(): Promise<void>;
    getSecret(): Promise<string>;
    setSecret(secret: string): Promise<any>;
    getPackageStorage(packageInfo: string): IPackageStorage;
    search(query: searchUtils.SearchQuery): Promise<searchUtils.SearchItem[]>;
    saveToken(token: Token): Promise<any>;
    deleteToken(user: string, tokenKey: string): Promise<any>;
    readTokens(filter: TokenFilter): Promise<Token[]>;
}
export {};
