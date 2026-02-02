'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';

export default function Terminal() {
  const [history, setHistory] = useState<string[]>([]);
  const [command, setCommand] = useState('');

  const handleCommand = (e: React.FormEvent) => {
    e.preventDefault();
    setHistory([...history, `> ${command}`, `(AI response for: ${command})`]);
    setCommand('');
  };

  return (
    <div className="font-code text-sm">
      <div className="p-4 bg-card rounded-lg h-[calc(100vh-150px)] overflow-y-auto">
        <div className="mb-4">
          Welcome to TermAI. Your AI-powered terminal assistant.
        </div>
        {history.map((line, index) => (
          <div key={index} className={line.startsWith('>') ? 'text-primary' : ''}>
            {line}
          </div>
        ))}
      </div>
      <form onSubmit={handleCommand}>
        <Input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="Type a command or ask a question..."
          className="mt-4 w-full bg-card border-border font-code"
          autoFocus
        />
      </form>
    </div>
  );
}
