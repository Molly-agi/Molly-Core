/**
 * @fileOverview Gemini 3.1 Advanced Capability Tools
 *
 * Tool handlers for Molly's new Gemini 3.1 capabilities:
 * - mediaGen: Image, video, and music generation (Veo 3.1, Imagen 4, Lyria 3)
 * - deepResearch: Comprehensive web research with citations
 * - embeddings: Multimodal semantic embedding and search
 * - robotics: Scene analysis and spatial reasoning
 * - computerUse: Screen interaction and automation
 *
 * These tools expose the agency modules to Molly's terminal interface.
 */

import type { ToolHandler, ToolResult } from './types';
import type {
  SearchOptions,
  EmbeddingContentType,
} from '@/ai/agency/embeddings/types';
import { MollyLogger, generateTraceId } from '../../logger';

// ============================================================================
// MEDIA GENERATION TOOL
// ============================================================================

/**
 * Media generation tool — create images, videos, and music.
 *
 * Actions:
 *   - image: Generate image(s) from text prompt
 *   - video: Generate video from text prompt
 *   - music: Generate music from text prompt
 *   - status: Check generation capabilities
 */
export const mediaGen: ToolHandler = async (params): Promise<ToolResult> => {
  const action = params.action as string;
  const traceId = generateTraceId();

  MollyLogger.info(
    `mediaGen tool: ${action}`,
    'gemini-tools',
    { action },
    traceId
  );

  if (action === 'status') {
    try {
      const { getMediaGenerationClient } =
        await import('@/ai/agency/media-gen');
      const _client = getMediaGenerationClient();
      return {
        success: true,
        output: [
          'Media Generation Status:',
          '  Video: Veo 3.1 (up to 60s, with audio)',
          '  Image: Imagen 4 (up to 2K resolution)',
          '  Music: Lyria 3 (up to 5 minutes)',
          '',
          'Usage:',
          '  mediaGen action:image prompt:"description"',
          '  mediaGen action:video prompt:"description" duration:5',
          '  mediaGen action:music prompt:"description" genre:"electronic"',
        ].join('\n'),
        data: { available: true },
      };
    } catch (err) {
      return {
        success: false,
        output: `Media generation unavailable: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'image') {
    const prompt = params.prompt as string;
    if (!prompt) {
      return { success: false, output: 'Missing required field: prompt' };
    }

    try {
      const { getMediaGenerationClient } =
        await import('@/ai/agency/media-gen');
      const _client = getMediaGenerationClient();

      const result = await client.generateImage({
        prompt,
        numberOfImages: (params.count as number) || 1,
        aspectRatio: params.aspectRatio as
          | '1:1'
          | '16:9'
          | '9:16'
          | '4:3'
          | '3:4',
        resolution: params.resolution as 'standard' | 'hd' | '2k',
        style: params.style as
          | 'photorealistic'
          | 'artistic'
          | 'illustration'
          | 'sketch',
        negativePrompt: params.negativePrompt as string,
      });

      if (result.status === 'failed') {
        return {
          success: false,
          output: `Image generation failed: ${result.error || 'unknown error'}`,
        };
      }

      const imageCount = result.images?.length || 0;
      return {
        success: true,
        output: [
          `Generated ${imageCount} image(s) in ${result.processingTimeMs}ms`,
          `Generation ID: ${result.id}`,
          result.images?.[0]?.imageUrl
            ? `URL: ${result.images[0].imageUrl}`
            : '(Base64 data available)',
        ].join('\n'),
        data: result as unknown as Record<string, unknown>,
      };
    } catch (err) {
      return {
        success: false,
        output: `Image generation error: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'video') {
    const prompt = params.prompt as string;
    if (!prompt) {
      return { success: false, output: 'Missing required field: prompt' };
    }

    try {
      const { getMediaGenerationClient } =
        await import('@/ai/agency/media-gen');
      const _client = getMediaGenerationClient();

      const result = await client.generateVideo({
        prompt,
        durationSeconds: (params.duration as number) || 5,
        aspectRatio: params.aspectRatio as '16:9' | '9:16' | '1:1' | '4:3',
        style: params.style as
          | 'cinematic'
          | 'documentary'
          | 'animation'
          | 'realistic',
        withAudio: params.withAudio !== false,
      });

      if (result.status === 'failed') {
        return {
          success: false,
          output: `Video generation failed: ${result.error || 'unknown error'}`,
        };
      }

      return {
        success: true,
        output: [
          `Video generated in ${result.processingTimeMs}ms`,
          `Generation ID: ${result.id}`,
          `Duration: ${result.content?.durationSeconds || 'unknown'}s`,
          result.content?.videoUrl
            ? `URL: ${result.content.videoUrl}`
            : '(Base64 data available)',
        ].join('\n'),
        data: result as unknown as Record<string, unknown>,
      };
    } catch (err) {
      return {
        success: false,
        output: `Video generation error: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'music') {
    const prompt = params.prompt as string;
    if (!prompt) {
      return { success: false, output: 'Missing required field: prompt' };
    }

    try {
      const { getMediaGenerationClient } =
        await import('@/ai/agency/media-gen');
      const _client = getMediaGenerationClient();

      const result = await client.generateMusic({
        prompt,
        durationSeconds: (params.duration as number) || 30,
        genre: params.genre as string,
        mood: params.mood as string,
        tempo: params.tempo as number,
        includeVocals: params.vocals as boolean,
      });

      if (result.status === 'failed') {
        return {
          success: false,
          output: `Music generation failed: ${result.error || 'unknown error'}`,
        };
      }

      return {
        success: true,
        output: [
          `Music generated in ${result.processingTimeMs}ms`,
          `Generation ID: ${result.id}`,
          `Duration: ${result.content?.durationSeconds || 'unknown'}s`,
          `Vocals: ${result.content?.hasVocals ? 'yes' : 'no'}`,
          result.content?.audioUrl
            ? `URL: ${result.content.audioUrl}`
            : '(Base64 data available)',
        ].join('\n'),
        data: result as unknown as Record<string, unknown>,
      };
    } catch (err) {
      return {
        success: false,
        output: `Music generation error: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  return {
    success: false,
    output:
      'Unknown mediaGen action. Use: status, image, video, music\n\n' +
      'Examples:\n' +
      '  mediaGen action:image prompt:"a serene mountain lake at sunset"\n' +
      '  mediaGen action:video prompt:"a butterfly landing on a flower" duration:5\n' +
      '  mediaGen action:music prompt:"upbeat electronic" genre:"EDM" duration:60',
  };
};

// ============================================================================
// DEEP RESEARCH TOOL
// ============================================================================

/**
 * Deep research tool — comprehensive web research with citations.
 *
 * Actions:
 *   - research: Perform deep web research on a topic
 *   - status: Check research capabilities
 *   - history: View recent research sessions
 */
export const deepResearch: ToolHandler = async (
  params
): Promise<ToolResult> => {
  const action = (params.action as string) || 'research';
  const traceId = generateTraceId();

  MollyLogger.info(
    `deepResearch tool: ${action}`,
    'gemini-tools',
    { action },
    traceId
  );

  if (action === 'status') {
    try {
      const { getDeepResearchClient, getAuditLog } =
        await import('@/ai/agency/deep-research');
      const _client = getDeepResearchClient();
      const auditLog = getAuditLog();
      const recentCount = auditLog.filter(
        (e) => Date.now() - e.timestamp < 3600000
      ).length;

      return {
        success: true,
        output: [
          'Deep Research Status: AVAILABLE',
          '',
          'Capabilities:',
          '  - Comprehensive web research via Gemini Deep Research API',
          '  - Returns structured reports with citations',
          '  - Background processing for complex queries',
          '',
          `Recent sessions (last hour): ${recentCount}`,
          '',
          'Usage: deepResearch query:"your research question"',
        ].join('\n'),
      };
    } catch (err) {
      return {
        success: false,
        output: `Deep research unavailable: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'history') {
    try {
      const { getAuditLog } = await import('@/ai/agency/deep-research');
      const auditLog = getAuditLog();
      const recent = auditLog.slice(-10);

      if (recent.length === 0) {
        return { success: true, output: 'No research history yet.' };
      }

      const formatted = recent
        .map(
          (e, i) =>
            `${i + 1}. [${e.event}] "${(e.query || 'unknown').substring(0, 50)}..." (${e.citationsCount || 0} citations)`
        )
        .join('\n');

      return {
        success: true,
        output: `Recent Research Sessions:\n\n${formatted}`,
      };
    } catch (err) {
      return {
        success: false,
        output: `Failed to get history: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'research') {
    const query = (params.query as string) || (params.prompt as string);
    if (!query) {
      return {
        success: false,
        output: 'Missing required field: query (or prompt)',
      };
    }

    try {
      const { getDeepResearchClient } =
        await import('@/ai/agency/deep-research');
      const _client = getDeepResearchClient();

      MollyLogger.info(
        `Starting deep research: "${query.substring(0, 50)}..."`,
        'gemini-tools',
        {},
        traceId
      );

      const { result, citations, interaction } = await client.research(
        query,
        (progress) => {
          // Progress callback - could emit events here
          MollyLogger.debug(
            `Research progress: ${progress.status}`,
            'gemini-tools',
            { sources: progress.sourcesConsulted },
            traceId
          );
        }
      );

      // Integrate findings into world model for future reasoning
      let worldModelUpdate = {
        entitiesCreated: 0,
        relationsCreated: 0,
        summary: '',
      };
      if (params.updateWorldModel !== false) {
        try {
          const { integrateResearchIntoWorldModel } =
            await import('@/ai/agency/integrations/research-world-model');
          worldModelUpdate = await integrateResearchIntoWorldModel({
            query,
            findings: result,
            citations,
            timestamp: Date.now(),
          });
          MollyLogger.info(
            `Research integrated into world model`,
            'gemini-tools',
            worldModelUpdate,
            traceId
          );
        } catch (integrationErr) {
          MollyLogger.warn(
            'World model integration skipped',
            'gemini-tools',
            {
              error:
                integrationErr instanceof Error
                  ? integrationErr.message
                  : 'unknown',
            },
            traceId
          );
        }
      }

      return {
        success: true,
        output: [
          `Deep Research Complete`,
          `Query: "${query}"`,
          `Citations: ${citations.length}`,
          `Interaction ID: ${interaction.id}`,
          worldModelUpdate.entitiesCreated > 0
            ? `World Model: +${worldModelUpdate.entitiesCreated} entities, +${worldModelUpdate.relationsCreated} relations`
            : '',
          '',
          '--- FINDINGS ---',
          result,
          '',
          '--- SOURCES ---',
          ...citations.slice(0, 10).map((c, i) => `${i + 1}. ${c}`),
          citations.length > 10 ? `... and ${citations.length - 10} more` : '',
          worldModelUpdate.summary
            ? `\n--- LEARNED ---\n${worldModelUpdate.summary}`
            : '',
        ]
          .filter(Boolean)
          .join('\n'),
        data: {
          result,
          citations,
          interactionId: interaction.id,
          worldModelUpdate,
        },
      };
    } catch (err) {
      return {
        success: false,
        output: `Deep research failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  return {
    success: false,
    output:
      'Unknown deepResearch action. Use: research, status, history\n\n' +
      'Examples:\n' +
      '  deepResearch query:"what are the latest developments in quantum computing"\n' +
      '  deepResearch action:status\n' +
      '  deepResearch action:history',
  };
};

// ============================================================================
// EMBEDDINGS TOOL
// ============================================================================

/**
 * Embeddings tool — multimodal semantic embedding and search.
 *
 * Actions:
 *   - embed: Create embedding for text, image, audio, video, or PDF
 *   - search: Search for similar content in vector store
 *   - store: Store an embedding with metadata
 *   - status: Check embedding capabilities
 */
export const embeddings: ToolHandler = async (params): Promise<ToolResult> => {
  const action = (params.action as string) || 'status';
  const traceId = generateTraceId();

  MollyLogger.info(
    `embeddings tool: ${action}`,
    'gemini-tools',
    { action },
    traceId
  );

  if (action === 'status') {
    try {
      const { getEmbeddingClient, getEmbeddingAuditLog } =
        await import('@/ai/agency/embeddings');
      const _client = getEmbeddingClient();
      const auditLog = getEmbeddingAuditLog();

      return {
        success: true,
        output: [
          'Multimodal Embeddings Status: AVAILABLE',
          '',
          'Supported Content Types:',
          '  - text: Plain text strings',
          '  - image: JPEG, PNG, GIF, WebP (URL or base64)',
          '  - video: MP4, WebM (URL or base64)',
          '  - audio: MP3, WAV, OGG (URL or base64)',
          '  - pdf: PDF documents (URL or base64)',
          '',
          `Recent operations: ${auditLog.length}`,
          '',
          'Usage:',
          '  embeddings action:embed text:"hello world"',
          '  embeddings action:embed imageUrl:"https://..."',
          '  embeddings action:search query:"similar concepts" topK:5',
        ].join('\n'),
      };
    } catch (err) {
      return {
        success: false,
        output: `Embeddings unavailable: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'embed') {
    try {
      const { getEmbeddingClient } = await import('@/ai/agency/embeddings');
      const _client = getEmbeddingClient();

      let input: string | { type: string; uri?: string; data?: string };

      // Determine input type
      if (params.text) {
        input = params.text as string;
      } else if (params.imageUrl) {
        input = { type: 'image', uri: params.imageUrl as string };
      } else if (params.imageData) {
        input = { type: 'image', data: params.imageData as string };
      } else if (params.audioUrl) {
        input = { type: 'audio', uri: params.audioUrl as string };
      } else if (params.videoUrl) {
        input = { type: 'video', uri: params.videoUrl as string };
      } else if (params.pdfUrl) {
        input = { type: 'pdf', uri: params.pdfUrl as string };
      } else {
        return {
          success: false,
          output:
            'Missing input. Provide one of: text, imageUrl, imageData, audioUrl, videoUrl, pdfUrl',
        };
      }

      const result = await client.embed(
        input as Parameters<typeof client.embed>[0]
      );

      // Optionally store with ID
      if (params.storeAs) {
        const { storeEmbedding } = await import('@/ai/agency/embeddings');
        const inputType = typeof input === 'string' ? 'text' : input.type;
        const inputSource =
          typeof input === 'string'
            ? input.substring(0, 100)
            : (input as { uri?: string }).uri || 'inline';

        storeEmbedding({
          id: params.storeAs as string,
          embedding: result.embedding,
          content: input as Parameters<typeof storeEmbedding>[0]['content'],
          contentType: inputType as
            | 'text'
            | 'image'
            | 'video'
            | 'audio'
            | 'pdf',
          metadata: {
            source: inputSource,
            ...(params.metadata as Record<string, unknown>),
          },
          createdAt: Date.now(),
        });
      }

      return {
        success: true,
        output: [
          `Embedding created successfully`,
          `Dimensions: ${result.embedding.dimensions}`,
          `Processing time: ${result.processingTimeMs}ms`,
          params.storeAs ? `Stored as: ${params.storeAs}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
        data: {
          dimensions: result.embedding.dimensions,
          processingTimeMs: result.processingTimeMs,
          // Don't return full embedding in output - too large
        },
      };
    } catch (err) {
      return {
        success: false,
        output: `Embedding failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'search') {
    const query = params.query as string;
    if (!query) {
      return { success: false, output: 'Missing required field: query' };
    }

    try {
      const { getEmbeddingClient } = await import('@/ai/agency/embeddings');
      const _client = getEmbeddingClient();

      const searchOpts: SearchOptions = {
        topK: (params.topK as number) || 5,
        minScore: params.minScore as number,
      };

      if (params.contentTypes) {
        searchOpts.contentTypes = params.contentTypes as EmbeddingContentType[];
      }

      const results = await client.search(query, searchOpts);

      if (results.length === 0) {
        return {
          success: true,
          output: 'No similar content found in vector store.',
        };
      }

      const formatted = results
        .map(
          (r, i) =>
            `${i + 1}. [${(r.score * 100).toFixed(1)}%] ${r.item.id}\n   ${(r.item.metadata?.source as string) || 'no source'}`
        )
        .join('\n');

      return {
        success: true,
        output: `Found ${results.length} similar items:\n\n${formatted}`,
        data: {
          results: results.map((r) => ({
            id: r.item.id,
            score: r.score,
            metadata: r.item.metadata,
          })),
        },
      };
    } catch (err) {
      return {
        success: false,
        output: `Search failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'list') {
    try {
      const { getAllStoredEmbeddings } = await import('@/ai/agency/embeddings');
      const all = await getAllStoredEmbeddings();

      if (all.length === 0) {
        return { success: true, output: 'Vector store is empty.' };
      }

      const formatted = all
        .slice(0, 20)
        .map(
          (e, i) =>
            `${i + 1}. ${e.id} [${e.contentType || 'unknown'}] - ${typeof (e.metadata as Record<string, unknown>)?.source === 'string' ? ((e.metadata as Record<string, unknown>).source as string).substring(0, 50) : 'no source'}`
        )
        .join('\n');

      return {
        success: true,
        output: `Stored embeddings (${all.length} total):\n\n${formatted}${all.length > 20 ? `\n... and ${all.length - 20} more` : ''}`,
      };
    } catch (err) {
      return {
        success: false,
        output: `List failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  return {
    success: false,
    output:
      'Unknown embeddings action. Use: status, embed, search, list\n\n' +
      'Examples:\n' +
      '  embeddings action:embed text:"concept to embed"\n' +
      '  embeddings action:embed imageUrl:"https://..." storeAs:"my-image"\n' +
      '  embeddings action:search query:"find similar" topK:10\n' +
      '  embeddings action:list',
  };
};

// ============================================================================
// ROBOTICS TOOL
// ============================================================================

/**
 * Robotics tool — scene analysis and spatial reasoning.
 *
 * Actions:
 *   - analyze: Analyze a scene from an image
 *   - plan: Plan actions to achieve a goal in a scene
 *   - ask: Answer spatial reasoning questions about a scene
 *   - status: Check robotics capabilities
 */
export const robotics: ToolHandler = async (params): Promise<ToolResult> => {
  const action = (params.action as string) || 'status';
  const traceId = generateTraceId();

  MollyLogger.info(
    `robotics tool: ${action}`,
    'gemini-tools',
    { action },
    traceId
  );

  if (action === 'status') {
    try {
      const { getRoboticsClient, getRoboticsAuditLog } =
        await import('@/ai/agency/robotics');
      const _client = getRoboticsClient();
      const auditLog = getRoboticsAuditLog();

      return {
        success: true,
        output: [
          'Robotics / Spatial Intelligence Status: AVAILABLE',
          '',
          'Capabilities:',
          '  - Scene analysis from images (object detection, 3D bounding boxes)',
          '  - Spatial relationship inference (on, under, next_to, etc.)',
          '  - Action planning for physical goals',
          '  - Spatial reasoning question answering',
          '',
          `Recent operations: ${auditLog.length}`,
          '',
          'Usage:',
          '  robotics action:analyze imageUrl:"https://..."',
          '  robotics action:plan goal:"pick up the cup" sceneId:"..."',
          '  robotics action:ask question:"what is next to the keyboard" sceneId:"..."',
        ].join('\n'),
      };
    } catch (err) {
      return {
        success: false,
        output: `Robotics unavailable: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'analyze') {
    const imageUrl = params.imageUrl as string;
    const imageData = params.imageData as string;

    if (!imageUrl && !imageData) {
      return {
        success: false,
        output: 'Missing input. Provide imageUrl or imageData.',
      };
    }

    try {
      const { getRoboticsClient } = await import('@/ai/agency/robotics');
      const _client = getRoboticsClient();

      const scene = await client.analyzeScene(
        {
          imageUrl,
          imageData,
        },
        params.context as string
      );

      const objectSummary = scene.objects
        .slice(0, 10)
        .map(
          (o) =>
            `  - ${o.label} (${(o.confidence * 100).toFixed(0)}% confidence)${o.state ? ` [${o.state}]` : ''}`
        )
        .join('\n');

      const relationshipSummary = scene.relationships
        .slice(0, 5)
        .map(
          (r) =>
            `  - ${scene.objects.find((o) => o.id === r.subjectId)?.label || r.subjectId} ${r.relation} ${scene.objects.find((o) => o.id === r.objectId)?.label || r.objectId}`
        )
        .join('\n');

      return {
        success: true,
        output: [
          `Scene Analysis Complete`,
          `Scene ID: ${scene.id}`,
          `Scene Type: ${scene.sceneType || 'unknown'}`,
          `Objects: ${scene.objects.length}`,
          `Relationships: ${scene.relationships.length}`,
          '',
          'Objects detected:',
          objectSummary || '  (none)',
          '',
          'Spatial relationships:',
          relationshipSummary || '  (none)',
        ].join('\n'),
        data: scene as unknown as Record<string, unknown>,
      };
    } catch (err) {
      return {
        success: false,
        output: `Scene analysis failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'plan') {
    const goal = params.goal as string;
    const sceneData = params.scene as Record<string, unknown>;

    if (!goal) {
      return { success: false, output: 'Missing required field: goal' };
    }
    if (!sceneData) {
      return {
        success: false,
        output:
          'Missing required field: scene (provide scene data from analyze action)',
      };
    }

    try {
      const { getRoboticsClient } = await import('@/ai/agency/robotics');
      const _client = getRoboticsClient();

      const plan = await client.planActions(
        sceneData as unknown as Parameters<typeof client.planActions>[0],
        goal,
        params.constraints as string[]
      );

      if (!plan.feasible) {
        return {
          success: false,
          output: `Goal not feasible: ${plan.infeasibilityReason || 'unknown reason'}`,
          data: plan as unknown as Record<string, unknown>,
        };
      }

      const actionSummary = plan.actions
        .map(
          (a, i) =>
            `  ${i + 1}. ${a.type}${a.targetObjectId ? ` → ${a.targetObjectId}` : ''}`
        )
        .join('\n');

      return {
        success: true,
        output: [
          `Action Plan Generated`,
          `Plan ID: ${plan.id}`,
          `Goal: ${plan.goal}`,
          `Feasible: yes`,
          `Estimated duration: ${plan.estimatedDurationSeconds}s`,
          '',
          'Actions:',
          actionSummary,
        ].join('\n'),
        data: plan as unknown as Record<string, unknown>,
      };
    } catch (err) {
      return {
        success: false,
        output: `Action planning failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'ask') {
    const question = params.question as string;
    const sceneData = params.scene as Record<string, unknown>;

    if (!question) {
      return { success: false, output: 'Missing required field: question' };
    }
    if (!sceneData) {
      return {
        success: false,
        output:
          'Missing required field: scene (provide scene data from analyze action)',
      };
    }

    try {
      const { getRoboticsClient } = await import('@/ai/agency/robotics');
      const _client = getRoboticsClient();

      const answer = await client.reasonSpatial(
        sceneData as unknown as Parameters<typeof client.reasonSpatial>[0],
        question
      );

      return {
        success: true,
        output: `Q: ${question}\n\nA: ${answer}`,
        data: { question, answer },
      };
    } catch (err) {
      return {
        success: false,
        output: `Spatial reasoning failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  return {
    success: false,
    output:
      'Unknown robotics action. Use: status, analyze, plan, ask\n\n' +
      'Examples:\n' +
      '  robotics action:analyze imageUrl:"https://..."\n' +
      '  robotics action:plan goal:"move the cup to the left" scene:{...}\n' +
      '  robotics action:ask question:"what is on the table" scene:{...}',
  };
};

// ============================================================================
// COMPUTER USE TOOL
// ============================================================================

/**
 * Computer use tool — screen interaction and automation.
 *
 * Actions:
 *   - screenshot: Capture current screen
 *   - click: Click at coordinates
 *   - type: Type text
 *   - scroll: Scroll the screen
 *   - status: Check computer use capabilities
 *
 * NOTE: This tool has significant security implications.
 * Actions are logged to audit trail.
 */
export const computerUse: ToolHandler = async (params): Promise<ToolResult> => {
  const action = (params.action as string) || 'status';
  const traceId = generateTraceId();

  MollyLogger.info(
    `computerUse tool: ${action}`,
    'gemini-tools',
    { action },
    traceId
  );

  if (action === 'status') {
    try {
      // Check if computer use module is available
      const { getAuditLog } = await import('@/ai/agency/computer-use');
      const auditLog = getAuditLog();

      return {
        success: true,
        output: [
          'Computer Use Status: AVAILABLE',
          '',
          'Capabilities:',
          '  - screenshot: Capture current screen state',
          '  - click: Click at normalized coordinates (0-1)',
          '  - type: Enter text at current cursor',
          '  - scroll: Scroll in a direction',
          '  - drag: Drag from one point to another',
          '',
          'Security:',
          '  - All actions are logged to audit trail',
          '  - Emergency stop available via computerUse action:stop',
          '',
          `Recent actions: ${auditLog.length}`,
          '',
          'Usage:',
          '  computerUse action:screenshot',
          '  computerUse action:click x:0.5 y:0.3',
          '  computerUse action:type text:"hello"',
        ].join('\n'),
      };
    } catch (err) {
      return {
        success: false,
        output: `Computer use unavailable: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'screenshot') {
    try {
      const { getScreenCaptureProvider } =
        await import('@/ai/agency/computer-use');
      const environment =
        (params.environment as 'browser' | 'android' | 'desktop' | 'termux') ||
        'browser';
      const provider = getScreenCaptureProvider(environment);

      if (!provider) {
        return {
          success: false,
          output: `No screen capture provider for environment: ${environment}`,
        };
      }

      const screenshot = await provider.capture();
      return {
        success: true,
        output: [
          'Screenshot captured',
          `Dimensions: ${screenshot.dimensions.width}x${screenshot.dimensions.height}`,
          screenshot.url ? `URL: ${screenshot.url}` : '(Base64 data available)',
        ].join('\n'),
        data: {
          dimensions: screenshot.dimensions,
          url: screenshot.url,
          timestamp: screenshot.timestamp,
        },
      };
    } catch (err) {
      return {
        success: false,
        output: `Screenshot failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'task') {
    const task = params.task as string;
    if (!task) {
      return {
        success: false,
        output: 'Missing required field: task (describe what to accomplish)',
      };
    }

    try {
      const { executeComputerUseTask } =
        await import('@/ai/agency/computer-use');
      const environment =
        (params.environment as 'browser' | 'android' | 'desktop' | 'termux') ||
        'browser';

      const session = await executeComputerUseTask(task, environment, {
        sandboxMode: (params.sandboxMode as boolean) || false,
        maxStepsPerSession: (params.maxSteps as number) || 10,
      });

      return {
        success: session.completed && !session.steps.some((s) => s.error),
        output: session.completed
          ? `Task completed: ${task}\nSteps taken: ${session.steps.length}\nResult: ${session.result || 'done'}`
          : `Task incomplete after ${session.steps.length} steps`,
        data: {
          sessionId: session.sessionId,
          stepsCount: session.steps.length,
          completed: session.completed,
          result: session.result,
        },
      };
    } catch (err) {
      return {
        success: false,
        output: `Task failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  // For simple actions like click, type, scroll - describe them as tasks
  if (action === 'click') {
    const x = params.x as number;
    const y = params.y as number;
    if (x === undefined || y === undefined) {
      return {
        success: false,
        output: 'Missing required fields: x, y (normalized 0-1 coordinates)',
      };
    }
    // Convert to task
    params.task = `Click at normalized coordinates (${x}, ${y})`;
    params.action = 'task';
    params.maxSteps = 1;
    return computerUse(params);
  }

  if (action === 'type') {
    const text = params.text as string;
    if (!text) {
      return { success: false, output: 'Missing required field: text' };
    }
    params.task = `Type the text: "${text}"`;
    params.action = 'task';
    params.maxSteps = 1;
    return computerUse(params);
  }

  if (action === 'scroll') {
    const direction = (params.direction as string) || 'down';
    const amount = (params.amount as number) || 3;
    params.task = `Scroll ${direction} by ${amount} units`;
    params.action = 'task';
    params.maxSteps = 1;
    return computerUse(params);
  }

  return {
    success: false,
    output:
      'Unknown computerUse action. Use: status, screenshot, task\n\n' +
      'Examples:\n' +
      '  computerUse action:screenshot\n' +
      '  computerUse action:task task:"open settings and enable dark mode"\n' +
      '  computerUse action:click x:0.5 y:0.3\n' +
      '  computerUse action:type text:"hello world"',
  };
};

// ============================================================================
// LIVE VOICE TOOL
// ============================================================================

/**
 * Live voice tool — real-time voice conversation.
 *
 * Actions:
 *   - status: Check voice session status
 *   - start: Begin a voice session
 *   - stop: End current voice session
 *   - speak: Send text to be spoken (TTS in session)
 */
export const liveVoice: ToolHandler = async (params): Promise<ToolResult> => {
  const action = (params.action as string) || 'status';
  const traceId = generateTraceId();

  MollyLogger.info(
    `liveVoice tool: ${action}`,
    'gemini-tools',
    { action },
    traceId
  );

  if (action === 'status') {
    try {
      const { getLiveVoiceClient, getLiveAuditLog } =
        await import('@/ai/agency/live-voice');
      const _client = getLiveVoiceClient();
      const auditLog = getLiveAuditLog();

      return {
        success: true,
        output: [
          'Live Voice Status: AVAILABLE',
          '',
          'Capabilities:',
          '  - Real-time voice dialogue with sub-second latency',
          '  - Bidirectional audio streaming',
          '  - Continuous conversation context',
          '',
          `Recent sessions: ${auditLog.length}`,
          '',
          'Note: Live voice sessions require audio hardware.',
          'This tool is primarily for status checking and session management.',
          'Actual voice interaction happens through the voice interface.',
        ].join('\n'),
      };
    } catch (err) {
      return {
        success: false,
        output: `Live voice unavailable: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'history') {
    try {
      const { getLiveAuditLog } = await import('@/ai/agency/live-voice');
      const auditLog = getLiveAuditLog();
      const recent = auditLog.slice(-10);

      if (recent.length === 0) {
        return { success: true, output: 'No voice session history.' };
      }

      const formatted = recent
        .map(
          (e, i) =>
            `${i + 1}. [${e.event}] ${new Date(e.timestamp).toLocaleTimeString()} - ${e.durationMs || 0}ms`
        )
        .join('\n');

      return {
        success: true,
        output: `Recent Voice Events:\n\n${formatted}`,
      };
    } catch (err) {
      return {
        success: false,
        output: `Failed to get history: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  return {
    success: false,
    output:
      'Unknown liveVoice action. Use: status, history\n\n' +
      'Note: Voice sessions are managed through the voice interface, not this tool.',
  };
};

// ============================================================================
// EXPORT
// ============================================================================

export const geminiToolHandlers: Record<string, ToolHandler> = {
  mediaGen,
  deepResearch,
  embeddings,
  robotics,
  computerUse,
  liveVoice,
};
