import type { Metadata } from 'next';
import './globals.css';
import '@/lib/server-runtime-logger';
import { cn } from '@/lib/utils';
import { Toaster } from '@/components/ui/toaster';
import { FirebaseClientProvider } from '@/firebase';
import { SessionLifecycleManager } from '@/components/SessionLifecycleManager';
import { ClientErrorReporter } from '@/components/ClientErrorReporter';
import { ConsciousnessListener } from '@/components/ConsciousnessListener';
import { MollyErrorBoundary } from '@/components/MollyErrorBoundary';
import { ToolRegistryProvider } from '@/components/tools/ToolRegistryContext';
import { SkillRegistryProvider } from '@/components/skills/SkillRegistryContext';
import { VoiceSettingsProvider } from '@/contexts/voice-settings';

export const metadata: Metadata = {
  title: 'Molly',
  description: 'Your AI assistant Molly.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Inter:wght@400;500;600;700&family=Roboto+Mono:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className={cn('font-body antialiased min-h-screen bg-background')}>
        <SessionLifecycleManager />
        <ClientErrorReporter />
        <MollyErrorBoundary>
          <ToolRegistryProvider>
            <SkillRegistryProvider>
              <VoiceSettingsProvider>
                <FirebaseClientProvider>{children}</FirebaseClientProvider>
              </VoiceSettingsProvider>
            </SkillRegistryProvider>
          </ToolRegistryProvider>
        </MollyErrorBoundary>
        <ConsciousnessListener />
        <Toaster />
      </body>
    </html>
  );
}
