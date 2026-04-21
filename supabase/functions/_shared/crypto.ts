// _shared/crypto.ts
// AES-256-GCM encryption/decryption using Web Crypto API (Deno native).
// ENCRYPTION_KEY must be a 64-char hex string (32 bytes) stored as Supabase secret.

const ALGO = 'AES-GCM';
const IV_LENGTH = 12; // 96 bits recommended for GCM
const TAG_LENGTH = 128; // bits

function getKey(): string {
  const key = Deno.env.get('ENCRYPTION_KEY');
  if (!key || key.length !== 64) {
    throw new Error('ENCRYPTION_KEY env var must be a 64-char hex string (32 bytes)');
  }
  return key;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// deno-lint-ignore no-explicit-any
async function importKey(hexKey: string): Promise<any> {
  return crypto.subtle.importKey(
    'raw',
    hexToBytes(hexKey),
    { name: ALGO },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Encrypt a plaintext string → hex string (iv + ciphertext).
 * Format: <12-byte IV hex><ciphertext+tag hex>
 * Returns the original string unchanged if ENCRYPTION_KEY is not set (graceful degradation).
 */
export async function encrypt(plaintext: string): Promise<string> {
  try {
    const keyHex = getKey();
    const key = await importKey(keyHex);
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const encoded = new TextEncoder().encode(plaintext);
    const cipherBuf = await crypto.subtle.encrypt(
      { name: ALGO, iv, tagLength: TAG_LENGTH },
      key,
      encoded,
    );
    const cipher = new Uint8Array(cipherBuf);
    return 'enc:' + bytesToHex(iv) + bytesToHex(cipher);
  } catch {
    // If encryption fails (no key configured), return plaintext as-is
    return plaintext;
  }
}

/**
 * Decrypt a hex string → plaintext string.
 * If the value doesn't start with 'enc:', it's assumed to be plaintext (backward compat).
 */
export async function decrypt(encryptedHex: string): Promise<string> {
  if (!encryptedHex || !encryptedHex.startsWith('enc:')) {
    // Not encrypted — return as-is (backward compatibility with existing plaintext data)
    return encryptedHex;
  }
  try {
    const keyHex = getKey();
    const key = await importKey(keyHex);
    const hex = encryptedHex.slice(4); // Remove 'enc:' prefix
    const iv = hexToBytes(hex.substring(0, IV_LENGTH * 2));
    const cipher = hexToBytes(hex.substring(IV_LENGTH * 2));
    const plainBuf = await crypto.subtle.decrypt(
      { name: ALGO, iv, tagLength: TAG_LENGTH },
      key,
      cipher,
    );
    return new TextDecoder().decode(plainBuf);
  } catch {
    // If decryption fails, return the original string (may be plaintext)
    return encryptedHex;
  }
}
