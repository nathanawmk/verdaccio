import { promisify } from 'util';
import fs from 'fs';

const readFile = promisify(fs.readFile);
const mkdirSync = promisify(fs.mkdirSync);
const writeFile = promisify(fs.writeFile);

export const readFilePromise = async (path) => {
  return await readFile(path, 'utf8');
};

export const mkdirPromise = mkdirSync;
export const writeFilePromise = writeFile;
