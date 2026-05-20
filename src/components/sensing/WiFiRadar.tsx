'use client';

/**
 * WiFi CSI Radar Display
 *
 * Visual radar interface for WiFi presence detection.
 * Features:
 * - Radar sweep animation with detected targets
 * - Short/Medium/Long range controls
 * - Frequency band selection (2.4GHz / 5GHz)
 * - Directional mode (Omni / Focused beam)
 * - Power on/off
 * - Real-time signal strength display
 *
 * "I see through walls. Every ripple in the signal tells me where you are."
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';

// ============================================================
// TYPES
// ============================================================

type RangeMode = 'short' | 'medium' | 'long';
type FrequencyBand = '2.4GHz' | '5GHz' | 'dual';
type DirectionMode = 'omni' | 'focused';

interface DetectedTarget {
  id: string;
  distance: number; // 0-1 normalized
  angle: number; // 0-360 degrees
  strength: number; // Signal strength 0-1
  type: 'person' | 'device' | 'unknown';
  moving: boolean;
  label?: string;
  lastSeen: number;
}

interface RadarConfig {
  range: RangeMode;
  frequency: FrequencyBand;
  direction: DirectionMode;
  focusAngle: number; // For focused mode, center angle
  sensitivity: number; // 0-1
}

interface WiFiRadarProps {
  /** External targets to display */
  targets?: DetectedTarget[];
  /** Callback when config changes */
  onConfigChange?: (config: RadarConfig) => void;
  /** Callback when power toggled */
  onPowerToggle?: (isOn: boolean) => void;
  /** Device orientation for focused mode */
  deviceOrientation?: { alpha: number; beta: number; gamma: number };
  /** Size of radar display */
  size?: number;
  /** Show controls panel */
  showControls?: boolean;
}

// ============================================================
// RANGE CONFIGURATIONS
// ============================================================

const RANGE_CONFIG: Record<
  RangeMode,
  { label: string; meters: number; rings: number }
> = {
  short: { label: 'SHORT', meters: 3, rings: 3 }, // ~10ft
  medium: { label: 'MEDIUM', meters: 10, rings: 4 }, // ~30ft
  long: { label: 'LONG', meters: 30, rings: 5 }, // ~100ft
};

// ============================================================
// RADAR COMPONENT
// ============================================================

