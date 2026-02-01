
'use client';

import {
  Bot,
  Github,
  PanelLeft,
  Settings,
  Terminal,
  Triangle,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { AIGuidance } from './AIGuidance';

export function TermAISidebar() {
  const { open } = useSidebar();
  return (
    <Sidebar
      className="border-r"
      variant="sidebar"
      collapsible="icon"
      side="left"
    >
      <SidebarContent className="p-2">
        <Accordion type="single" collapsible defaultValue="guidance" className="w-full">
          <AccordionItem value="guidance" className="border-none">
            <AccordionTrigger className="w-full hover:no-underline [&[data-state=open]>svg]:hidden">
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="AI Guidance" isActive>
                    <Bot />
                    <span>AI Guidance</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </AccordionTrigger>
            <AccordionContent>
                <AIGuidance />
            </AccordionContent>
          </AccordionItem>
          
          <AccordionItem value="other" className="border-none">
            <AccordionTrigger className="w-full hover:no-underline [&[data-state=open]>svg]:hidden">
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="More Features" >
                    <Settings />
                    <span>More</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </AccordionTrigger>
            <AccordionContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="Terminal" variant='ghost'>
                    <Terminal />
                    <span>Terminal</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="GitHub" variant='ghost'>
                    <Github />
                    <span>GitHub</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </SidebarContent>
    </Sidebar>
  );
}
