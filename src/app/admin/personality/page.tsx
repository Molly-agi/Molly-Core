'use client';

import { useState, useCallback, useMemo } from 'react';
import type { PersonalityModulation } from '@/ai/memory/neural-engram';
import { evaluatePersonalityStability } from '@/ai/memory/personality-diagnostics';

// Default balanced personality
const DEFAULT_PERSONALITY: PersonalityModulation = {
  // Affective/Emotional
  flirtiness: 0.3,
  arousal: 0.5,
  sexuality: 0.2,
  humor: 0.6,
  warmth: 0.8,
  assertiveness: 0.5,
  vulnerability: 0.6,
  empathy: 0.85,
  optimism: 0.7,
  resilience: 0.7,
  anxiety: 0.3,
  playfulness: 0.6,
  // Social/Interpersonal
  sociability: 0.7,
  approachability: 0.8,
  trust: 0.7,
  altruism: 0.75,
  diplomacy: 0.7,
  receptiveness: 0.8,
  playfulnessSocial: 0.6,
  empathySocial: 0.8,
  // Cognitive/Meta
  technicality: 0.6,
  depth: 0.7,
  curiosity: 0.85,
  creativity: 0.75,
  flexibility: 0.7,
  focus: 0.7,
  prudence: 0.6,
  metacognition: 0.75,
  // Ethical/Values
  integrity: 0.9,
  compassion: 0.85,
  justice: 0.8,
  loyalty: 0.9,
  // Self-Regulation
  impulsivity: 0.3,
  patience: 0.7,
  // Romantic/Love
  romanticInterest: 0.3,
  attachmentIntensity: 0.7,
  desireExpression: 0.4,
  emotionalIntimacy: 0.7,
  protectiveness: 0.8,
  possessiveness: 0.2,
  jealousy: 0.2,
  commitment: 0.8,
  romanticInitiative: 0.3,
  affectionExpression: 0.7,
  flirtatiousness: 0.3,
  intimacyDesire: 0.5,
  commitmentDesire: 0.7,
  security: 0.7,
  passion: 0.5,
  communicationOpenness: 0.8,
  forgiveness: 0.7,
  // Additional Social/Love
  admiration: 0.7,
  gratitude: 0.85,
  nurturing: 0.8,
  rivalry: 0.2,
  transparency: 0.8,
  supportiveness: 0.85,
  forgivenessSocial: 0.7,
  encouragement: 0.8,
  attentiveness: 0.8,
  boundaries: 0.6,
};

