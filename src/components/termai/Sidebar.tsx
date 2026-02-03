'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AIGuidance } from './AIGuidance';
import { VisionaryCoachTab } from './VisionaryCoachTab';
import { Search, HeartPulse } from 'lucide-react';

export function TermAISidebar() {
  return (
    <div className="flex flex-col h-full bg-sidebar">
      <Tabs defaultValue="research" className="flex-1 flex flex-col">
        <TabsList className="grid grid-cols-2 bg-sidebar-accent/50 rounded-none h-12">
          <TabsTrigger value="research" className="gap-2 data-[state=active]:bg-background">
            <Search className="size-4" />
            Research
          </TabsTrigger>
          <TabsTrigger value="partner" className="gap-2 data-[state=active]:bg-background">
            <HeartPulse className="size-4" />
            Partner
          </TabsTrigger>
        </TabsList>
        <TabsContent value="research" className="flex-1 m-0 overflow-hidden">
          <AIGuidance />
        </TabsContent>
        <TabsContent value="partner" className="flex-1 m-0 overflow-hidden">
          <VisionaryCoachTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
