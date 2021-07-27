// eslint-disable-next-line @typescript-eslint/no-unused-vars
/* global AbortController */

import path from 'path';
import semver from 'semver';
import { Config, parseConfigFile } from '@verdaccio/config';
import { streamUtils } from '@verdaccio/core';
import { ProxyStorage, SearchQuery } from '../src/up-storage';

if (semver.lte(process.version, 'v15.0.0')) {
  global.AbortController = require('abortcontroller-polyfill/dist/cjs-ponyfill').AbortController;
}

const getConf = (name) => path.join(__dirname, '/conf', name);

const mockDebug = jest.fn();
const mockInfo = jest.fn();
const mockHttp = jest.fn();
const mockError = jest.fn();
const mockWarn = jest.fn();
jest.mock('@verdaccio/logger', () => {
  const originalLogger = jest.requireActual('@verdaccio/logger');
  return {
    ...originalLogger,
    logger: {
      child: () => ({
        debug: (arg) => mockDebug(arg),
        info: (arg) => mockInfo(arg),
        http: (arg) => mockHttp(arg),
        error: (arg) => mockError(arg),
        warn: (arg) => mockWarn(arg),
      }),
    },
  };
});

const { MockAgent } = require('undici');
const { setGlobalDispatcher } = require('undici-fetch');
const domain = 'https://registry.npmjs.org';

describe('proxy', () => {
  const query: SearchQuery = {
    text: 'verdaccio',
    maintenance: 1,
    popularity: 1,
    size: 10,
    quality: 1,
  };
  const defaultRequestOptions = {
    url: domain,
  };
  const proxyPath = getConf('proxy1.yaml');
  const conf = new Config(parseConfigFile(proxyPath));

  const options = {
    path: '/-/v1/search?maintenance=1&popularity=1&quality=1&size=10&text=verdaccio',
    method: 'GET',
  };

  describe('search', () => {
    test('get response from v1 endpoint', async () => {
      const response = { body: { foo: 1 } };
      const mockAgent = new MockAgent({ connections: 1 });
      mockAgent.disableNetConnect();
      setGlobalDispatcher(mockAgent);
      const mockClient = mockAgent.get(domain);
      mockClient.intercept(options).reply(200, response);
      const prox1 = new ProxyStorage(defaultRequestOptions, conf);
      const abort = new AbortController();
      const stream = await prox1.search({
        headers: {
          referer: 'some.org',
        },
        query,
        abort,
        url: `${domain}/-/v1/search`,
      });

      expect(await streamUtils.readableToString(stream)).toEqual('{"body":{"foo":1}}');
    });

    test('handle bad response 409', async () => {
      const mockAgent = new MockAgent({ connections: 1 });
      mockAgent.disableNetConnect();
      setGlobalDispatcher(mockAgent);
      const mockClient = mockAgent.get(domain);
      mockClient.intercept(options).reply(409, {});
      const abort = new AbortController();
      const prox1 = new ProxyStorage(defaultRequestOptions, conf);
      await expect(
        prox1.search({
          headers: {
            referer: 'some.org',
          },
          query,
          abort,
          url: `${domain}/-/v1/search`,
        })
      ).rejects.toThrow('bad status code 409 from uplink');
    });

    test.skip('abort search from v1 endpoint', async () => {
      // FIXME: abort not working, this migh require a real mocked http server
      const mockAgent = new MockAgent({ connections: 1 });
      setGlobalDispatcher(mockAgent);
      const mockClient = mockAgent.get(domain);
      mockClient.intercept(options).reply(200, {}).delay(1000);
      const abort = new AbortController();
      const prox1 = new ProxyStorage(defaultRequestOptions, conf);
      abort.abort();
      await expect(
        prox1.search({
          headers: {
            referer: 'some.org',
          },
          query,
          abort,
          url: `${domain}/-/v1/search`,
        })
      ).rejects.toThrow('bad status code 409 from uplink');
    });

    // TODO: we should test the gzip deflate here, but is hard to test
    // fix me if you can deal with Incorrect Header Check issue
    test.todo('get file from v1 endpoint with gzip headers');

    test('search v1 endpoint fails', async () => {
      const mockAgent = new MockAgent({ connections: 1 });
      mockAgent.disableNetConnect();
      setGlobalDispatcher(mockAgent);
      const mockClient = mockAgent.get(domain);
      mockClient.intercept(options).reply(500, {});
      const abort = new AbortController();
      const prox1 = new ProxyStorage(defaultRequestOptions, conf);
      await expect(
        prox1.search({
          headers: {
            referer: 'some.org',
          },
          query,
          abort,
          url: `${domain}/-/v1/search`,
        })
      ).rejects.toThrow('bad status code 500 from uplink');
    });
  });
});
