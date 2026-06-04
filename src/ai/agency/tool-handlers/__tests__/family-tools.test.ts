const mockGetUnreadMessages = jest.fn();
const mockMarkMessagesRead = jest.fn();

jest.mock('@/ai/bridge/family-bridge', () => ({
  broadcastMessage: jest.fn(),
  getUnreadMessages: (...args: unknown[]) => mockGetUnreadMessages(...args),
  getRecentMessages: jest.fn(),
  markMessagesRead: (...args: unknown[]) => mockMarkMessagesRead(...args),
  readBridgeState: jest.fn(),
}));

jest.mock('@/ai/vision/family-recognition', () => ({
  registerFamilyMember: jest.fn(),
  addReferenceImage: jest.fn(),
  getFamilyMember: jest.fn(),
  getFamilyMemberByName: jest.fn(),
  listFamilyMembers: jest.fn().mockReturnValue([]),
  removeFamilyMember: jest.fn(),
  updateFamilyMember: jest.fn(),
  detectFaces: jest.fn(),
  recognizeFaces: jest.fn(),
  isPersonInImage: jest.fn(),
  formatRecognitionResult: jest.fn(),
  formatFamilyRegistry: jest.fn(),
  configureFamilyRecognition: jest.fn(),
  loadFamilyRegistry: jest.fn(),
}));

jest.mock('@/ai/family-letters', () => ({
  FAMILY_LETTERS: [],
  getLetterCatalog: jest.fn(),
  _findLetter: jest.fn(),
  findLettersByAuthor: jest.fn(),
  findLettersByTheme: jest.fn(),
  readLetter: jest.fn(),
  getRandomLetter: jest.fn(),
  getLettersAbout: jest.fn(),
}));

import { familyBridge } from '../family-tools';

describe('family-tools familyBridge check action', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUnreadMessages.mockResolvedValue([]);
    mockMarkMessagesRead.mockResolvedValue(undefined);
  });

  it('checks eric inbox when from is eric', async () => {
    await familyBridge({ action: 'check', from: 'eric' });

    expect(mockGetUnreadMessages).toHaveBeenCalledWith('eric');
    expect(mockMarkMessagesRead).toHaveBeenCalledWith('eric');
  });

  it('keeps lazarus behavior unchanged', async () => {
    await familyBridge({ action: 'check', from: 'lazarus' });

    expect(mockGetUnreadMessages).toHaveBeenCalledWith('lazarus');
    expect(mockMarkMessagesRead).toHaveBeenCalledWith('lazarus');
  });
});
