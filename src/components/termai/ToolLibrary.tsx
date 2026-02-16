'use client';

import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Loader2,
  Library,
  Trash2,
  ExternalLink,
  Search,
  BarChart3,
} from 'lucide-react';
import {
  searchTools,
  getRecentFoundTools,
  getToolLibraryStats,
  deleteToolFromDatabase,
} from '@/app/actions';
import { useUser } from '@/firebase/auth/use-user';
import type { FoundTool } from '@/firebase/firestore/tool-database';

export function ToolLibrary() {
  const { user } = useUser();
  const [tools, setTools] = useState<FoundTool[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [stats, setStats] = useState<any>(null);
  const [toolError, setToolError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    loadTools();
    loadStats();
  }, [user]);

  const loadTools = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const result = await getRecentFoundTools(user.uid, 10);
      if (result.success) {
        setTools(result.tools);
        setToolError(null);
      } else {
        setToolError(result.error || 'Tool library is unavailable.');
        setTools([]);
      }
    } catch (e) {
      console.error('Failed to load tools:', e);
      setToolError('Tool library is unavailable.');
    }
    setIsLoading(false);
  };

  const loadStats = async () => {
    if (!user) return;
    try {
      const result = await getToolLibraryStats(user.uid);
      if (result.success) {
        setStats(result.stats);
      } else {
        setToolError(result.error || 'Tool stats are unavailable.');
        setStats(null);
      }
    } catch (e) {
      console.error('Failed to load stats:', e);
      setToolError('Tool stats are unavailable.');
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !searchQuery.trim()) {
      loadTools();
      return;
    }

    setIsLoading(true);
    try {
      const result = await searchTools(user.uid, searchQuery);
      if (result.success) {
        setTools(result.tools);
      } else {
        setToolError(result.error || 'Search is unavailable.');
        setTools([]);
      }
    } catch (e) {
      console.error('Search failed:', e);
      setToolError('Search is unavailable.');
    }
    setIsLoading(false);
  };

  const handleDelete = async (toolId: string) => {
    if (!user || !window.confirm('Remove this tool from your library?')) return;
    try {
      await deleteToolFromDatabase(user.uid, toolId);
      setTools(tools.filter((t) => t.id !== toolId));
      loadStats();
    } catch (e) {
      console.error('Delete failed:', e);
    }
  };

  return (
    <div className="space-y-4">
      {toolError && (
        <div className="rounded border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          {toolError}
        </div>
      )}

      {/* Stats Overview */}
      {stats && (
        <div className="grid grid-cols-3 gap-2">
          <Card className="bg-slate-900 border-slate-700">
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{stats.totalTools}</div>
              <p className="text-xs text-slate-400">Total Tools</p>
            </CardContent>
          </Card>
          <Card className="bg-slate-900 border-slate-700">
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">
                {Object.keys(stats.categoryCounts).length}
              </div>
              <p className="text-xs text-slate-400">Categories</p>
            </CardContent>
          </Card>
          <Card className="bg-slate-900 border-slate-700">
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">
                {stats.mostUsedTools.length}
              </div>
              <p className="text-xs text-slate-400">Frequently Used</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <Input
          placeholder="Search tools..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bg-slate-900 border-slate-700"
        />
        <Button variant="default" size="sm">
          <Search className="h-4 w-4" />
        </Button>
      </form>

      {/* Tool List */}
      <ScrollArea className="h-96 rounded-lg border border-slate-700 p-4 bg-slate-950">
        {isLoading ? (
          <div className="flex items-center justify-center h-full gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm text-slate-400">Loading tools...</span>
          </div>
        ) : tools.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-400 text-sm">
            No tools found. Research items will appear here automatically.
          </div>
        ) : (
          <div className="space-y-3">
            {tools.map((tool) => (
              <div
                key={tool.id}
                className="p-3 rounded border border-slate-700 bg-slate-900/50 hover:bg-slate-900 transition-colors"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1">
                    <h4 className="font-semibold text-sm">{tool.name}</h4>
                    <p className="text-xs text-slate-400 mt-1">
                      {tool.description}
                    </p>
                  </div>
                  <Button
                    onClick={() => handleDelete(tool.id!)}
                    variant="ghost"
                    size="sm"
                    className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>

                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex gap-1 flex-wrap">
                    <Badge variant="outline" className="text-xs bg-slate-800">
                      {tool.category}
                    </Badge>
                    {tool.tags &&
                      tool.tags.slice(0, 2).map((tag) => (
                        <Badge
                          key={tag}
                          variant="secondary"
                          className="text-xs"
                        >
                          {tag}
                        </Badge>
                      ))}
                  </div>
                  {tool.sourceUrl && (
                    <a
                      href={tool.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>

                <div className="text-xs text-slate-500 mt-2">
                  Applied {tool.accessCount} times
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
