// Mock Firebase Auth to avoid Node.js environment incompatibilities
jest.mock('firebase/auth', () => ({
  signOut: jest.fn(),
}));

jest.mock('@/firebase', () => ({
  useUser: jest.fn(),
  useAuth: jest.fn(),
}));

// Polyfill fetch for Node.js test environment
if (typeof global.fetch === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  global.fetch = require('node-fetch');
}

import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

describe('firebase/error-emitter', () => {
  it('publishes permission-error events to active subscribers', () => {
    const callback = jest.fn();
    const err = new FirestorePermissionError({
      path: 'users/u1',
      operation: 'get',
    });

    errorEmitter.on('permission-error', callback);
    errorEmitter.emit('permission-error', err);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(err);

    errorEmitter.off('permission-error', callback);
  });

  it('does not call callback after unsubscription', () => {
    const callback = jest.fn();
    const err = new FirestorePermissionError({
      path: 'users/u2',
      operation: 'delete',
    });

    errorEmitter.on('permission-error', callback);
    errorEmitter.off('permission-error', callback);
    errorEmitter.emit('permission-error', err);

    expect(callback).not.toHaveBeenCalled();
  });

  it('supports removing unknown callbacks without throwing', () => {
    const callback = jest.fn();
    expect(() => errorEmitter.off('permission-error', callback)).not.toThrow();
  });
});