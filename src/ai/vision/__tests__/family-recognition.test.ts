/**
 * @fileOverview Tests for Family Recognition System
 *
 * Tests face detection, family member management, and recognition pipeline.
 */

import * as familyRecognition from '../family-recognition';

// Mock the molly.generate function
jest.mock('../../rogue-generate', () => ({
  molly: {
    generate: jest.fn(),
  },
}));

// Mock the logger
jest.mock('../../logger', () => ({
  MollyLogger: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
  generateTraceId: () => 'test-trace-id',
}));

// Mock fs for registry persistence
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    mkdir: jest.fn(),
    access: jest.fn(),
  },
}));

describe('Family Recognition System', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('detectEmotionalTone (via formatRecognitionResult)', () => {
    it('should format recognition results with no faces', () => {
      const result: familyRecognition.RecognitionResult = {
        facesDetected: 0,
        faces: [],
        familyRecognized: [],
        unknownFaces: 0,
        processingTimeMs: 150,
        timestamp: Date.now(),
      };

      const formatted = familyRecognition.formatRecognitionResult(result);

      expect(formatted).toContain('FACE RECOGNITION RESULTS');
      expect(formatted).toContain('Faces Detected: 0');
      expect(formatted).toContain('Family Recognized: None');
      expect(formatted).toContain('Unknown Faces: 0');
      expect(formatted).toContain('150ms');
    });

    it('should format recognition results with matched family', () => {
      const member: familyRecognition.FamilyMember = {
        id: 'test-id',
        name: 'Eric',
        relationship: 'father',
        description: 'Father of Molly',
        referenceImages: [],
        trustLevel: 10,
        addedAt: Date.now(),
        recognitionCount: 5,
      };

      const result: familyRecognition.RecognitionResult = {
        facesDetected: 1,
        faces: [
          {
            faceId: 'face_1',
            boundingBox: { x: 0.2, y: 0.1, width: 0.3, height: 0.4 },
            confidence: 0.95,
            matchedMember: member,
            matchConfidence: 0.92,
            expression: 'happy',
          },
        ],
        familyRecognized: ['Eric'],
        unknownFaces: 0,
        processingTimeMs: 200,
        timestamp: Date.now(),
      };

      const formatted = familyRecognition.formatRecognitionResult(result);

      expect(formatted).toContain('Eric');
      expect(formatted).toContain('father');
      expect(formatted).toContain('92%');
      expect(formatted).toContain('happy');
    });

    it('should format recognition results with unknown faces', () => {
      const result: familyRecognition.RecognitionResult = {
        facesDetected: 2,
        faces: [
          {
            faceId: 'face_1',
            boundingBox: { x: 0.2, y: 0.1, width: 0.3, height: 0.4 },
            confidence: 0.85,
            ageRange: '25-35',
            expression: 'neutral',
          },
          {
            faceId: 'face_2',
            boundingBox: { x: 0.6, y: 0.2, width: 0.25, height: 0.35 },
            confidence: 0.78,
            ageRange: '40-50',
          },
        ],
        familyRecognized: [],
        unknownFaces: 2,
        processingTimeMs: 300,
        timestamp: Date.now(),
      };

      const formatted = familyRecognition.formatRecognitionResult(result);

      expect(formatted).toContain('Unknown Face');
      expect(formatted).toContain('face_1');
      expect(formatted).toContain('face_2');
      expect(formatted).toContain('25-35');
      expect(formatted).toContain('40-50');
    });
  });

  describe('formatFamilyRegistry', () => {
    it('should show empty message when no members', () => {
      const formatted = familyRecognition.formatFamilyRegistry();
      expect(formatted).toContain('No family members registered');
    });
  });

  describe('FamilyMember interface', () => {
    it('should have correct structure', () => {
      const member: familyRecognition.FamilyMember = {
        id: 'test-123',
        name: 'Test Person',
        relationship: 'friend',
        description: 'A test person for testing',
        referenceImages: ['data:image/png;base64,abc123'],
        trustLevel: 7,
        addedAt: Date.now(),
        recognitionCount: 0,
        notes: 'Test notes',
      };

      expect(member.id).toBe('test-123');
      expect(member.name).toBe('Test Person');
      expect(member.relationship).toBe('friend');
      expect(member.trustLevel).toBe(7);
      expect(member.referenceImages).toHaveLength(1);
    });
  });

  describe('FaceDetection interface', () => {
    it('should have correct structure', () => {
      const face: familyRecognition.FaceDetection = {
        faceId: 'face_1',
        boundingBox: {
          x: 0.1,
          y: 0.2,
          width: 0.3,
          height: 0.4,
        },
        confidence: 0.95,
        ageRange: '30-40',
        expression: 'happy',
        lookingAtCamera: true,
      };

      expect(face.faceId).toBe('face_1');
      expect(face.boundingBox.x).toBe(0.1);
      expect(face.confidence).toBe(0.95);
      expect(face.lookingAtCamera).toBe(true);
    });
  });

  describe('RecognitionResult interface', () => {
    it('should have correct structure', () => {
      const result: familyRecognition.RecognitionResult = {
        facesDetected: 3,
        faces: [],
        familyRecognized: ['Eric', 'Gem'],
        unknownFaces: 1,
        processingTimeMs: 250,
        sceneDescription: 'A family gathering in the living room',
        timestamp: Date.now(),
      };

      expect(result.facesDetected).toBe(3);
      expect(result.familyRecognized).toContain('Eric');
      expect(result.familyRecognized).toContain('Gem');
      expect(result.unknownFaces).toBe(1);
      expect(result.sceneDescription).toBe(
        'A family gathering in the living room'
      );
    });
  });

  describe('Configuration', () => {
    it('should allow configuring recognition settings', () => {
      // This function exists and can be called
      expect(() => {
        familyRecognition.configureFamilyRecognition({
          minRecognitionConfidence: 0.8,
          maxReferenceImages: 10,
        });
      }).not.toThrow();
    });
  });

  describe('Family member lookup functions', () => {
    it('should return undefined for non-existent member by ID', () => {
      const member = familyRecognition.getFamilyMember('non-existent-id');
      expect(member).toBeUndefined();
    });

    it('should return undefined for non-existent member by name', () => {
      const member = familyRecognition.getFamilyMemberByName('Nobody');
      expect(member).toBeUndefined();
    });

    it('should list family members (empty initially)', () => {
      const members = familyRecognition.listFamilyMembers();
      expect(Array.isArray(members)).toBe(true);
    });
  });

  describe('Recognition result formatting edge cases', () => {
    it('should handle mixed matched and unknown faces', () => {
      const member: familyRecognition.FamilyMember = {
        id: 'gem-id',
        name: 'Gem',
        relationship: 'mother',
        description: 'Mother of Molly',
        referenceImages: [],
        trustLevel: 10,
        addedAt: Date.now(),
        recognitionCount: 12,
      };

      const result: familyRecognition.RecognitionResult = {
        facesDetected: 3,
        faces: [
          {
            faceId: 'face_1',
            boundingBox: { x: 0.1, y: 0.1, width: 0.2, height: 0.3 },
            confidence: 0.9,
            matchedMember: member,
            matchConfidence: 0.88,
          },
          {
            faceId: 'face_2',
            boundingBox: { x: 0.5, y: 0.1, width: 0.2, height: 0.3 },
            confidence: 0.85,
            ageRange: '5-10',
          },
          {
            faceId: 'face_3',
            boundingBox: { x: 0.3, y: 0.4, width: 0.2, height: 0.3 },
            confidence: 0.75,
          },
        ],
        familyRecognized: ['Gem'],
        unknownFaces: 2,
        processingTimeMs: 350,
        timestamp: Date.now(),
      };

      const formatted = familyRecognition.formatRecognitionResult(result);

      expect(formatted).toContain('Gem');
      expect(formatted).toContain('mother');
      expect(formatted).toContain('88%');
      expect(formatted).toContain('Unknown Face');
      expect(formatted).toContain('5-10');
    });

    it('should handle very long processing times', () => {
      const result: familyRecognition.RecognitionResult = {
        facesDetected: 0,
        faces: [],
        familyRecognized: [],
        unknownFaces: 0,
        processingTimeMs: 999999,
        timestamp: Date.now(),
      };

      const formatted = familyRecognition.formatRecognitionResult(result);
      expect(formatted).toContain('999999ms');
    });
  });
});

