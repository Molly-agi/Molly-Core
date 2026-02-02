'use client';
import { TerminalSquare, User } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '../ui/button';

export function Header() {
  return (
    <header className="flex h-14 items-center gap-4 border-b bg-card px-4 lg:h-[60px] lg:px-6">
      <div className="flex items-center gap-2 font-semibold">
        <TerminalSquare className="h-6 w-6 text-primary" />
        <span className="font-headline text-lg">TermAI</span>
      </div>
      <div className="ml-auto flex items-center gap-4">
        <Button variant="ghost" size="icon" className="rounded-full">
            <Avatar>
            <AvatarFallback>
                <User />
            </AvatarFallback>
            </Avatar>
            <span className="sr-only">Toggle user menu</span>
        </Button>
      </div>
    </header>
  );
}
