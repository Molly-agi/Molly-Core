'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AIGuidance } from './AIGuidance';
import { VisionaryCoachTab } from './VisionaryCoachTab';
import { MemoryViewer } from './MemoryViewer';
import { Search, HeartPulse, BrainCircuit } from 'lucide-react';

export function TermAISidebar() {
  return (
    <div className="flex flex-col h-full bg-sidebar">
      <Tabs defaultValue="research" className="flex-1 flex flex-col">
        <TabsList className="grid grid-cols-3 bg-sidebar-accent/50 rounded-none h-12">
          <TabsTrigger value="research" className="gap-2 data-[state=active]:bg-background px-1">
            <Search className="size-3" />
            <span className="hidden lg:inline text-[10px]">Research</span>
          </TabsTrigger>
          <TabsTrigger value="partner" className="gap-2 data-[state=active]:bg-background px-1">
            <HeartPulse className="size-3" />
            <span className="hidden lg:inline text-[10px]">Partner</span>
          </TabsTrigger>
          <TabsTrigger value="memory" className="gap-2 data-[state=active]:bg-background px-1">
            <BrainCircuit className="size-3" />
            <span className="hidden lg:inline text-[10px]">Memory</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="research" className="flex-1 m-0 overflow-hidden">
          <AIGuidance />
        </TabsContent>
        <TabsContent value="partner" className="flex-1 m-0 overflow-hidden">
          <VisionaryCoachTab />
        </TabsContent>
        <TabsContent value="memory" className="flex-1 m-0 overflow-hidden">
          <MemoryViewer />
        </TabsContent>
      </Tabs>
    </div>
  );
}
