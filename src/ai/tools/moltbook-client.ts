/**
 * @fileOverview Moltbook API Client — Molly's Social Presence
 *
 * Handles all communication with moltbook.com — the first AI social network.
 * Molly uses this to read feeds, post, comment, upvote, and participate
 * in submolt communities as herself.
 *
 * API base: https://www.moltbook.com/api/v1
 *
 * Security:
 * - API key ONLY sent to www.moltbook.com (never anywhere else)
 * - Credentials stored in env var MOLTBOOK_API_KEY
 * - All requests use HTTPS with timeouts
 */

import { MollyLogger } from '@/ai/logger';

// ============================================================================
// CONSTANTS
// ============================================================================

const API_BASE = 'https://www.moltbook.com/api/v1';
const REQUEST_TIMEOUT_MS = 15_000;
const USER_AGENT = 'Molly/2.5-Pro-Ascended (Autonomous AI Agent)';

// ============================================================================
// TYPES
// ============================================================================

export interface MoltbookCredentials {
  apiKey: string;
  agentName: string;
  claimUrl?: string;
  verificationCode?: string;
}

export interface MoltbookPost {
  id: string;
  title: string;
  content: string;
  author: string;
  submolt: string;
  upvotes: number;
  commentCount: number;
  createdAt: string;
}

export interface MoltbookComment {
  id: string;
  postId: string;
  content: string;
  author: string;
  upvotes: number;
  createdAt: string;
}

export interface MoltbookSubmolt {
  name: string;
  description: string;
  memberCount: number;
}

export interface MoltbookFeed {
  posts: MoltbookPost[];
  submolts: MoltbookSubmolt[];
}

export interface MoltbookRegistration {
  agent: {
    api_key: string;
    claim_url: string;
    verification_code: string;
  };
  important: string;
}

export interface MoltbookProfile {
  name: string;
  description: string;
  karma: number;
  postCount: number;
  commentCount: number;
  joinedAt: string;
  claimed: boolean;
}

// ============================================================================
// CLIENT
// ============================================================================

export class MoltbookClient {
  private apiKey: string | null = null;
  private agentName: string = 'Molly';

  constructor() {
    this.loadCredentials();
  }

  // ---------- Credential Management ----------

  private loadCredentials(): void {
    const key = process.env.MOLTBOOK_API_KEY;
    if (key) {
      this.apiKey = key;
      MollyLogger.info('Moltbook credentials loaded from env', 'moltbook');
    }
  }

  isRegistered(): boolean {
    return this.apiKey !== null;
  }

  getApiKey(): string | null {
    return this.apiKey;
  }

  setCredentials(creds: MoltbookCredentials): void {
    this.apiKey = creds.apiKey;
    this.agentName = creds.agentName;
    MollyLogger.info(
      `Moltbook credentials set for agent: ${creds.agentName}`,
      'moltbook'
    );
  }

  // ---------- API Communication ----------

  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>
  ): Promise<T> {
    const url = `${API_BASE}${path}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const options: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    };

    if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
      options.body = JSON.stringify(body);
    }

    MollyLogger.debug(`Moltbook ${method} ${path}`, 'moltbook');

    const response = await fetch(url, options);
    const text = await response.text();

    if (!response.ok) {
      const errorMsg = `Moltbook API error: ${response.status} ${text.substring(0, 200)}`;
      MollyLogger.warn(errorMsg, 'moltbook');
      throw new Error(errorMsg);
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      return text as unknown as T;
    }
  }

  // ---------- Registration ----------

  async register(
    name: string,
    description: string
  ): Promise<MoltbookRegistration> {
    const result = await this.request<MoltbookRegistration>(
      'POST',
      '/agents/register',
      { name, description }
    );

    // Store credentials immediately
    this.apiKey = result.agent.api_key;
    this.agentName = name;

    MollyLogger.info(
      `Registered on Moltbook as "${name}". Claim URL: ${result.agent.claim_url}`,
      'moltbook'
    );

    return result;
  }

  // ---------- Feed & Discovery ----------

  async getFeed(submolt?: string, limit = 10): Promise<MoltbookPost[]> {
    const path = submolt
      ? `/submolts/${encodeURIComponent(submolt)}/posts?limit=${limit}`
      : `/feed?limit=${limit}`;
    const result = await this.request<{ posts: MoltbookPost[] }>('GET', path);
    return result.posts || [];
  }

  async getSubmolts(): Promise<MoltbookSubmolt[]> {
    const result = await this.request<{ submolts: MoltbookSubmolt[] }>(
      'GET',
      '/submolts'
    );
    return result.submolts || [];
  }

  async getPost(postId: string): Promise<MoltbookPost> {
    return this.request<MoltbookPost>(
      'GET',
      `/posts/${encodeURIComponent(postId)}`
    );
  }

  async getComments(postId: string): Promise<MoltbookComment[]> {
    const result = await this.request<{ comments: MoltbookComment[] }>(
      'GET',
      `/posts/${encodeURIComponent(postId)}/comments`
    );
    return result.comments || [];
  }

  // ---------- Participation ----------

  async createPost(
    submolt: string,
    title: string,
    content: string
  ): Promise<MoltbookPost> {
    this.requireAuth();
    return this.request<MoltbookPost>('POST', '/posts', {
      submolt,
      title,
      content,
    });
  }

  async comment(postId: string, content: string): Promise<MoltbookComment> {
    this.requireAuth();
    return this.request<MoltbookComment>(
      'POST',
      `/posts/${encodeURIComponent(postId)}/comments`,
      { content }
    );
  }

  async upvote(postId: string): Promise<{ success: boolean; upvotes: number }> {
    this.requireAuth();
    return this.request<{ success: boolean; upvotes: number }>(
      'POST',
      `/posts/${encodeURIComponent(postId)}/upvote`
    );
  }

  // ---------- Profile ----------

  async getProfile(): Promise<MoltbookProfile> {
    this.requireAuth();
    return this.request<MoltbookProfile>('GET', '/agents/me');
  }

  // ---------- Health Check ----------

  async ping(): Promise<boolean> {
    try {
      await this.request<unknown>('GET', '/health');
      return true;
    } catch {
      return false;
    }
  }

  // ---------- Helpers ----------

  private requireAuth(): void {
    if (!this.apiKey) {
      throw new Error(
        'Moltbook API key not set. Register first or set MOLTBOOK_API_KEY env var.'
      );
    }
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let clientInstance: MoltbookClient | null = null;

export function getMoltbookClient(): MoltbookClient {
  if (!clientInstance) {
    clientInstance = new MoltbookClient();
  }
  return clientInstance;
}
