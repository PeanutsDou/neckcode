import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import { promises as fs } from 'fs';
import { join } from 'path';

const ALGO = 'aes-256-gcm';
const KEY_FILE = join(process.cwd(), '.deepseekcode', '.key');

let masterKey: Buffer | null = null;

async function getKey(): Promise<Buffer> {
  if (masterKey) return masterKey;
  try {
    const raw = await fs.readFile(KEY_FILE, 'utf8');
    masterKey = Buffer.from(raw.trim(), 'hex');
  } catch {
    masterKey = randomBytes(32);
    await fs.mkdir(join(process.cwd(), '.deepseekcode'), { recursive: true });
    await fs.writeFile(KEY_FILE, masterKey.toString('hex'), 'utf8');
  }
  return masterKey;
}

export async function encrypt(plaintext: string): Promise<string> {
  if (!plaintext) return '';
  const key = await getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: iv:tag:ciphertext (all hex)
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export async function decrypt(encoded: string): Promise<string> {
  if (!encoded) return '';
  // If not in encrypted format, return as-is (legacy plaintext)
  if (!encoded.includes(':')) return encoded;

  const key = await getKey();
  const parts = encoded.split(':');
  if (parts.length !== 3) return encoded; // legacy format

  try {
    const iv = Buffer.from(parts[0], 'hex');
    const tag = Buffer.from(parts[1], 'hex');
    const encrypted = Buffer.from(parts[2], 'hex');
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch {
    return encoded; // Decryption failed, return as-is (might be legacy plaintext)
  }
}
