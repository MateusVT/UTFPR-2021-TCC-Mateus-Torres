import { readFileSync } from 'fs';

/**
 * Parse a file returning HTTP code, Content-Type and the Object
 *
 * @param {string} filePath
 * @returns {boolean}
 */
export function readFileFrom(filePath: string): any {
  const file = readFileSync(filePath, 'utf8');
  return JSON.parse(file);
}