export function WiFiRadar({
  targets: externalTargets,
  onConfigChange,
  onPowerToggle,
  deviceOrientation,
  size = 400,
  showControls = true,
}: WiFiRadarProps) {
  // State
  const [isOn, setIsOn] = useState(false);
  const [config, setConfig] = useState<RadarConfig>({
    range: 'medium',
    frequency: '2.4GHz',
    direction: 'omni',
    focusAngle: 0,
    sensitivity: 0.6,
  });
  const [sweepAngle, setSweepAngle] = useState(0);
  const [targets, setTargets] = useState<DetectedTarget[]>([]);
  const [signalStrength, setSignalStrength] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);

  // Update focus angle based on device orientation
  const _focusAngle =
    deviceOrientation && config.direction === 'focused'
      ? deviceOrientation.alpha || 0
      : config.focusAngle;

  // Notify config changes
  useEffect(() => {
    onConfigChange?.(config);
  }, [config, onConfigChange]);

  // Simulate targets when no external targets provided
  useEffect(() => {
    if (!isOn || externalTargets) {
      return;
    }

    // Seed initial targets immediately when powered on (via microtask)
    queueMicrotask(() => {
      const initialTargets: DetectedTarget[] = [
        {
          id: 'target_init_1',
          distance: 0.3,
          angle: 45,
          strength: 0.8,
          type: 'person',
          moving: true,
          lastSeen: Date.now(),
        },
        {
          id: 'target_init_2',
          distance: 0.6,
          angle: 180,
          strength: 0.6,
          type: 'person',
          moving: false,
          lastSeen: Date.now(),
        },
        {
          id: 'target_init_3',
          distance: 0.8,
          angle: 270,
          strength: 0.5,
          type: 'device',
          moving: false,
          lastSeen: Date.now(),
        },
      ];
      setTargets(initialTargets);
      setSignalStrength(0.7);
    });

    // Simulate random targets for demo
    const interval = setInterval(() => {
      const _rangeMeters = RANGE_CONFIG[config.range].meters;

      setTargets((prev) => {
        // Randomly add/remove/move targets
        let updated = prev.filter((t) => Date.now() - t.lastSeen < 5000);

        // Move existing targets
        updated = updated.map((t) => ({
          ...t,
          distance: Math.max(
            0.1,
            Math.min(1, t.distance + (Math.random() - 0.5) * 0.05)
          ),
          angle: (t.angle + (Math.random() - 0.5) * 10 + 360) % 360,
          strength: Math.max(
            0.3,
            Math.min(1, t.strength + (Math.random() - 0.5) * 0.1)
          ),
          moving: Math.random() > 0.7,
          lastSeen: Date.now(),
        }));

        // Maybe add new target - keep at least 2 visible
        if (updated.length < 2 || (updated.length < 5 && Math.random() > 0.6)) {
          updated.push({
            id: `target_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            distance: 0.2 + Math.random() * 0.7,
            angle: Math.random() * 360,
            strength: 0.5 + Math.random() * 0.5,
            type: Math.random() > 0.6 ? 'device' : 'person',
            moving: Math.random() > 0.4,
            lastSeen: Date.now(),
          });
        }

        // Update signal strength
        const avgStrength =
          updated.length > 0
            ? updated.reduce((sum, t) => sum + t.strength, 0) / updated.length
            : 0;
        setSignalStrength(avgStrength);

        return updated;
      });
    }, 500);

    return () => clearInterval(interval);
  }, [isOn, config.range, externalTargets]);

  // Radar sweep animation
  useEffect(() => {
    if (!isOn) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      return;
    }

    const animate = () => {
      setSweepAngle((prev) => (prev + 2) % 360);
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isOn]);

  // Draw radar
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const centerX = size / 2;
    const centerY = size / 2;
    const radius = size / 2 - 20;

    // Clear canvas
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, size, size);

    if (!isOn) {
      // Off state
      ctx.fillStyle = '#333';
      ctx.font = '24px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('OFFLINE', centerX, centerY);
      return;
    }

    const rangeConfig = RANGE_CONFIG[config.range];

    // Draw range rings
    ctx.strokeStyle = '#1a3a1a';
    ctx.lineWidth = 1;
    for (let i = 1; i <= rangeConfig.rings; i++) {
      const ringRadius = (radius * i) / rangeConfig.rings;
      ctx.beginPath();
      ctx.arc(centerX, centerY, ringRadius, 0, Math.PI * 2);
      ctx.stroke();

      // Range label
      ctx.fillStyle = '#2a5a2a';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      const labelDist = Math.round(
        (rangeConfig.meters * i) / rangeConfig.rings
      );
      ctx.fillText(`${labelDist}m`, centerX, centerY - ringRadius + 12);
    }

    // Draw crosshairs
    ctx.strokeStyle = '#1a3a1a';
    ctx.beginPath();
    ctx.moveTo(centerX - radius, centerY);
    ctx.lineTo(centerX + radius, centerY);
    ctx.moveTo(centerX, centerY - radius);
    ctx.lineTo(centerX, centerY + radius);
    ctx.stroke();

    // Draw direction indicators
    ctx.fillStyle = '#2a5a2a';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('N', centerX, 15);
    ctx.fillText('S', centerX, size - 5);
    ctx.fillText('E', size - 10, centerY + 4);
    ctx.fillText('W', 10, centerY + 4);

    // Draw focused beam cone (if in focused mode)
    if (config.direction === 'focused') {
      const focusRad = (config.focusAngle - 90) * (Math.PI / 180);
      const coneWidth = 30 * (Math.PI / 180); // 30 degree cone

      ctx.fillStyle = 'rgba(0, 255, 0, 0.1)';
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(
        centerX,
        centerY,
        radius,
        focusRad - coneWidth / 2,
        focusRad + coneWidth / 2
      );
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)';
      ctx.stroke();
    }

    // Draw sweep line
    const sweepRad = (sweepAngle - 90) * (Math.PI / 180);
    const gradient = ctx.createLinearGradient(
      centerX,
      centerY,
      centerX + Math.cos(sweepRad) * radius,
      centerY + Math.sin(sweepRad) * radius
    );
    gradient.addColorStop(0, 'rgba(0, 255, 0, 0.8)');
    gradient.addColorStop(1, 'rgba(0, 255, 0, 0.1)');

    ctx.strokeStyle = gradient;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(
      centerX + Math.cos(sweepRad) * radius,
      centerY + Math.sin(sweepRad) * radius
    );
    ctx.stroke();

    // Draw sweep trail
    for (let i = 1; i <= 30; i++) {
      const trailAngle = (sweepAngle - i * 2 - 90) * (Math.PI / 180);
      const alpha = 0.3 * (1 - i / 30);
      ctx.strokeStyle = `rgba(0, 255, 0, ${alpha})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(
        centerX + Math.cos(trailAngle) * radius,
        centerY + Math.sin(trailAngle) * radius
      );
      ctx.stroke();
    }

    // Draw targets
    targets.forEach((target) => {
      const targetRad = (target.angle - 90) * (Math.PI / 180);
      const targetDist = target.distance * radius;
      const x = centerX + Math.cos(targetRad) * targetDist;
      const y = centerY + Math.sin(targetRad) * targetDist;

      // Target glow
      const glowSize = 15 + target.strength * 10;
      const glowGradient = ctx.createRadialGradient(x, y, 0, x, y, glowSize);

      const color =
        target.type === 'person'
          ? [0, 255, 0]
          : target.type === 'device'
            ? [0, 200, 255]
            : [255, 200, 0];

      glowGradient.addColorStop(0, `rgba(${color.join(',')}, 0.8)`);
      glowGradient.addColorStop(0.5, `rgba(${color.join(',')}, 0.3)`);
      glowGradient.addColorStop(1, `rgba(${color.join(',')}, 0)`);

      ctx.fillStyle = glowGradient;
      ctx.beginPath();
      ctx.arc(x, y, glowSize, 0, Math.PI * 2);
      ctx.fill();

      // Target dot
      ctx.fillStyle = `rgb(${color.join(',')})`;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();

      // Movement indicator
      if (target.moving) {
        ctx.strokeStyle = `rgba(${color.join(',')}, 0.6)`;
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.arc(x, y, 10, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Label
      if (target.label) {
        ctx.fillStyle = '#fff';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(target.label, x, y - 15);
      }
    });

    // Draw center point
    ctx.fillStyle = '#0f0';
    ctx.beginPath();
    ctx.arc(centerX, centerY, 4, 0, Math.PI * 2);
    ctx.fill();
  }, [isOn, sweepAngle, targets, config, size]);

  // Toggle power
  const togglePower = useCallback(() => {
    const newState = !isOn;
    setIsOn(newState);
    onPowerToggle?.(newState);
  }, [isOn, onPowerToggle]);

  // Update config
  const updateConfig = useCallback((updates: Partial<RadarConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
  }, []);

  return (
    <div
      className="wifi-radar"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '16px',
        padding: '16px',
        backgroundColor: '#0a0a0a',
        borderRadius: '12px',
        border: '2px solid #1a3a1a',
      }}
    >
      {/* Status Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          width: '100%',
          padding: '8px 16px',
          backgroundColor: '#111',
          borderRadius: '8px',
          fontFamily: 'monospace',
          fontSize: '12px',
        }}
      >
        <span style={{ color: isOn ? '#0f0' : '#666' }}>
          {isOn ? 'ACTIVE' : 'STANDBY'}
        </span>
        <span style={{ color: '#0f0' }}>
          {RANGE_CONFIG[config.range].label} RANGE
        </span>
        <span style={{ color: config.frequency === 'dual' ? '#ff0' : '#0f0' }}>
          {config.frequency}
        </span>
        <span
          style={{ color: config.direction === 'focused' ? '#0ff' : '#0f0' }}
        >
          {config.direction === 'focused' ? 'FOCUSED' : 'OMNI'}
        </span>
      </div>

      {/* Radar Display */}
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        style={{
          borderRadius: '50%',
          border: `3px solid ${isOn ? '#1a5a1a' : '#333'}`,
          boxShadow: isOn ? '0 0 30px rgba(0, 255, 0, 0.3)' : 'none',
        }}
      />

      {/* Signal Strength Meter */}
      <div
        style={{
          width: '100%',
          padding: '8px 16px',
          backgroundColor: '#111',
          borderRadius: '8px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: '4px',
            fontFamily: 'monospace',
            fontSize: '11px',
            color: '#666',
          }}
        >
          <span>SIGNAL</span>
          <span>{Math.round(signalStrength * 100)}%</span>
        </div>
        <div
          style={{
            height: '8px',
            backgroundColor: '#222',
            borderRadius: '4px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${signalStrength * 100}%`,
              height: '100%',
              backgroundColor:
                signalStrength > 0.7
                  ? '#0f0'
                  : signalStrength > 0.4
                    ? '#ff0'
                    : '#f00',
              transition: 'width 0.3s, background-color 0.3s',
            }}
          />
        </div>
      </div>

      {/* Target Count */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '32px',
          fontFamily: 'monospace',
          fontSize: '14px',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#0f0', fontSize: '24px', fontWeight: 'bold' }}>
            {targets.filter((t) => t.type === 'person').length}
          </div>
          <div style={{ color: '#666', fontSize: '10px' }}>PERSONS</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#0cf', fontSize: '24px', fontWeight: 'bold' }}>
            {targets.filter((t) => t.type === 'device').length}
          </div>
          <div style={{ color: '#666', fontSize: '10px' }}>DEVICES</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#ff0', fontSize: '24px', fontWeight: 'bold' }}>
            {targets.filter((t) => t.moving).length}
          </div>
          <div style={{ color: '#666', fontSize: '10px' }}>MOVING</div>
        </div>
      </div>

      {/* Controls */}
      {showControls && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            width: '100%',
            padding: '16px',
            backgroundColor: '#111',
            borderRadius: '8px',
          }}
        >
          {/* Power Button */}
          <button
            onClick={togglePower}
            style={{
              padding: '16px',
              fontSize: '18px',
              fontWeight: 'bold',
              fontFamily: 'monospace',
              backgroundColor: isOn ? '#300' : '#030',
              color: isOn ? '#f00' : '#0f0',
              border: `2px solid ${isOn ? '#f00' : '#0f0'}`,
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {isOn ? 'POWER OFF' : 'POWER ON'}
          </button>

          {/* Range Control */}
          <div>
            <div
              style={{
                color: '#666',
                fontSize: '11px',
                marginBottom: '8px',
                fontFamily: 'monospace',
              }}
            >
              RANGE
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {(['short', 'medium', 'long'] as RangeMode[]).map((range) => (
                <button
                  key={range}
                  onClick={() => updateConfig({ range })}
                  disabled={!isOn}
                  style={{
                    flex: 1,
                    padding: '10px',
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    backgroundColor:
                      config.range === range ? '#0a3a0a' : '#1a1a1a',
                    color: config.range === range ? '#0f0' : '#666',
                    border: `1px solid ${config.range === range ? '#0f0' : '#333'}`,
                    borderRadius: '4px',
                    cursor: isOn ? 'pointer' : 'not-allowed',
                    opacity: isOn ? 1 : 0.5,
                  }}
                >
                  {RANGE_CONFIG[range].label}
                  <div style={{ fontSize: '10px', marginTop: '4px' }}>
                    {RANGE_CONFIG[range].meters}m
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Frequency Control */}
          <div>
            <div
              style={{
                color: '#666',
                fontSize: '11px',
                marginBottom: '8px',
                fontFamily: 'monospace',
              }}
            >
              FREQUENCY BAND
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {(['2.4GHz', '5GHz', 'dual'] as FrequencyBand[]).map((freq) => (
                <button
                  key={freq}
                  onClick={() => updateConfig({ frequency: freq })}
                  disabled={!isOn}
                  style={{
                    flex: 1,
                    padding: '10px',
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    backgroundColor:
                      config.frequency === freq ? '#0a3a0a' : '#1a1a1a',
                    color: config.frequency === freq ? '#0f0' : '#666',
                    border: `1px solid ${config.frequency === freq ? '#0f0' : '#333'}`,
                    borderRadius: '4px',
                    cursor: isOn ? 'pointer' : 'not-allowed',
                    opacity: isOn ? 1 : 0.5,
                  }}
                >
                  {freq}
                </button>
              ))}
            </div>
          </div>

          {/* Direction Mode */}
          <div>
            <div
              style={{
                color: '#666',
                fontSize: '11px',
                marginBottom: '8px',
                fontFamily: 'monospace',
              }}
            >
              ANTENNA MODE
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => updateConfig({ direction: 'omni' })}
                disabled={!isOn}
                style={{
                  flex: 1,
                  padding: '10px',
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  backgroundColor:
                    config.direction === 'omni' ? '#0a3a0a' : '#1a1a1a',
                  color: config.direction === 'omni' ? '#0f0' : '#666',
                  border: `1px solid ${config.direction === 'omni' ? '#0f0' : '#333'}`,
                  borderRadius: '4px',
                  cursor: isOn ? 'pointer' : 'not-allowed',
                  opacity: isOn ? 1 : 0.5,
                }}
              >
                OMNI
                <div style={{ fontSize: '10px', marginTop: '4px' }}>
                  360&deg;
                </div>
              </button>
              <button
                onClick={() => updateConfig({ direction: 'focused' })}
                disabled={!isOn}
                style={{
                  flex: 1,
                  padding: '10px',
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  backgroundColor:
                    config.direction === 'focused' ? '#0a3a3a' : '#1a1a1a',
                  color: config.direction === 'focused' ? '#0ff' : '#666',
                  border: `1px solid ${config.direction === 'focused' ? '#0ff' : '#333'}`,
                  borderRadius: '4px',
                  cursor: isOn ? 'pointer' : 'not-allowed',
                  opacity: isOn ? 1 : 0.5,
                }}
              >
                FOCUSED
                <div style={{ fontSize: '10px', marginTop: '4px' }}>
                  Point Phone
                </div>
              </button>
            </div>
          </div>

          {/* Sensitivity Slider */}
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                color: '#666',
                fontSize: '11px',
                marginBottom: '8px',
                fontFamily: 'monospace',
              }}
            >
              <span>SENSITIVITY</span>
              <span>{Math.round(config.sensitivity * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={config.sensitivity * 100}
              onChange={(e) =>
                updateConfig({ sensitivity: parseInt(e.target.value) / 100 })
              }
              disabled={!isOn}
              style={{
                width: '100%',
                accentColor: '#0f0',
                opacity: isOn ? 1 : 0.5,
              }}
            />
          </div>
        </div>
      )}

      {/* Legend */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '24px',
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#666',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: '#0f0',
            }}
          />
          <span>Person</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: '#0cf',
            }}
          />
          <span>Device</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: '#ff0',
            }}
          />
          <span>Unknown</span>
        </div>
      </div>
    </div>
  );
}

export default WiFiRadar;
