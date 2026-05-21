import { FirestorePermissionError } from '@/firebase/errors';

jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(),
}));

/* eslint-disable @typescript-eslint/no-require-imports -- jest mock access */
const { getAuth } = require('firebase/auth');
/* eslint-enable @typescript-eslint/no-require-imports */

describe('firebase/errors', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('builds request details without auth when auth lookup fails', () => {
    getAuth.mockImplementation(() => {
      throw new Error('not initialized');
    });

    const err = new FirestorePermissionError({
      path: 'users/u1/notes/n1',
      operation: 'get',
    });

    expect(err.name).toBe('FirebaseError');
    expect(err.request.auth).toBeNull();
    expect(err.request.method).toBe('get');
    expect(err.request.path).toBe('/databases/(default)/documents/users/u1/notes/n1');
    expect(err.request.resource).toBeUndefined();
    expect(err.message).toContain('Missing or insufficient permissions');
  });

  it('maps current user to security rules auth object', () => {
    getAuth.mockReturnValue({
      currentUser: {
        uid: 'u123',
        displayName: 'Molly',
        email: 'molly@example.com',
        emailVerified: true,
        phoneNumber: '+15555550123',
        tenantId: 'tenant-1',
        providerData: [
          { providerId: 'google.com', uid: 'google-u123' },
          { providerId: 'password', uid: 'email-u123' },
        ],
      },
    });

    const err = new FirestorePermissionError({
      path: 'projects/p1',
      operation: 'update',
      requestResourceData: { title: 'updated' },
    });

    expect(err.request.auth).toMatchObject({
      uid: 'u123',
      token: {
        name: 'Molly',
        email: 'molly@example.com',
        email_verified: true,
        phone_number: '+15555550123',
        sub: 'u123',
        firebase: {
          sign_in_provider: 'google.com',
          tenant: 'tenant-1',
          identities: {
            'google.com': ['google-u123'],
            password: ['email-u123'],
          },
        },
      },
    });
    expect(err.request.resource).toMatchObject({ data: { title: 'updated' } });
  });
});