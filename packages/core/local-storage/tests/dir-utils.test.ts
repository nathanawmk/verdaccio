import { join, isAbsolute } from 'path';
import { searchUtils } from '../../../proxy/node_modules/@verdaccio/core/build';
import { getFolders, searchOnStorage } from '../src/dir-utils';

const defaultQuery: searchUtils.SearchQuery = {
  maintenance: 1,
  popularity: 1,
  quality: 1,
  size: 1,
  text: 'bar',
};

const mockFolder = join(__dirname, 'mockStorage');

const pathStorage1 = join(mockFolder, 'storage1');
const pathStorage2 = join(mockFolder, 'storage2');
const storages = new Map<string, string>();
storages.set('storage1', pathStorage1);
storages.set('storage2', pathStorage2);

test('getFolders storage 1', async () => {
  global.__dirname = 'foo/';
  const files = await getFolders(pathStorage1);
  expect(files).toHaveLength(2);
});

test('getFolders storage 2', async () => {
  global.__dirname = 'foo/';
  const files = await getFolders(pathStorage2);
  expect(files).toHaveLength(1);
});

describe('searchOnFolders', () => {
  test('should find results', async () => {
    const packages = await searchOnStorage(mockFolder, storages, { ...defaultQuery, text: 'foo' });
    expect(packages).toHaveLength(2);
  });

  test('should not find results', async () => {
    const packages = await searchOnStorage(mockFolder, storages, { ...defaultQuery, text: 'aaaa' });
    expect(packages).toHaveLength(0);
  });

  test('should match results', async () => {
    const packages = await searchOnStorage(mockFolder, storages, { ...defaultQuery, text: 'foo' });
    expect(packages[0].name).toEqual('@foo/pkg1');
    expect(isAbsolute(packages[0].path)).toBeTruthy();
  });
});
