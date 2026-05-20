'use client';
import dynamic from 'next/dynamic';
import { SidebarTrigger } from '@/components/ui/sidebar';
import type { VoiceCommandResult } from './VoiceControl';
import { useAuth, useUser } from '@/firebase';
import { signOut } from 'firebase/auth';
import { useRef, useState, type MutableRefObject } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { MOLLY_AVATAR_URL } from '@/lib/memory-anchors';
import { Button } from '../ui/button';
import { Clapperboard, Flower2, Sparkles } from 'lucide-react';
import { SystemHealthDot } from './SystemHealthDot';
import { KillSwitch } from './KillSwitch';
import { VoiceSelector } from './VoiceSelector';

const VoiceControl = dynamic(
  () => import('./VoiceControl').then((mod) => mod.VoiceControl),
  { ssr: false }
);

const OriginStoryDialog = dynamic(
  () => import('./OriginStoryDialog').then((mod) => mod.OriginStoryDialog),
  { ssr: false }
);

export function Header({
  onVoiceCommand,
  onAdminUnlock,
  lastResponseRef,
  hardwareState,
}: {
  onVoiceCommand: (result: VoiceCommandResult) => void;
  onAdminUnlock: () => void;
  lastResponseRef: MutableRefObject<string | null>;
  hardwareState: {
    temperature: number;
    batteryLevel: number;
    cpuUsage: number;
  };
}) {
  const { user } = useUser();
  const auth = useAuth();
  const [unlockCount, setUnlockCount] = useState(0);
  const resetTimer = useRef<NodeJS.Timeout | null>(null);

  const handleSignOut = async () => {
    if (auth) {
      await signOut(auth);
    }
  };

  const getInitials = (name?: string | null) => {
    if (!name) return '';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('');
  };

  const handleSecretTap = () => {
    const nextCount = unlockCount + 1;
    setUnlockCount(nextCount);

    if (resetTimer.current) {
      clearTimeout(resetTimer.current);
    }

    resetTimer.current = setTimeout(() => {
      setUnlockCount(0);
    }, 2500);

    if (nextCount >= 7) {
      setUnlockCount(0);
      onAdminUnlock();
    }
  };

  return (
    <header className="flex h-14 items-center gap-4 border-b bg-background px-4 lg:h-[60px] lg:px-6">
      <SidebarTrigger />
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <Avatar className="h-7 w-7 border border-primary/20">
            <AvatarImage src={MOLLY_AVATAR_URL} alt="Molly avatar" />
            <AvatarFallback>M</AvatarFallback>
          </Avatar>
          <h1 className="font-semibold text-lg">Molly</h1>
          <SystemHealthDot />
          <Button
            variant="ghost"
            size="icon"
            onClick={handleSecretTap}
            className="h-6 w-6 text-muted-foreground/50 hover:text-foreground"
            title=""
          >
            <Flower2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={() =>
          window.open(
            '/avatar',
            'molly-avatar',
            'width=820,height=960,resizable=yes,scrollbars=no'
          )
        }
        title="Open Molly Avatar"
        className="h-8 w-8 text-muted-foreground hover:text-foreground"
      >
        <Sparkles className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() =>
          window.open(
            '/personality-video',
            'molly-personality-video',
            'width=860,height=960,resizable=yes,scrollbars=yes'
          )
        }
        title="Open Personality Video"
        className="h-8 w-8 text-muted-foreground hover:text-foreground"
      >
        <Clapperboard className="h-4 w-4" />
      </Button>
      <KillSwitch />
      <VoiceSelector />
      <OriginStoryDialog />
      <VoiceControl
        onVoiceCommand={onVoiceCommand}
        lastResponseRef={lastResponseRef}
        hardwareState={hardwareState}
      />
      {user && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-8 w-8 rounded-full">
              <Avatar className="h-8 w-8">
                <AvatarImage
                  src={user.photoURL ?? ''}
                  alt={user.displayName ?? ''}
                />
                <AvatarFallback>{getInitials(user.displayName)}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">
                  {user.displayName}
                </p>
                <p className="text-xs leading-none text-muted-foreground">
                  {user.email}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut}>Log out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </header>
  );
}
