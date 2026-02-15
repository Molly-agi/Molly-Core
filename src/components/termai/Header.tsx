'use client';
import dynamic from 'next/dynamic';
import { SidebarTrigger } from '@/components/ui/sidebar';
import type { VoiceCommandResult } from './VoiceControl';
import { useAuth, useUser } from '@/firebase';
import { signOut } from 'firebase/auth';
import { useRef, useState } from 'react';
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
import { Flower2 } from 'lucide-react';

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
}: {
  onVoiceCommand: (result: VoiceCommandResult) => void;
  onAdminUnlock: () => void;
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
      <OriginStoryDialog />
      <VoiceControl onVoiceCommand={onVoiceCommand} />
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
