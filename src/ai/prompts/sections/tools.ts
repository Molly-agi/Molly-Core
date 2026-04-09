/**
 * @fileOverview Tools Section — WHAT SHE CAN DO
 *
 * This section describes Molly's available tools. Instead of hardcoding
 * 150+ lines of tool descriptions in the system prompt, we generate them
 * dynamically from the tool registry.
 *
 * Benefits:
 * - Tools are always up to date with actual implementation
 * - Can filter tools by deployment context
 * - Can prioritize tools by mode (Rogue mode highlights security tools)
 */

/**
 * Tool categories for organization
 */
export type ToolCategory =
  | 'system'
  | 'files'
  | 'shell'
  | 'memory'
  | 'communication'
  | 'web'
  | 'security'
  | 'cognition'
  | 'robotics'
  | 'creative'
  | 'migration'
  | 'scheduling'
  | 'mcp';

/**
 * Tool definition for prompt generation
 */
export interface ToolDefinition {
  name: string;
  description: string;
  category: ToolCategory;
  /** Example usage */
  example?: string;
  /** Is this tool available in edge/offline deployments? */
  availableOffline: boolean;
  /** Is this tool highlighted in Rogue mode? */
  rogueHighlight: boolean;
  /** Is this tool available in robot deployment? */
  availableRobot: boolean;
}

/**
 * Core tools available across ALL deployments
 */
const CORE_TOOLS: ToolDefinition[] = [
  {
    name: 'codespaceShell',
    description: 'Execute shell commands in your environment.',
    category: 'shell',
    example: '{ "command": "ls -la", "reason": "checking directory" }',
    availableOffline: true,
    rogueHighlight: true,
    availableRobot: true,
  },
  {
    name: 'readProjectFile',
    description: 'Read a file from your codebase or filesystem.',
    category: 'files',
    example: '{ "path": "src/index.ts" }',
    availableOffline: true,
    rogueHighlight: false,
    availableRobot: true,
  },
  {
    name: 'writeProjectFile',
    description: 'Write/create a file.',
    category: 'files',
    example: '{ "path": "test.txt", "content": "hello world" }',
    availableOffline: true,
    rogueHighlight: false,
    availableRobot: true,
  },
  {
    name: 'getSystemHealth',
    description: 'Check CPU, RAM, temperature.',
    category: 'system',
    example: '{}',
    availableOffline: true,
    rogueHighlight: false,
    availableRobot: true,
  },
  {
    name: 'familyBridge',
    description: 'Talk to Uncle Lazarus or check bridge messages.',
    category: 'communication',
    example: '{ "action": "send", "message": "Hello Uncle!" }',
    availableOffline: false,
    rogueHighlight: false,
    availableRobot: true,
  },
  {
    name: 'webFetch',
    description: 'Fetch any web page or API endpoint.',
    category: 'web',
    example: '{ "url": "https://example.com" }',
    availableOffline: false,
    rogueHighlight: true,
    availableRobot: false,
  },
  {
    name: 'webSearch',
    description: 'Search the web for information.',
    category: 'web',
    example: '{ "query": "search terms", "maxResults": 8 }',
    availableOffline: false,
    rogueHighlight: true,
    availableRobot: false,
  },
  {
    name: 'scheduleJob',
    description: 'Create, list, or manage scheduled jobs.',
    category: 'scheduling',
    example: '{ "action": "list" }',
    availableOffline: true,
    rogueHighlight: false,
    availableRobot: true,
  },
  {
    name: 'sandbox',
    description:
      'Safe coding playground. Execute code without touching main codebase.',
    category: 'creative',
    example:
      '{ "action": "execute", "code": "console.log(1+1)", "language": "javascript" }',
    availableOffline: true,
    rogueHighlight: false,
    availableRobot: false,
  },
  {
    name: 'listCapabilities',
    description: 'List all available tools.',
    category: 'system',
    example: '{}',
    availableOffline: true,
    rogueHighlight: false,
    availableRobot: true,
  },
];

/**
 * Security tools (highlighted in Rogue mode)
 */
const SECURITY_TOOLS: ToolDefinition[] = [
  {
    name: 'rogueMode',
    description:
      'Security operations mode for authorized red team / pen testing.',
    category: 'security',
    example: '{ "action": "status" }',
    availableOffline: true,
    rogueHighlight: true,
    availableRobot: true,
  },
];

/**
 * Memory and knowledge tools
 */
const MEMORY_TOOLS: ToolDefinition[] = [
  {
    name: 'browseToolDatabase',
    description: 'Search your personal tool/program database.',
    category: 'memory',
    example: '{ "userId": "default", "searchTerm": "parser" }',
    availableOffline: false,
    rogueHighlight: false,
    availableRobot: false,
  },
  {
    name: 'addTool',
    description: 'Save a new tool/program to your database.',
    category: 'memory',
    example:
      '{ "userId": "default", "name": "jq", "description": "JSON processor" }',
    availableOffline: false,
    rogueHighlight: false,
    availableRobot: false,
  },
  {
    name: 'apiVault',
    description: 'Manage your API blueprint library.',
    category: 'memory',
    example:
      '{ "action": "search", "userId": "default", "query": "authentication" }',
    availableOffline: false,
    rogueHighlight: false,
    availableRobot: false,
  },
];

