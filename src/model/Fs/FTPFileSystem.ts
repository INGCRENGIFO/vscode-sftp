import * as fs from 'fs';
import * as FileStatus from 'stat-mode';
import FileSystem, { FileEntry, FileType, Stats, StreamOption } from './FileSystem';
import RemoteFileSystem from './RemoteFileSystem';
import { Option } from '../Client/RemoteClient';
import FTPClient from '../Client/FTPClient';

export default class FTPFileSystem extends RemoteFileSystem {
  constructor(pathResolver, option: Option) {
    super(pathResolver);
    this.setClient(new FTPClient(option));
  }

  get ftp() {
    return this.getClient().getFsClient();
  }

  static getFileType(type) {
    if (type === 'd') {
      return FileType.Directory;
    } else if (type === '-') {
      return FileType.File;
    } else if (type === 'l') {
      return FileType.SymbolicLink;
    }
  }

  lstat(path: string): Promise<Stats> {
    return new Promise((resolve, reject) => {
      this.ftp.list(path, (err, stats) => {
        if (err) {
          reject(err);
          return;
        }

        const stat = stats[0];
        resolve({
          ...stat,
          type: FTPFileSystem.getFileType(stat.type),
        });
      });
    });
  }

  get(path, option?: StreamOption): Promise<fs.ReadStream> {
    return new Promise((resolve, reject) => {
      this.ftp.get(path, (err, stream) => {
        if (err) {
          reject(err);
          return;
        };

        if (!stream) {
          reject(new Error('create ReadStream failed'));
          return;
        }

        resolve(stream);
      });
    });
  }

  put(input: fs.ReadStream | Buffer, path, option?: StreamOption): Promise<null> {
    return new Promise((resolve, reject) => {
      this.ftp.put(input, path, err => {
        if (err) {
          reject(err);
          return;
        };

        resolve();
      });
    });
  }

  readlink(path: string): Promise<string> {
    return this.lstat(path)
      .then(stat => stat.target)
  }

  symlink(targetPath: string, path: string): Promise<null> {
    // TO-DO implement
    return Promise.resolve();
  }

  mkdir(dir: string): Promise<null> {
    return new Promise((resolve, reject) => {
      this.ftp.mkdir(dir, err => {
        // if (err && err.message !== 'Cannot create a file when that file already exists.') { // reject except already exist
        if (err && err.code !== 550) { // reject except already exist
          reject(err);
          return;
        }
        resolve();
      });
    });
  }

  ensureDir(dir: string): Promise<null> {
    return new Promise((resolve, reject) => {
      const tokens = dir.split(this.pathResolver.sep);

      let root = tokens.shift();
      let dirPath = root === '' ? '/' : root;

      const mkdir = () => {
        let token = tokens.shift();
        if (!token && !tokens.length) {
          resolve();
          return;
        }
        token += '/';
        dirPath = this.pathResolver.join(dirPath, token);
        return this.mkdir(dirPath)
          .then(mkdir);
      };
      return mkdir();
    });
  }

  toFileEntry(fullPath, stat): FileEntry {
    return {
      fspath: fullPath,
      type: FTPFileSystem.getFileType(stat.type),
      name: stat.name,
      size: stat.size,
      modifyTime: stat.date.getTime() / 1000,
      accessTime: stat.date.getTime() / 1000,
    };
  }

  list(dir: string): Promise<FileEntry[]> {
    return new Promise((resolve, reject) => {
      this.ftp.list(dir, (err, result = []) => {
        if (err) {
          reject(err);
          return;
        }

        const fileEntries = result.map(item =>
          this.toFileEntry(this.pathResolver.join(dir, item.name), item));
        resolve(fileEntries);
      });
    });
  }

  unlink(path: string): Promise<null> {
    return new Promise((resolve, reject) => {
      this.ftp.delete(path, err => {
        if (err) {
          reject(err);
          return;
        }

        resolve();
      });
    });
  }

  rmdir(path: string, recursive: boolean): Promise<null> {
    return new Promise((resolve, reject) => {
      this.ftp.rmdir(path, recursive, err => {
        if (err) {
          reject(err);
          return;
        }

        resolve();
      })
    });
  }
}