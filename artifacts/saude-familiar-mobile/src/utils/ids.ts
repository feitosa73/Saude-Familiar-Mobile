import * as Crypto from 'expo-crypto';

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function encodeTimestamp(timestamp: number): string {
  let value = timestamp;
  let encoded = '';

  for (let index = 0; index < 10; index += 1) {
    encoded = CROCKFORD[value % 32] + encoded;
    value = Math.floor(value / 32);
  }

  return encoded;
}

function encodeRandomness(bytes: Uint8Array): string {
  let buffer = 0;
  let bits = 0;
  let encoded = '';

  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;

    while (bits >= 5 && encoded.length < 16) {
      bits -= 5;
      encoded += CROCKFORD[(buffer >> bits) & 31];
    }
  }

  return encoded.padEnd(16, '0');
}

/**
 * Generates a ULID-compatible opaque ID without Date.now()+Math.random().
 * The timestamp portion keeps local records sortable while crypto supplies
 * the randomness needed for a stable future sync identity.
 */
export async function createGlobalId(): Promise<string> {
  const randomBytes = await Crypto.getRandomBytesAsync(10);
  return `${encodeTimestamp(Date.now())}${encodeRandomness(randomBytes)}`;
}