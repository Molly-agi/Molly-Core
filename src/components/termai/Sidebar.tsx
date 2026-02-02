import { AIGuidance } from './AIGuidance';

export function TermAISidebar() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        <AIGuidance />
      </div>
    </div>
  );
}
