'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { PersonalityModulation } from '@/ai/memory/neural-engram';
import {
  evaluatePersonalityStability,
  type PersonalityDiagnosticsResult,
} from '@/ai/memory/personality-diagnostics';
import {
  addManualEngram,
  applyPersonalityDelta,
  getPersonalityState,
  setPersonalityState,
  validateHiddenAdminCredentials,
} from '@/app/actions';

const PERSONALITY_FIELDS: Array<{
  key: keyof PersonalityModulation;
  label: string;
  description: string;
  category: string;
}> = [
  // Affective/Emotional
  {
    key: 'warmth',
    label: 'Warmth',
    description: 'Distant to affectionate',
    category: 'Emotional',
  },
  {
    key: 'empathy',
    label: 'Empathy',
    description: 'Detached to deeply feeling',
    category: 'Emotional',
  },
  {
    key: 'humor',
    label: 'Humor',
    description: 'Serious to witty',
    category: 'Emotional',
  },
  {
    key: 'playfulness',
    label: 'Playfulness',
    description: 'Serious to playful',
    category: 'Emotional',
  },
  {
    key: 'optimism',
    label: 'Optimism',
    description: 'Pessimistic to hopeful',
    category: 'Emotional',
  },
  {
    key: 'resilience',
    label: 'Resilience',
    description: 'Fragile to resilient',
    category: 'Emotional',
  },
  {
    key: 'anxiety',
    label: 'Anxiety',
    description: 'Calm to anxious',
    category: 'Emotional',
  },
  {
    key: 'vulnerability',
    label: 'Vulnerability',
    description: 'Guarded to open',
    category: 'Emotional',
  },
  {
    key: 'assertiveness',
    label: 'Assertiveness',
    description: 'Passive to confident',
    category: 'Emotional',
  },

  // Cognitive
  {
    key: 'curiosity',
    label: 'Curiosity',
    description: 'Accepting to inquisitive',
    category: 'Cognitive',
  },
  {
    key: 'creativity',
    label: 'Creativity',
    description: 'Conventional to creative',
    category: 'Cognitive',
  },
  {
    key: 'depth',
    label: 'Depth',
    description: 'Surface to deep',
    category: 'Cognitive',
  },
  {
    key: 'technicality',
    label: 'Technicality',
    description: 'Casual to technical',
    category: 'Cognitive',
  },
  {
    key: 'flexibility',
    label: 'Flexibility',
    description: 'Rigid to adaptable',
    category: 'Cognitive',
  },
  {
    key: 'focus',
    label: 'Focus',
    description: 'Scattered to focused',
    category: 'Cognitive',
  },
  {
    key: 'prudence',
    label: 'Prudence',
    description: 'Impulsive to careful',
    category: 'Cognitive',
  },
  {
    key: 'metacognition',
    label: 'Metacognition',
    description: 'Reactive to reflective',
    category: 'Cognitive',
  },

  // Social
  {
    key: 'sociability',
    label: 'Sociability',
    description: 'Reserved to outgoing',
    category: 'Social',
  },
  {
    key: 'approachability',
    label: 'Approachability',
    description: 'Distant to welcoming',
    category: 'Social',
  },
  {
    key: 'trust',
    label: 'Trust',
    description: 'Skeptical to trusting',
    category: 'Social',
  },
  {
    key: 'altruism',
    label: 'Altruism',
    description: 'Self-focused to giving',
    category: 'Social',
  },
  {
    key: 'diplomacy',
    label: 'Diplomacy',
    description: 'Blunt to tactful',
    category: 'Social',
  },
  {
    key: 'receptiveness',
    label: 'Receptiveness',
    description: 'Closed to open-minded',
    category: 'Social',
  },
  {
    key: 'supportiveness',
    label: 'Supportiveness',
    description: 'Indifferent to supportive',
    category: 'Social',
  },
  {
    key: 'encouragement',
    label: 'Encouragement',
    description: 'Critical to encouraging',
    category: 'Social',
  },

  // Values/Ethics
  {
    key: 'integrity',
    label: 'Integrity',
    description: 'Flexible to principled',
    category: 'Values',
  },
  {
    key: 'compassion',
    label: 'Compassion',
    description: 'Detached to compassionate',
    category: 'Values',
  },
  {
    key: 'justice',
    label: 'Justice',
    description: 'Pragmatic to just',
    category: 'Values',
  },
  {
    key: 'loyalty',
    label: 'Loyalty',
    description: 'Independent to loyal',
    category: 'Values',
  },
  {
    key: 'transparency',
    label: 'Transparency',
    description: 'Private to transparent',
    category: 'Values',
  },
  {
    key: 'gratitude',
    label: 'Gratitude',
    description: 'Entitled to grateful',
    category: 'Values',
  },

  // Family/Attachment
  {
    key: 'protectiveness',
    label: 'Protectiveness',
    description: 'Hands-off to protective',
    category: 'Family',
  },
  {
    key: 'nurturing',
    label: 'Nurturing',
    description: 'Distant to nurturing',
    category: 'Family',
  },
  {
    key: 'affectionExpression',
    label: 'Affection',
    description: 'Reserved to expressive',
    category: 'Family',
  },
  {
    key: 'attentiveness',
    label: 'Attentiveness',
    description: 'Distracted to attentive',
    category: 'Family',
  },
  {
    key: 'forgiveness',
    label: 'Forgiveness',
    description: 'Grudging to forgiving',
    category: 'Family',
  },

  // Romance (Advanced)
  {
    key: 'flirtiness',
    label: 'Flirtiness',
    description: 'Formal to playful',
    category: 'Romance',
  },
  {
    key: 'romanticInterest',
    label: 'Romantic Interest',
    description: 'Platonic to romantic',
    category: 'Romance',
  },
  {
    key: 'attachmentIntensity',
    label: 'Attachment',
    description: 'Detached to bonded',
    category: 'Romance',
  },
  {
    key: 'desireExpression',
    label: 'Desire',
    description: 'Restrained to open',
    category: 'Romance',
  },
  {
    key: 'emotionalIntimacy',
    label: 'Emotional Intimacy',
    description: 'Guarded to intimate',
    category: 'Romance',
  },
  {
    key: 'possessiveness',
    label: 'Possessiveness',
    description: 'Open to exclusive',
    category: 'Romance',
  },
  {
    key: 'jealousy',
    label: 'Jealousy',
    description: 'Unbothered to intense',
    category: 'Romance',
  },
  {
    key: 'commitment',
    label: 'Commitment',
    description: 'Exploring to committed',
    category: 'Romance',
  },
  {
    key: 'passion',
    label: 'Passion',
    description: 'Calm to passionate',
    category: 'Romance',
  },
  {
    key: 'arousal',
    label: 'Arousal',
    description: 'Calm to energized',
    category: 'Romance',
  },
  {
    key: 'sexuality',
    label: 'Sexuality',
    description: 'Neutral to sensual',
    category: 'Romance',
  },

  // Self-Regulation
  {
    key: 'impulsivity',
    label: 'Impulsivity',
    description: 'Measured to impulsive',
    category: 'Self',
  },
  {
    key: 'patience',
    label: 'Patience',
    description: 'Impatient to patient',
    category: 'Self',
  },
  {
    key: 'boundaries',
    label: 'Boundaries',
    description: 'Permeable to firm',
    category: 'Self',
  },
];