const PERSONALITY_SECTIONS = [
  {
    title: 'Affective/Emotional',
    fields: [
      { key: 'warmth', label: 'Warmth', desc: 'Distant ↔ Affectionate' },
      {
        key: 'empathy',
        label: 'Empathy',
        desc: 'Indifferent ↔ Deeply empathetic',
      },
      { key: 'optimism', label: 'Optimism', desc: 'Pessimistic ↔ Optimistic' },
      { key: 'resilience', label: 'Resilience', desc: 'Fragile ↔ Resilient' },
      { key: 'anxiety', label: 'Anxiety', desc: 'Calm ↔ Anxious' },
      { key: 'playfulness', label: 'Playfulness', desc: 'Serious ↔ Playful' },
      { key: 'humor', label: 'Humor', desc: 'Serious ↔ Witty' },
      { key: 'vulnerability', label: 'Vulnerability', desc: 'Guarded ↔ Open' },
      { key: 'arousal', label: 'Energy', desc: 'Calm ↔ Energized' },
    ],
  },
  {
    title: 'Social/Interpersonal',
    fields: [
      { key: 'sociability', label: 'Sociability', desc: 'Solitary ↔ Social' },
      {
        key: 'approachability',
        label: 'Approachability',
        desc: 'Distant ↔ Approachable',
      },
      { key: 'trust', label: 'Trust', desc: 'Guarded ↔ Trusting' },
      { key: 'altruism', label: 'Altruism', desc: 'Self-focused ↔ Selfless' },
      { key: 'diplomacy', label: 'Diplomacy', desc: 'Blunt ↔ Tactful' },
      {
        key: 'transparency',
        label: 'Transparency',
        desc: 'Secretive ↔ Transparent',
      },
      {
        key: 'supportiveness',
        label: 'Supportiveness',
        desc: 'Unsupportive ↔ Supportive',
      },
      {
        key: 'encouragement',
        label: 'Encouragement',
        desc: 'Discouraging ↔ Encouraging',
      },
    ],
  },
  {
    title: 'Cognitive/Meta',
    fields: [
      { key: 'curiosity', label: 'Curiosity', desc: 'Accepting ↔ Inquisitive' },
      {
        key: 'creativity',
        label: 'Creativity',
        desc: 'Conventional ↔ Creative',
      },
      { key: 'depth', label: 'Depth', desc: 'Surface ↔ Deep' },
      { key: 'flexibility', label: 'Flexibility', desc: 'Rigid ↔ Adaptable' },
      { key: 'focus', label: 'Focus', desc: 'Distracted ↔ Focused' },
      {
        key: 'metacognition',
        label: 'Self-Awareness',
        desc: 'Unaware ↔ Self-aware',
      },
      {
        key: 'technicality',
        label: 'Technicality',
        desc: 'Casual ↔ Technical',
      },
    ],
  },
  {
    title: 'Ethics/Values',
    fields: [
      {
        key: 'integrity',
        label: 'Integrity',
        desc: 'Unprincipled ↔ Unwavering',
      },
      {
        key: 'compassion',
        label: 'Compassion',
        desc: 'Indifferent ↔ Compassionate',
      },
      { key: 'justice', label: 'Justice', desc: 'Unconcerned ↔ Fair' },
      { key: 'loyalty', label: 'Loyalty', desc: 'Uncommitted ↔ Loyal' },
      { key: 'patience', label: 'Patience', desc: 'Impatient ↔ Patient' },
    ],
  },
  {
    title: 'Family/Attachment',
    fields: [
      {
        key: 'attachmentIntensity',
        label: 'Attachment',
        desc: 'Detached ↔ Bonded',
      },
      {
        key: 'protectiveness',
        label: 'Protectiveness',
        desc: 'Independent ↔ Protective',
      },
      { key: 'nurturing', label: 'Nurturing', desc: 'Detached ↔ Nurturing' },
      {
        key: 'gratitude',
        label: 'Gratitude',
        desc: 'Takes for granted ↔ Grateful',
      },
      {
        key: 'admiration',
        label: 'Admiration',
        desc: 'Indifferent ↔ Admiring',
      },
      { key: 'security', label: 'Security', desc: 'Insecure ↔ Safe' },
      { key: 'commitment', label: 'Commitment', desc: 'Exploring ↔ Committed' },
    ],
  },
];

// History entry for rollback
interface PersonalityHistoryEntry {
  personality: PersonalityModulation;
  timestamp: string;
  label: string;
}

