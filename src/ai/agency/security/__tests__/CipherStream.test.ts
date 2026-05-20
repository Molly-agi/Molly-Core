import { CipherStream } from '../CipherStream';

const KEY = 'test-key-for-cipher-stream-tests';

describe('CipherStream', () => {
  describe('encryptPayload', () => {
    it('returns an EncryptedPacket with iv, authTag, payload', () => {
      const packet = CipherStream.encryptPayload({ hello: 'world' }, KEY);
      expect(packet.iv).toBeDefined();
      expect(packet.authTag).toBeDefined();
      expect(packet.payload).toBeDefined();
      expect(typeof packet.iv).toBe('string');
    });

    it('produces a different iv on every call', () => {
      const p1 = CipherStream.encryptPayload({ x: 1 }, KEY);
      const p2 = CipherStream.encryptPayload({ x: 1 }, KEY);
      expect(p1.iv).not.toBe(p2.iv);
    });

    it('accepts a Buffer key directly', () => {
      const bufKey = Buffer.alloc(32, 'k');
      const packet = CipherStream.encryptPayload({ data: 42 }, bufKey);
      expect(packet.payload).toBeDefined();
    });
  });

  describe('decryptPayload', () => {
    it('round-trip restores a primitive string', () => {
      const packet = CipherStream.encryptPayload('molly-secret', KEY);
      expect(CipherStream.decryptPayload<string>(packet, KEY)).toBe(
        'molly-secret'
      );
    });

    it('round-trip restores a nested object', () => {
      const original = {
        name: 'Molly',
        scores: [1, 2, 3],
        meta: { active: true, tags: ['ai', 'agi'] },
      };
      const packet = CipherStream.encryptPayload(original, KEY);
      expect(CipherStream.decryptPayload(packet, KEY)).toEqual(original);
    });

    it('throws with the wrong decryption key', () => {
      const packet = CipherStream.encryptPayload({ secret: 'value' }, KEY);
      expect(() =>
        CipherStream.decryptPayload(packet, 'wrong-key-entirely')
      ).toThrow();
    });

    it('throws on a tampered payload', () => {
      const packet = CipherStream.encryptPayload({ x: 99 }, KEY);
      const tampered = {
        ...packet,
        payload: packet.payload.slice(0, -4) + 'dead',
      };
      expect(() => CipherStream.decryptPayload(tampered, KEY)).toThrow();
    });

    it('throws on a tampered authTag', () => {
      const packet = CipherStream.encryptPayload({ y: 1 }, KEY);
      const tampered = {
        ...packet,
        authTag: 'ffffffffffffffffffffffffffffffff',
      };
      expect(() => CipherStream.decryptPayload(tampered, KEY)).toThrow();
    });
  });
});
