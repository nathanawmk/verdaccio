// /* eslint-disable jest/no-mocks-import */
// import fs from 'fs';

// import { IPluginStorage, PluginOptions } from '@verdaccio/types';

// import LocalDatabase from '../src/private-db';
// import { ILocalFSPackageManager } from '../src/package-cache';
// import * as pkgUtils from '../src/pkg-utils';

// // FIXME: remove this mocks imports
// // import Config from './__mocks__/Config';
// // import logger from './__mocks__/Logger';

// // const optionsPlugin: PluginOptions<{}> = {
// //   logger,
// //   config: new Config(),
// // };

// let locaDatabase: IPluginStorage<{}>;
// // let loadPrivatePackages;

// describe('Local Database', () => {
//   afterEach(() => {
//     jest.clearAllMocks();
//   });

//   describe('search', () => {
//     const onPackageMock = jest.fn((item, cb) => cb());
//     const validatorMock = jest.fn(() => true);
//     const callSearch = (db, numberTimesCalled, cb): void => {
//       db.search(
//         onPackageMock,
//         function onEnd() {
//           expect(onPackageMock).toHaveBeenCalledTimes(numberTimesCalled);
//           expect(validatorMock).toHaveBeenCalledTimes(numberTimesCalled);
//           cb();
//         },
//         validatorMock
//       );
//     };

//     test('should find scoped packages', (done) => {
//       const scopedPackages = ['@pkg1/test'];
//       const stats = { mtime: new Date() };
//       jest.spyOn(fs, 'stat').mockImplementation((_, cb) => cb(null, stats as fs.Stats));
//       jest
//         .spyOn(fs, 'readdir')
//         .mockImplementation((storePath, cb) =>
//           cb(null, storePath.match('test-storage') ? scopedPackages : [])
//         );

//       callSearch(locaDatabase, 1, done);
//     });

//     //   test('should find non scoped packages', (done) => {
//     //     const nonScopedPackages = ['pkg1', 'pkg2'];
//     //     const stats = { mtime: new Date() };
//     //     jest.spyOn(fs, 'stat').mockImplementation((_, cb) => cb(null, stats as fs.Stats));
//     //     jest
//     //       .spyOn(fs, 'readdir')
//     //       .mockImplementation((storePath, cb) =>
//     //         cb(null, storePath.match('test-storage') ? nonScopedPackages : [])
//     //       );

//     //     const db = new LocalDatabase(
//     //       assign({}, optionsPlugin.config, {
//     //         // clean up this, it creates noise
//     //         packages: {},
//     //       }),
//     //       optionsPlugin.logger
//     //     );

//     //     callSearch(db, 2, done);
//     //   });

//     //   test('should fails on read the storage', (done) => {
//     //     const spyInstance = jest
//     //       .spyOn(fs, 'readdir')
//     //       .mockImplementation((_, cb) => cb(Error('fails'), null));

//     //     const db = new LocalDatabase(
//     //       assign({}, optionsPlugin.config, {
//     //         // clean up this, it creates noise
//     //         packages: {},
//     //       }),
//     //       optionsPlugin.logger
//     //     );

//     //     callSearch(db, 0, done);
//     //     spyInstance.mockRestore();
//     //   });
//     // });
//   });
// });