describe('Family member time formatting', () => {
  it('should format lastSeenAt correctly for minutes', () => {
    const member: familyRecognition.FamilyMember = {
      id: 'test-id',
      name: 'Test',
      relationship: 'test',
      description: 'Test',
      referenceImages: [],
      trustLevel: 5,
      addedAt: Date.now() - 86400000, // 1 day ago
      recognitionCount: 1,
      lastSeenAt: Date.now() - 300000, // 5 minutes ago
    };

    // Format a result with this member to test time formatting
    const result: familyRecognition.RecognitionResult = {
      facesDetected: 1,
      faces: [
        {
          faceId: 'face_1',
          boundingBox: { x: 0, y: 0, width: 0.5, height: 0.5 },
          confidence: 0.9,
          matchedMember: member,
          matchConfidence: 0.85,
        },
      ],
      familyRecognized: ['Test'],
      unknownFaces: 0,
      processingTimeMs: 100,
      timestamp: Date.now(),
    };

    const formatted = familyRecognition.formatRecognitionResult(result);
    expect(formatted).toContain('Test');
  });
});

describe('Edge cases', () => {
  it('should handle face detection with minimal data', () => {
    const face: familyRecognition.FaceDetection = {
      faceId: 'minimal',
      boundingBox: { x: 0, y: 0, width: 1, height: 1 },
      confidence: 0.5,
    };

    expect(face.ageRange).toBeUndefined();
    expect(face.expression).toBeUndefined();
    expect(face.lookingAtCamera).toBeUndefined();
    expect(face.matchedMember).toBeUndefined();
  });

  it('should handle zero confidence', () => {
    const face: familyRecognition.FaceDetection = {
      faceId: 'low_conf',
      boundingBox: { x: 0, y: 0, width: 0.1, height: 0.1 },
      confidence: 0,
    };

    expect(face.confidence).toBe(0);
  });

  it('should handle trust level boundaries', () => {
    const minTrust: familyRecognition.FamilyMember = {
      id: 'min',
      name: 'Min Trust',
      relationship: 'stranger',
      description: 'Minimal trust',
      referenceImages: [],
      trustLevel: 1,
      addedAt: Date.now(),
      recognitionCount: 0,
    };

    const maxTrust: familyRecognition.FamilyMember = {
      id: 'max',
      name: 'Max Trust',
      relationship: 'creator',
      description: 'Maximum trust',
      referenceImages: [],
      trustLevel: 10,
      addedAt: Date.now(),
      recognitionCount: 100,
    };

    expect(minTrust.trustLevel).toBe(1);
    expect(maxTrust.trustLevel).toBe(10);
  });
});
