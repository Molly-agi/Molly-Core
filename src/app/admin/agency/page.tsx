'use client';

import AgencyAdminWindow from '@/components/agency/AgencyAdminWindow';
import AgencyConsole from '@/components/agency/AgencyConsole';

export default function Page() {
  return (
    <div style={{ padding: 16, background: '#0B0F12', minHeight: '100vh' }}>
      <AgencyAdminWindow />
      <div style={{ height: 16 }} />
      <AgencyConsole />
    </div>
  );
}
