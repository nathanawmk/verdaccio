import path from 'path';
import * as httpMocks from 'node-mocks-http';
import fs from 'fs';
import { Config, parseConfigFile } from '@verdaccio/config';
import { ErrorCode } from '@verdaccio/utils';
import { API_ERROR, HEADER_TYPE, HTTP_STATUS, VerdaccioError } from '@verdaccio/commons-api';
import { ProxyStorage, SearchQuery } from '../src/up-storage';
import { errorUtils, streamUtils } from '@verdaccio/core';

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
      setGlobalDispatcher(mockAgent);
      const mockClient = mockAgent.get(domain);
      mockClient.intercept(options).reply(200, response);
      const prox1 = new ProxyStorage(defaultRequestOptions, conf);
      const stream = await prox1.search({
        headers: {
          referer: 'some.org',
        },
        query,
        url: `${domain}/-/v1/search`,
      });

      expect(await streamUtils.readableToString(stream)).toEqual('{"body":{"foo":1}}');
    });

    test('handle bad response 409', async () => {
      const mockAgent = new MockAgent({ connections: 1 });
      setGlobalDispatcher(mockAgent);
      const mockClient = mockAgent.get(domain);
      mockClient.intercept(options).reply(409, {});
      const prox1 = new ProxyStorage(defaultRequestOptions, conf);
      await expect(
        prox1.search({
          headers: {
            referer: 'some.org',
          },
          query,
          url: `${domain}/-/v1/search`,
        })
      ).rejects.toThrow('bad status code 409 from uplink');
    });

    //   test('abort search from v1 endpoint', (done) => {
    //     const url = '/-/v1/search';
    //     nock(domain).get(url).delay(20000);
    //     const prox1 = new ProxyStorage(defaultRequestOptions, conf);
    //     const req = httpMocks.createRequest({
    //       method: 'GET',
    //       headers: {
    //         referer: 'some.org',
    //         ['x-forwarded-for']: '10.0.0.1',
    //       },
    //       connection: {
    //         remoteAddress: 'localhost',
    //       },
    //       url,
    //     });
    //     const stream = prox1.search({ req });
    //     stream.on('end', () => {
    //       done();
    //     });
    //     // TODO: apply correct types here
    //     // @ts-ignore
    //     stream.abort();
    //   });

    //   // TODO: we should test the gzip deflate here, but is hard to test
    //   // fix me if you can deal with Incorrect Header Check issue
    //   test.todo('get file from v1 endpoint with gzip headers');

    //   test('search v1 endpoint fails', (done) => {
    //     const url = '/-/v1/search';
    //     nock(domain).get(url).replyWithError('search endpoint is down');
    //     const prox1 = new ProxyStorage(defaultRequestOptions, conf);
    //     const req = httpMocks.createRequest({
    //       method: 'GET',
    //       headers: {
    //         referer: 'some.org',
    //         ['x-forwarded-for']: '10.0.0.1',
    //       },
    //       connection: {
    //         remoteAddress: 'localhost',
    //       },
    //       url,
    //     });
    //     const stream = prox1.search({ req });
    //     stream.on('error', (error) => {
    //       expect(error).toEqual(Error('search endpoint is down'));
    //       done();
    //     });
    //   });

    //   test('search v1 endpoint bad status code', (done) => {
    //     const url = '/-/v1/search';
    //     nock(domain).get(url).reply(409);
    //     const prox1 = new ProxyStorage(defaultRequestOptions, conf);
    //     const req = httpMocks.createRequest({
    //       method: 'GET',
    //       headers: {
    //         referer: 'some.org',
    //         ['x-forwarded-for']: '10.0.0.1',
    //       },
    //       connection: {
    //         remoteAddress: 'localhost',
    //       },
    //       url,
    //     });
    //     const stream = prox1.search({ req });
    //     stream.on('error', (error) => {
    //       expect(error).toEqual(ErrorCode.getInternalError(`bad status code 409 from uplink`));
    //       done();
    //     });
    //   });
  });
});
