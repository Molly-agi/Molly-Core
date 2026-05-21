import { firebaseConfig } from '@/firebase/config';
import { getSdks, initializeFirebase } from '@/firebase/index';

jest.mock('firebase/app', () => ({
  initializeApp: jest.fn(),
  getApps: jest.fn(),
  getApp: jest.fn(),
}));

jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(),
}));

jest.mock('firebase/firestore', () => ({
  getFirestore: jest.fn(),
}));

/* eslint-disable @typescript-eslint/no-require-imports -- jest mock access */
const { initializeApp, getApps, getApp } = require('firebase/app');
const { getAuth } = require('firebase/auth');
const { getFirestore } = require('firebase/firestore');
/* eslint-enable @typescript-eslint/no-require-imports */

describe('firebase/index', () => {
  const nodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NODE_ENV = nodeEnv;
  });

  afterAll(() => {
    process.env.NODE_ENV = nodeEnv;
  });

  it('returns SDK wrappers for a specific app', () => {
    const app = { appId: 'app-1' };
    const auth = { name: 'auth' };
    const firestore = { name: 'firestore' };

    getAuth.mockReturnValue(auth);
    getFirestore.mockReturnValue(firestore);

    expect(getSdks(app as never)).toEqual({
      firebaseApp: app,
      auth,
      firestore,
    });
  });

  it('initializes without args when no app exists', () => {
    const app = { appId: 'new-app' };
    getApps.mockReturnValue([]);
    initializeApp.mockReturnValue(app);
    getAuth.mockReturnValue({ authFor: app });
    getFirestore.mockReturnValue({ dbFor: app });

    const result = initializeFirebase();

    expect(initializeApp).toHaveBeenCalledTimes(1);
    expect(initializeApp).toHaveBeenCalledWith();
    expect(result.firebaseApp).toBe(app);
  });

  it('falls back to firebaseConfig in production when auto init throws', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const app = { appId: 'fallback-app' };

    process.env.NODE_ENV = 'production';
    getApps.mockReturnValue([]);
    initializeApp
      .mockImplementationOnce(() => {
        throw new Error('auto init failed');
      })
      .mockImplementationOnce(() => app);
    getAuth.mockReturnValue({ authFor: app });
    getFirestore.mockReturnValue({ dbFor: app });

    const result = initializeFirebase();

    expect(initializeApp).toHaveBeenNthCalledWith(1);
    expect(initializeApp).toHaveBeenNthCalledWith(2, firebaseConfig);
    expect(result.firebaseApp).toBe(app);
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('reuses existing app when firebase is already initialized', () => {
    const app = { appId: 'existing' };
    getApps.mockReturnValue([app]);
    getApp.mockReturnValue(app);
    getAuth.mockReturnValue({ authFor: app });
    getFirestore.mockReturnValue({ dbFor: app });

    const result = initializeFirebase();

    expect(initializeApp).not.toHaveBeenCalled();
    expect(getApp).toHaveBeenCalledTimes(1);
    expect(result.firebaseApp).toBe(app);
  });
});