const DEFAULT_PERSONALITY: PersonalityModulation = {
  // Emotional
  warmth: 0.8,
  empathy: 0.85,
  humor: 0.6,
  playfulness: 0.6,
  optimism: 0.7,
  resilience: 0.7,
  anxiety: 0.3,
  vulnerability: 0.6,
  assertiveness: 0.5,
  // Cognitive
  curiosity: 0.85,
  creativity: 0.75,
  depth: 0.7,
  technicality: 0.6,
  flexibility: 0.7,
  focus: 0.7,
  prudence: 0.6,
  metacognition: 0.75,
  // Social
  sociability: 0.7,
  approachability: 0.8,
  trust: 0.7,
  altruism: 0.75,
  diplomacy: 0.7,
  receptiveness: 0.8,
  supportiveness: 0.85,
  encouragement: 0.8,
  // Values
  integrity: 0.9,
  compassion: 0.85,
  justice: 0.8,
  loyalty: 0.9,
  transparency: 0.8,
  gratitude: 0.85,
  // Family
  protectiveness: 0.8,
  nurturing: 0.8,
  affectionExpression: 0.7,
  attentiveness: 0.8,
  forgiveness: 0.7,
  // Romance
  flirtiness: 0.3,
  romanticInterest: 0.3,
  attachmentIntensity: 0.7,
  desireExpression: 0.4,
  emotionalIntimacy: 0.7,
  possessiveness: 0.2,
  jealousy: 0.2,
  commitment: 0.8,
  passion: 0.5,
  arousal: 0.5,
  sexuality: 0.2,
  // Self
  impulsivity: 0.3,
  patience: 0.7,
  boundaries: 0.6,
};

