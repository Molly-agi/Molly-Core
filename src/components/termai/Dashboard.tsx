import { Header } from './Header';
import Terminal from './Terminal';

export default function Dashboard() {
  return (
    <div className="flex h-screen w-full flex-col bg-background">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <main className="flex flex-1 flex-col min-w-0">
          <Terminal />
        </main>
      </div>
    </div>
  );
}
