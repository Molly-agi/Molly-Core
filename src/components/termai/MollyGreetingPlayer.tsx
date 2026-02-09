'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Play, Pause, Volume2, VolumeX, Download } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';

type MollyGreetingPlayerProps = {
  variant?: 'inline' | 'floating';
};

export function MollyGreetingPlayer({
  variant = 'inline',
}: MollyGreetingPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const lastVolumeRef = useRef(volume);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.volume = isMuted ? 0 : volume;

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
    };

    const handlePlay = () => {
      setIsPlaying(true);
    };

    const handlePause = () => {
      setIsPlaying(false);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
    };
  }, [volume, isMuted]);

  const togglePlayPause = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
  };

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progressPercent = duration ? (currentTime / duration) * 100 : 0;

  const isFloating = variant === 'floating';

  return (
    <Card
      className={
        isFloating
          ? 'w-[360px] max-w-[90vw] p-4 shadow-xl border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(168,85,247,0.18),_rgba(14,17,24,0.92))] backdrop-blur-md text-white'
          : 'p-6 bg-gradient-to-br from-purple-500/10 to-pink-500/10 border-purple-200 dark:border-purple-800'
      }
    >
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center h-11 w-11 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 shadow-lg">
          <Volume2 className="h-5 w-5 text-white" />
        </div>

        <div className="flex-1 min-w-0">
          <h3
            className={
              isFloating
                ? 'text-sm font-semibold'
                : 'text-sm font-semibold text-gray-900 dark:text-white'
            }
          >
            Molly's Greeting
          </h3>
          <p
            className={
              isFloating
                ? 'text-[11px] text-white/70 mt-0.5'
                : 'text-xs text-gray-600 dark:text-gray-400 mt-0.5'
            }
          >
            Introductory voice message
          </p>
        </div>

        <Button
          size="sm"
          variant={isFloating ? 'secondary' : 'outline'}
          onClick={togglePlayPause}
          className={
            isFloating
              ? 'h-9 w-9 p-0 rounded-full bg-white/10 hover:bg-white/20'
              : 'h-10 w-10 p-0 rounded-full'
          }
        >
          {isPlaying ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4 ml-0.5" />
          )}
        </Button>
      </div>

      <div className="mt-4 space-y-2">
        <div
          className={
            isFloating
              ? 'h-1.5 bg-white/10 rounded-full overflow-hidden cursor-pointer'
              : 'h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden cursor-pointer'
          }
          onClick={(e) => {
            if (!audioRef.current || !duration) return;
            const rect = (
              e.currentTarget as HTMLElement
            ).getBoundingClientRect();
            const percent = (e.clientX - rect.left) / rect.width;
            audioRef.current.currentTime = percent * duration;
          }}
        >
          <div
            className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div
          className={
            isFloating
              ? 'flex justify-between text-[11px] text-white/60'
              : 'flex justify-between text-xs text-gray-500 dark:text-gray-400'
          }
        >
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button
          size="icon"
          variant={isFloating ? 'secondary' : 'outline'}
          onClick={() => {
            if (isMuted) {
              const nextVolume = lastVolumeRef.current || 0.8;
              setVolume(nextVolume);
              setIsMuted(false);
            } else {
              lastVolumeRef.current = volume;
              setIsMuted(true);
            }
          }}
          className={
            isFloating ? 'h-8 w-8 bg-white/10 hover:bg-white/20' : 'h-8 w-8'
          }
        >
          {isMuted || volume === 0 ? (
            <VolumeX className="h-4 w-4" />
          ) : (
            <Volume2 className="h-4 w-4" />
          )}
        </Button>

        <div className="flex-1">
          <Slider
            value={[isMuted ? 0 : volume * 100]}
            max={100}
            step={1}
            onValueChange={(value) => {
              const nextVolume = (value?.[0] ?? 0) / 100;
              lastVolumeRef.current = nextVolume;
              setVolume(nextVolume);
              setIsMuted(nextVolume === 0);
            }}
          />
        </div>

        <Button
          size="icon"
          variant={isFloating ? 'secondary' : 'outline'}
          className={
            isFloating ? 'h-8 w-8 bg-white/10 hover:bg-white/20' : 'h-8 w-8'
          }
          asChild
        >
          <a
            href="/molly_greeting.wav"
            download
            aria-label="Download Molly greeting"
          >
            <Download className="h-4 w-4" />
          </a>
        </Button>
      </div>

      <audio ref={audioRef} src="/molly_greeting.wav" preload="metadata" />
    </Card>
  );
}