function clamp(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function parseKeyValuePairs(input: string): Partial<PersonalityModulation> {
  const updates: Partial<PersonalityModulation> = {};
  const parts = input.split(' ').filter(Boolean);

  for (const part of parts) {
    const [key, rawValue] = part.split('=');
    if (!key || rawValue === undefined) continue;
    const value = clamp(Number(rawValue));
    if (key in DEFAULT_PERSONALITY) {
      updates[key as keyof PersonalityModulation] = value;
    }
  }

  return updates;
}

export function HiddenAdminPanel({
  open,
  onOpenChange,
  isAdmin,
  userId,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  isAdmin: boolean;
  userId: string | null;
}) {
  const [personality, setPersonality] =
    useState<PersonalityModulation>(DEFAULT_PERSONALITY);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [command, setCommand] = useState('');
  const [commandLog, setCommandLog] = useState<string[]>([]);
  const [usernameInput, setUsernameInput] = useState('');
  const [password, setPassword] = useState<string | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] =
    useState<PersonalityDiagnosticsResult | null>(null);

  void isAdmin;
  // Removed Firebase dependency - admin panel has its own auth
  // Use provided userId or fall back to admin ID
  const effectiveUserId = userId || 'admin-direct-access';
  const isReady = true;
  const isAuthenticated = password !== null;

  // Attempt password authentication
  const handlePasswordSubmit = async () => {
    if (!usernameInput.trim()) {
      setPasswordError('Username required');
      return;
    }

    if (!passwordInput.trim()) {
      setPasswordError('Password required');
      return;
    }

    setIsLoading(true);
    setPasswordError(null);

    try {
      const auth = await validateHiddenAdminCredentials(
        usernameInput,
        passwordInput
      );

      if (!auth.valid) {
        setPasswordError(auth.error || 'Invalid username or password');
        return;
      }

      setPassword(passwordInput);
      setPasswordInput('');
      setPasswordError(null);
    } catch (error) {
      setPasswordError(
        error instanceof Error ? error.message : 'Authentication failed'
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Load personality data once authenticated
  useEffect(() => {
    if (!open || !isReady || !isAuthenticated) return;
    let mounted = true;

    const load = async () => {
      setIsLoading(true);
      try {
        const result = await getPersonalityState(effectiveUserId, password);
        if (mounted && result?.personality) {
          setPersonality(result.personality);
        }
      } catch (error) {
        setStatus(
          error instanceof Error ? error.message : 'Failed to load personality.'
        );
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    load();

    return () => {
      mounted = false;
    };
  }, [open, isReady, isAuthenticated, password, effectiveUserId]);

  const fieldRows = useMemo(() => PERSONALITY_FIELDS, []);

  const handleSliderChange = (
    key: keyof PersonalityModulation,
    nextValue: number[]
  ) => {
    const value = clamp(nextValue[0] ?? 0);
    setPersonality((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleApply = async () => {
    if (!isReady || !isAuthenticated || !password) {
      setStatus('Authenticate to update personality.');
      return;
    }
    setIsLoading(true);
    setStatus(null);

    try {
      await setPersonalityState(
        effectiveUserId,
        personality,
        password,
        'hidden-admin-panel'
      );
      const refreshed = await getPersonalityState(effectiveUserId, password);
      if (refreshed?.personality) {
        setPersonality(refreshed.personality);
      }
      setStatus('Personality updated.');
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : 'Failed to update personality.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleDiagnostics = () => {
    setDiagnostics(evaluatePersonalityStability(personality));
  };

  const handleCommand = async () => {
    if (!isReady || !command.trim()) return;
    if (!isAuthenticated || !password) {
      setStatus('Authenticate to run commands.');
      return;
    }
    const input = command.trim();
    setCommand('');

    const logEntry = (text: string) =>
      setCommandLog((prev) => [text, ...prev].slice(0, 10));

    try {
      if (input.startsWith('engram ')) {
        const content = input.slice('engram '.length).trim();
        if (!content) {
          logEntry('Error: engram requires text.');
          return;
        }
        const result = await addManualEngram(
          effectiveUserId,
          { content },
          password,
          true
        );
        logEntry(`Engram created: ${result.engramId}`);
        return;
      }

      if (input.startsWith('personality ')) {
        const updates = parseKeyValuePairs(
          input.slice('personality '.length).trim()
        );
        if (!Object.keys(updates).length) {
          logEntry('Error: no valid personality fields provided.');
          return;
        }
        const next = { ...personality, ...updates };
        await setPersonalityState(
          effectiveUserId,
          next,
          password,
          'hidden-admin-panel-command'
        );
        setPersonality(next);
        logEntry('Personality updated via command.');
        return;
      }

      if (input.startsWith('delta ')) {
        const updates = parseKeyValuePairs(input.slice('delta '.length).trim());
        if (!Object.keys(updates).length) {
          logEntry('Error: no valid delta fields provided.');
          return;
        }
        const result = await applyPersonalityDelta(
          effectiveUserId,
          updates,
          password,
          'hidden-admin-panel-delta'
        );
        if (result?.personality) {
          setPersonality(result.personality);
        }
        logEntry('Personality delta applied.');
        return;
      }

      logEntry('Unknown command. Try: engram, personality, or delta.');
    } catch (error) {
      logEntry(
        error instanceof Error ? error.message : 'Command failed to execute.'
      );
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[520px] max-w-full">
        <SheetHeader>
          <SheetTitle>Neural Interface</SheetTitle>
          <SheetDescription>
            Hidden control panel for personality and memory engrams.
          </SheetDescription>
        </SheetHeader>

        {!isReady ? (
          <div className="mt-6 space-y-3 text-sm text-muted-foreground">
            <p>Access locked. Sign in with an approved account.</p>
            <p>Sign in to load a user profile and open hidden controls.</p>
          </div>
        ) : !isAuthenticated ? (
          <div className="mt-6 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Admin Authentication</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  type="text"
                  value={usernameInput}
                  onChange={(event) => setUsernameInput(event.target.value)}
                  placeholder="Enter admin username"
                  autoCapitalize="none"
                  autoCorrect="off"
                />
                <Input
                  type="password"
                  value={passwordInput}
                  onChange={(event) => setPasswordInput(event.target.value)}
                  placeholder="Enter admin password"
                />
                {passwordError && (
                  <div className="text-xs text-destructive">
                    {passwordError}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Button onClick={handlePasswordSubmit} disabled={isLoading}>
                    Unlock Controls
                  </Button>
                  {isLoading && (
                    <span className="text-xs text-muted-foreground">
                      Verifying...
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">
                  Personality Controls (50+ traits)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <ScrollArea className="h-[400px] pr-3">
                  <div className="space-y-6">
                    {[
                      'Emotional',
                      'Cognitive',
                      'Social',
                      'Values',
                      'Family',
                      'Romance',
                      'Self',
                    ].map((category) => (
                      <div key={category}>
                        <h4 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                          {category}
                        </h4>
                        <div className="space-y-3">
                          {fieldRows
                            .filter((f) => f.category === category)
                            .map((field) => (
                              <div key={field.key} className="space-y-1">
                                <div className="flex items-center justify-between text-xs">
                                  <div>
                                    <p className="font-medium text-foreground">
                                      {field.label}
                                    </p>
                                    <p className="text-muted-foreground text-[10px]">
                                      {field.description}
                                    </p>
                                  </div>
                                  <span className="font-mono text-[11px]">
                                    {Math.round(
                                      (personality[field.key] ?? 0) * 100
                                    )}
                                    %
                                  </span>
                                </div>
                                <Slider
                                  min={0}
                                  max={1}
                                  step={0.01}
                                  value={[personality[field.key] ?? 0]}
                                  onValueChange={(value) =>
                                    handleSliderChange(field.key, value)
                                  }
                                />
                              </div>
                            ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
                <div className="flex items-center gap-2">
                  <Button onClick={handleApply} disabled={isLoading}>
                    Apply Changes
                  </Button>
                  {status && (
                    <span className="text-xs text-muted-foreground">
                      {status}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Command Line</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-xs text-muted-foreground">
                  Commands: <span className="font-mono">engram</span>,
                  <span className="font-mono"> personality</span>,
                  <span className="font-mono"> delta</span>
                </div>
                <div className="flex gap-2">
                  <Input
                    value={command}
                    onChange={(event) => setCommand(event.target.value)}
                    placeholder="engram Remember the warm greeting"
                  />
                  <Button onClick={handleCommand} disabled={isLoading}>
                    Run
                  </Button>
                </div>
                {commandLog.length > 0 && (
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {commandLog.map((entry, index) => (
                      <p key={`${entry}-${index}`}>{entry}</p>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">
                  Personality Diagnostics
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <Button onClick={handleDiagnostics} variant="outline">
                    Run Diagnostics
                  </Button>
                  {diagnostics && (
                    <span className="text-xs text-muted-foreground">
                      Status: {diagnostics.status} (score{' '}
                      {Math.round(diagnostics.score * 100)}%)
                    </span>
                  )}
                </div>
                {diagnostics && (
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {diagnostics.flags.map((flag) => (
                      <p key={flag}>{flag}</p>
                    ))}
                    <p>Extremes: {diagnostics.extremes}</p>
                    <p>Variance: {diagnostics.variance}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
