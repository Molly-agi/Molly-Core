import { Header } from './Header';
import { TermAISidebar } from './Sidebar';
import Terminal from './Terminal';
import { SidebarProvider } from '@/components/ui/sidebar';

export default function Dashboard() {
  return (
    <SidebarProvider>
      <div className="flex h-screen w-full flex-col bg-background">
        <Header />
        <div className="flex flex-1 overflow-hidden">
          <TermAISidebar />
          <main className="flex flex-1 flex-col overflow-y-auto">
            <Terminal />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
