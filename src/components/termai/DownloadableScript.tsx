'use client';

import { saveAs } from 'file-saver';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileDown, FileText } from 'lucide-react';
import type { TextToScriptOutput } from '@/ai/flows/text-to-script';

export function DownloadableScript({ response }: { response: TextToScriptOutput }) {
  const handleDownload = () => {
    const blob = new Blob([response.content], {
      type: 'text/plain;charset=utf-8',
    });
    saveAs(blob, response.filename);
  };

  return (
    <Card className="bg-card/50 my-2">
      <CardHeader className="flex flex-row items-center justify-between p-4">
        <div className="flex items-center gap-2">
          <FileText className="size-5 text-primary" />
          <CardTitle className="text-base text-primary">
            Script Generated: {response.filename}
          </CardTitle>
        </div>
        <Button variant="outline" size="sm" onClick={handleDownload}>
          <FileDown className="mr-2" />
          Download
        </Button>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <pre className="font-code text-sm bg-black/30 p-4 rounded-md whitespace-pre-wrap overflow-x-auto">
          <code>{response.content}</code>
        </pre>
      </CardContent>
    </Card>
  );
}