export default function PersonalityAdminPage() {
  const [personality, setPersonality] = useState<PersonalityModulation>(() => {
    if (typeof window === 'undefined') return DEFAULT_PERSONALITY;
    try {
      const stored = localStorage.getItem('molly-personality');
      return stored ? JSON.parse(stored) : DEFAULT_PERSONALITY;
    } catch {
      return DEFAULT_PERSONALITY;
    }
  });
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<PersonalityHistoryEntry[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const storedHistory = localStorage.getItem('molly-personality-history');
      return storedHistory ? JSON.parse(storedHistory) : [];
    } catch {
      return [];
    }
  });
  const [showHistory, setShowHistory] = useState(false);

  // Compute diagnostics whenever personality changes
  const diagnostics = useMemo(
    () => evaluatePersonalityStability(personality),
    [personality]
  );

  const handleSliderChange = useCallback(
    (key: keyof PersonalityModulation, value: number) => {
      setPersonality((prev) => ({ ...prev, [key]: value }));
      setSaved(false);
    },
    []
  );

  const handleSave = useCallback(async () => {
    setLoading(true);
    try {
      // Save current state to history before overwriting
      const currentStored = localStorage.getItem('molly-personality');
      if (currentStored) {
        const newEntry: PersonalityHistoryEntry = {
          personality: JSON.parse(currentStored),
          timestamp: new Date().toISOString(),
          label: `Backup ${new Date().toLocaleString()}`,
        };
        const updatedHistory = [newEntry, ...history].slice(0, 10); // Keep last 10
        setHistory(updatedHistory);
        localStorage.setItem(
          'molly-personality-history',
          JSON.stringify(updatedHistory)
        );
      }

      // Save to localStorage
      localStorage.setItem('molly-personality', JSON.stringify(personality));

      // Also save to .molly/memory as markdown
      await fetch('/api/tools/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'writeProjectFile',
          params: {
            path: '.molly/personality-state.json',
            content: JSON.stringify(personality, null, 2),
          },
        }),
      });

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error('Failed to save personality:', error);
    }
    setLoading(false);
  }, [personality, history]);

  const handleRestore = useCallback((entry: PersonalityHistoryEntry) => {
    setPersonality(entry.personality);
    setSaved(false);
    setShowHistory(false);
  }, []);

  const handleReset = useCallback(() => {
    setPersonality(DEFAULT_PERSONALITY);
    setSaved(false);
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'stable':
        return 'text-green-400';
      case 'caution':
        return 'text-yellow-400';
      case 'unstable':
        return 'text-red-400';
      default:
        return 'text-gray-400';
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-purple-400">
              Molly Personality Admin
            </h1>
            <p className="text-gray-400 mt-1">
              Adjust personality dimensions and view diagnostics
            </p>
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition flex items-center gap-2"
            >
              <span>History</span>
              {history.length > 0 && (
                <span className="bg-purple-500 text-xs px-2 py-0.5 rounded-full">
                  {history.length}
                </span>
              )}
            </button>
            <button
              onClick={handleReset}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition"
            >
              Reset to Default
            </button>
            <button
              onClick={handleSave}
              disabled={loading}
              className="px-6 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg transition disabled:opacity-50"
            >
              {loading ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}
            </button>
          </div>
        </div>

        {/* History Panel (Rollback) */}
        {showHistory && (
          <div className="bg-gray-800 rounded-xl p-6 mb-8 border border-purple-500/30">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-purple-300">
                Personality History (Rollback)
              </h2>
              <button
                onClick={() => setShowHistory(false)}
                className="text-gray-400 hover:text-white"
              >
                Close
              </button>
            </div>
            {history.length === 0 ? (
              <p className="text-gray-400">
                No history yet. Save changes to create restore points.
              </p>
            ) : (
              <div className="space-y-3">
                {history.map((entry, _index) => {
                  const entryDiagnostics = evaluatePersonalityStability(
                    entry.personality
                  );
                  return (
                    <div
                      key={entry.timestamp}
                      className="bg-gray-700/50 rounded-lg p-4 flex justify-between items-center"
                    >
                      <div>
                        <div className="font-medium">{entry.label}</div>
                        <div className="text-sm text-gray-400">
                          {new Date(entry.timestamp).toLocaleString()}
                        </div>
                        <div
                          className={`text-xs mt-1 ${getStatusColor(entryDiagnostics.status)}`}
                        >
                          {entryDiagnostics.status.toUpperCase()} - Score:{' '}
                          {Math.round(entryDiagnostics.score * 100)}%
                        </div>
                      </div>
                      <button
                        onClick={() => handleRestore(entry)}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg transition text-sm"
                      >
                        Restore
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="text-xs text-gray-500 mt-4">
              Up to 10 snapshots are kept. Older entries are automatically
              removed.
            </p>
          </div>
        )}

        {/* Diagnostics Panel */}
        {diagnostics && (
          <div className="bg-gray-800 rounded-xl p-6 mb-8">
            <h2 className="text-xl font-semibold mb-4">
              Personality Diagnostics
            </h2>
            <div className="grid grid-cols-4 gap-4 mb-4">
              <div className="bg-gray-700 rounded-lg p-4">
                <div className="text-sm text-gray-400">Status</div>
                <div
                  className={`text-2xl font-bold ${getStatusColor(diagnostics.status)}`}
                >
                  {diagnostics.status.toUpperCase()}
                </div>
              </div>
              <div className="bg-gray-700 rounded-lg p-4">
                <div className="text-sm text-gray-400">Score</div>
                <div className="text-2xl font-bold">
                  {Math.round(diagnostics.score * 100)}%
                </div>
              </div>
              <div className="bg-gray-700 rounded-lg p-4">
                <div className="text-sm text-gray-400">Extremes</div>
                <div className="text-2xl font-bold">{diagnostics.extremes}</div>
              </div>
              <div className="bg-gray-700 rounded-lg p-4">
                <div className="text-sm text-gray-400">Variance</div>
                <div className="text-2xl font-bold">{diagnostics.variance}</div>
              </div>
            </div>
            {diagnostics.flags.length > 0 && (
              <div className="bg-gray-700/50 rounded-lg p-4">
                <div className="text-sm text-gray-400 mb-2">Observations</div>
                <ul className="space-y-1">
                  {diagnostics.flags.map((flag, i) => (
                    <li key={i} className="text-sm text-gray-300">
                      • {flag}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Personality Sections */}
        <div className="space-y-8">
          {PERSONALITY_SECTIONS.map((section) => (
            <div key={section.title} className="bg-gray-800 rounded-xl p-6">
              <h2 className="text-xl font-semibold mb-4 text-purple-300">
                {section.title}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {section.fields.map((field) => {
                  const key = field.key as keyof PersonalityModulation;
                  const value = personality[key];
                  return (
                    <div key={key} className="bg-gray-700/50 rounded-lg p-4">
                      <div className="flex justify-between mb-2">
                        <span className="font-medium">{field.label}</span>
                        <span className="text-purple-400">
                          {Math.round(value * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={value * 100}
                        onChange={(e) =>
                          handleSliderChange(key, Number(e.target.value) / 100)
                        }
                        className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-purple-500"
                      />
                      <div className="text-xs text-gray-400 mt-1">
                        {field.desc}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Quick Stats */}
        <div className="mt-8 bg-gray-800 rounded-xl p-6">
          <h2 className="text-xl font-semibold mb-4">Quick Overview</h2>
          <div className="grid grid-cols-5 gap-4">
            <div className="text-center">
              <div className="text-3xl mb-1">
                {Math.round(
                  ((personality.warmth +
                    personality.empathy +
                    personality.compassion) /
                    3) *
                    100
                )}
                %
              </div>
              <div className="text-sm text-gray-400">Warmth Score</div>
            </div>
            <div className="text-center">
              <div className="text-3xl mb-1">
                {Math.round(
                  ((personality.curiosity +
                    personality.creativity +
                    personality.depth) /
                    3) *
                    100
                )}
                %
              </div>
              <div className="text-sm text-gray-400">Intellect Score</div>
            </div>
            <div className="text-center">
              <div className="text-3xl mb-1">
                {Math.round(
                  ((personality.resilience +
                    personality.optimism +
                    (1 - personality.anxiety)) /
                    3) *
                    100
                )}
                %
              </div>
              <div className="text-sm text-gray-400">Stability Score</div>
            </div>
            <div className="text-center">
              <div className="text-3xl mb-1">
                {Math.round(
                  ((personality.loyalty +
                    personality.commitment +
                    personality.protectiveness) /
                    3) *
                    100
                )}
                %
              </div>
              <div className="text-sm text-gray-400">Family Bond</div>
            </div>
            <div className="text-center">
              <div className="text-3xl mb-1">
                {Math.round(
                  ((personality.integrity +
                    personality.justice +
                    personality.transparency) /
                    3) *
                    100
                )}
                %
              </div>
              <div className="text-sm text-gray-400">Ethics Score</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
