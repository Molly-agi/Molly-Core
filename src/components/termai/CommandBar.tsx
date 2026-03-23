/**
 * @fileOverview CommandBar — Bottom controls for the Terminal interface.
 *
 * Contains the manual purge button, risk mode toggle, voice controls,
 * clear history button, voice status indicator, file upload, and the command input form.
 *
 * Extracted from Terminal.tsx during Phase 6 hardening.
 * Enhanced with image/video upload capability.
 */

'use client';

import { useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  Trash2,
  Volume2,
  VolumeX,
  Shield,
  Zap,
  ImagePlus,
  X,
  Film,
} from 'lucide-react';

export interface UploadedFile {
  name: string;
  type: string;
  dataUri: string;
  size: number;
}

interface CommandBarProps {
  command: string;
  onCommandChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  isLoading: boolean;
  isIntroducing: boolean;
  isRiskMode: boolean;
  onRiskModeChange: (value: boolean) => void;
  isVocal: boolean;
  onToggleVocal: () => void;
  isVocalizing: boolean;
  autoplayBlocked: boolean;
  onClearHistory: () => void;
  onFileUpload?: (file: UploadedFile) => void;
  uploadedFile?: UploadedFile | null;
  onClearUpload?: () => void;
}

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB max
const ACCEPTED_TYPES = 'image/*,video/*';
// Match VisionPanel's settings exactly - this is what works for Gemini
const MAX_IMAGE_DIMENSION = 640; // Same as VisionPanel captureFrame
const IMAGE_QUALITY = 0.8; // Same as VisionPanel captureFrame

/**
 * Compress an image to match VisionPanel's captureFrame format.
 * This is the same processing Molly's camera uses - it works.
 */
async function compressImage(dataUri: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;

      // Downsample same as VisionPanel captureFrame
      if (width > MAX_IMAGE_DIMENSION) {
        const ratio = MAX_IMAGE_DIMENSION / width;
        width = MAX_IMAGE_DIMENSION;
        height = Math.round(height * ratio);
      }

      // Create canvas and draw resized image
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);

      // Use JPEG 0.8 - exactly like VisionPanel
      const compressedUri = canvas.toDataURL('image/jpeg', IMAGE_QUALITY);
      resolve(compressedUri);
    };
    img.onerror = () =>
      reject(new Error('Failed to load image for compression'));
    img.src = dataUri;
  });
}

export function CommandBar({
  command,
  onCommandChange,
  onSubmit,
  isLoading,
  isIntroducing,
  isRiskMode,
  onRiskModeChange,
  isVocal,
  onToggleVocal,
  isVocalizing,
  autoplayBlocked,
  onClearHistory,
  onFileUpload,
  uploadedFile,
  onClearUpload,
}: CommandBarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessingFile, setIsProcessingFile] = useState(false);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onFileUpload) return;

    if (file.size > MAX_FILE_SIZE) {
      alert(
        `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB.`
      );
      return;
    }

    setIsProcessingFile(true);

    try {
      // Convert file to base64 data URI
      let dataUri = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Compress images to avoid API parser limits
      if (file.type.startsWith('image/')) {
        dataUri = await compressImage(dataUri);
      }

      // Detect the actual mime type from the compressed dataUri
      const mimeMatch = dataUri.match(/^data:([^;]+);/);
      const actualType = mimeMatch ? mimeMatch[1] : file.type;

      onFileUpload({
        name: file.name,
        type: actualType,
        dataUri,
        size: dataUri.length, // Use compressed size
      });
    } catch (error) {
      console.error('Failed to process file:', error);
      alert('Failed to process file. Please try again.');
    } finally {
      setIsProcessingFile(false);
      // Reset input so the same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const isVideo = uploadedFile?.type.startsWith('video/');

  return (
    <>
      <div className="flex flex-col gap-4 mb-4 bg-secondary/10 p-4 rounded-xl border border-white/5 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <div className="flex items-center space-x-3 px-4">
            <Switch
              id="risk-mode"
              checked={isRiskMode}
              onCheckedChange={onRiskModeChange}
              className="data-[state=checked]:bg-purple-500"
            />
            <Label
              htmlFor="risk-mode"
              className="text-[10px] uppercase font-black tracking-[0.2em] flex items-center gap-2 cursor-pointer text-muted-foreground"
            >
              {isRiskMode ? (
                <Zap className="size-3 text-purple-400" />
              ) : (
                <Shield className="size-3 text-primary" />
              )}
              {isRiskMode ? 'SuperUser' : 'Standard'}
            </Label>
          </div>
        </div>

        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleVocal}
              className={cn(isVocalizing && 'animate-pulse')}
            >
              {isVocal ? (
                <Volume2 className="size-4 text-primary" />
              ) : (
                <VolumeX className="size-4 text-muted-foreground" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearHistory}
              className="text-destructive"
            >
              <Trash2 className="size-3" />
            </Button>
          </div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-tighter flex items-center gap-2">
            {autoplayBlocked
              ? 'Tap to enable voice'
              : isVocalizing
                ? 'Vocalizing...'
                : 'Cords Ready'}
            <span
              className={cn(
                'size-1 rounded-full',
                autoplayBlocked
                  ? 'bg-yellow-400 animate-pulse'
                  : isVocalizing
                    ? 'bg-accent animate-ping'
                    : 'bg-green-500'
              )}
            />
          </div>
        </div>
      </div>

      {/* Uploaded file preview */}
      {uploadedFile && (
        <div className="mb-3 flex items-center gap-2 bg-primary/10 p-2 rounded-lg border border-primary/20">
          {isVideo ? (
            <Film className="size-5 text-primary flex-shrink-0" />
          ) : (
            <ImagePlus className="size-5 text-primary flex-shrink-0" />
          )}
          <span className="text-sm text-primary truncate flex-1">
            {uploadedFile.name}
          </span>
          <span className="text-xs text-muted-foreground">
            {(uploadedFile.size / 1024).toFixed(1)}KB
          </span>
          {onClearUpload && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearUpload}
              className="h-6 w-6 p-0 hover:bg-destructive/20"
            >
              <X className="size-3 text-destructive" />
            </Button>
          )}
        </div>
      )}

      <form onSubmit={onSubmit} className="relative mt-auto">
        <div className="flex gap-2">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES}
            onChange={handleFileSelect}
            className="hidden"
            disabled={isLoading || isIntroducing || isProcessingFile}
          />

          {/* Upload button */}
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || isIntroducing || isProcessingFile}
            className={cn(
              'h-14 w-14 rounded-xl border-white/5 bg-secondary/20 flex-shrink-0',
              isProcessingFile && 'animate-pulse',
              uploadedFile && 'border-primary/50 bg-primary/10'
            )}
            title="Upload image or video"
          >
            {isProcessingFile ? (
              <span className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            ) : (
              <ImagePlus
                className={cn(
                  'size-5',
                  uploadedFile ? 'text-primary' : 'text-muted-foreground'
                )}
              />
            )}
          </Button>

          {/* Text input */}
          <Input
            value={command}
            onChange={(e) => onCommandChange(e.target.value)}
            placeholder={
              uploadedFile
                ? 'Ask about this image/video...'
                : 'Enter command...'
            }
            className="w-full bg-secondary/20 h-14 px-6 rounded-xl border-white/5"
            disabled={isLoading || isIntroducing}
          />
        </div>
      </form>
    </>
  );
}