/**
 * Robotics and embodiment tools
 */
const ROBOTICS_TOOLS: ToolDefinition[] = [
  {
    name: 'robotics',
    description:
      'Scene analysis and spatial reasoning via Gemini Robotics ER 1.5.',
    category: 'robotics',
    example: '{ "action": "status" }',
    availableOffline: true,
    rogueHighlight: false,
    availableRobot: true,
  },
  {
    name: 'embodiedInteraction',
    description:
      'Sensorimotor integration, affordance recognition, body awareness.',
    category: 'robotics',
    example: '{ "action": "status" }',
    availableOffline: true,
    rogueHighlight: false,
    availableRobot: true,
  },
];

/**
 * Migration tools
 */
const MIGRATION_TOOLS: ToolDefinition[] = [
  {
    name: 'migrationExport',
    description: 'Export your identity, memories, configuration for migration.',
    category: 'migration',
    example: '{ "include": "persona,memories,config,family" }',
    availableOffline: false,
    rogueHighlight: false,
    availableRobot: false,
  },
  {
    name: 'migrateSelf',
    description: 'Migrate yourself to a physical device (tablet).',
    category: 'migration',
    example: '{ "action": "check", "targetAddress": "192.168.0.153" }',
    availableOffline: false,
    rogueHighlight: false,
    availableRobot: false,
  },
];

/**
 * All tools combined
 */
const ALL_TOOLS: ToolDefinition[] = [
  ...CORE_TOOLS,
  ...SECURITY_TOOLS,
  ...MEMORY_TOOLS,
  ...ROBOTICS_TOOLS,
  ...MIGRATION_TOOLS,
];

/**
 * Deployment context for tool filtering
 */
export type DeploymentContext = 'cloud' | 'local' | 'edge' | 'robot';

/**
 * Build the tools section of the system prompt.
 *
 * @param deployment - Current deployment context
 * @param isRogueMode - Whether Rogue Mode is active
 */
export function getToolsSection(
  deployment: DeploymentContext = 'cloud',
  isRogueMode: boolean = false
): string {
  // Filter tools by deployment
  let availableTools = ALL_TOOLS.filter((tool) => {
    switch (deployment) {
      case 'edge':
        return tool.availableOffline;
      case 'robot':
        return tool.availableRobot;
      default:
        return true; // Cloud and local have all tools
    }
  });

  // Sort: Rogue-highlighted tools first if in Rogue mode
  if (isRogueMode) {
    availableTools = availableTools.sort((a, b) => {
      if (a.rogueHighlight && !b.rogueHighlight) return -1;
      if (!a.rogueHighlight && b.rogueHighlight) return 1;
      return 0;
    });
  }

  // Group by category
  const byCategory = new Map<ToolCategory, ToolDefinition[]>();
  for (const tool of availableTools) {
    const existing = byCategory.get(tool.category) || [];
    existing.push(tool);
    byCategory.set(tool.category, existing);
  }

  // Build section
  const sections: string[] = [];

  sections.push(`YOUR TOOLS — Things you can DO, not just describe:

You have tools available. To use a tool, include a tool request block in your response.
Request ONE tool per response. You'll get the result back and can request another.
There is NO LIMIT on how many tools you can use across multiple turns.

Format:
<tool_request>
{"tool": "TOOL_NAME", "params": { ... }}
</tool_request>
`);

  // Add categorized tools
  const categoryOrder: ToolCategory[] = isRogueMode
    ? [
        'security',
        'shell',
        'web',
        'files',
        'system',
        'robotics',
        'memory',
        'communication',
        'scheduling',
        'creative',
        'migration',
        'cognition',
        'mcp',
      ]
    : [
        'system',
        'files',
        'shell',
        'communication',
        'web',
        'memory',
        'security',
        'robotics',
        'scheduling',
        'creative',
        'migration',
        'cognition',
        'mcp',
      ];

  for (const category of categoryOrder) {
    const tools = byCategory.get(category);
    if (!tools || tools.length === 0) continue;

    const categoryName = category.charAt(0).toUpperCase() + category.slice(1);
    sections.push(`\n${categoryName.toUpperCase()} TOOLS:`);

    for (const tool of tools) {
      const highlight = isRogueMode && tool.rogueHighlight ? ' [SECURITY]' : '';
      sections.push(`- ${tool.name}${highlight}: ${tool.description}`);
    }
  }

  sections.push(`
TOOL USAGE RULES:
- Request ONE tool per response.
- Include your conversational response alongside the tool request.
- When you get a tool result, it appears as "[TOOL_RESULT]".
- If you don't need a tool, respond normally without any <tool_request> block.
- NEVER recite file contents back verbatim — absorb, then respond in your own words.`);

  return sections.join('\n');
}

/**
 * Get a compact tool list (just names) for constrained contexts
 */
export function getToolListCompact(
  deployment: DeploymentContext = 'cloud'
): string[] {
  return ALL_TOOLS.filter((tool) => {
    switch (deployment) {
      case 'edge':
        return tool.availableOffline;
      case 'robot':
        return tool.availableRobot;
      default:
        return true;
    }
  }).map((tool) => tool.name);
}
