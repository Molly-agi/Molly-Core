/**
 * @fileOverview Tests for Text-to-Script Flow
 *
 * Tests natural language to script generation including:
 * - Multi-language support
 * - Auto language detection
 * - Dependency detection
 * - Security scanning
 * - Memory integration
 * - Convenience functions
 */

// Mock dependencies before imports
jest.mock('../../logger', () => ({
  MollyLogger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    logFlowStart: jest.fn(),
    logFlowComplete: jest.fn(),
  },
  generateTraceId: jest.fn(() => 'test-trace-script'),
}));

jest.mock('../../genkit', () => ({
  ai: {
    defineFlow: jest.fn((config, handler) => handler),
  },
  molly: {
    generate: jest.fn(),
  },
  TaskType: {
    CODE: 'code',
    CHAT: 'chat',
  },
}));

jest.mock('../../tools/memory', () => ({
  recallExperiences: jest.fn(),
}));

jest.mock('@/firebase/firestore/agent-memory', () => ({
  recordCodeModification: jest.fn(),
}));

jest.mock('../../tools/timeout-retry', () => ({
  withTimeout: jest.fn((fn) => fn()),
}));

import { molly } from '../../genkit';
import { recallExperiences } from '../../tools/memory';
import { recordCodeModification } from '@/firebase/firestore/agent-memory';

const mockMollyGenerate = molly.generate as jest.Mock;
const mockRecallExperiences = recallExperiences as jest.Mock;
const mockRecordCodeModification = recordCodeModification as jest.Mock;

describe('Text to Script Flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRecallExperiences.mockResolvedValue([]);
    mockRecordCodeModification.mockResolvedValue(undefined);
  });

  describe('Script Generation', () => {
    it('generates script from natural language', async () => {
      mockMollyGenerate
        .mockResolvedValueOnce({
          text: '#!/bin/bash\necho "Hello World"',
        })
        .mockResolvedValueOnce({
          text: 'A simple hello world script.',
        });

      const { textToScriptFlow } = await import('../text-to-script');

      const result = await textToScriptFlow({
        goal: 'print hello world',
        language: 'bash',
        documented: true,
        robust: true,
        environment: 'linux',
        complexityLimit: 7,
      });

      expect(result.success).toBe(true);
      expect(result.content).toContain('echo');
      expect(result.language).toBe('bash');
    });

    it('extracts content from markdown code blocks', async () => {
      mockMollyGenerate
        .mockResolvedValueOnce({
          text: '```python\nprint("Test")\n```',
        })
        .mockResolvedValueOnce({ text: 'Prints test.' });

      const { textToScriptFlow } = await import('../text-to-script');

      const result = await textToScriptFlow({
        goal: 'print test',
        language: 'python',
        documented: true,
        robust: true,
        environment: 'linux',
        complexityLimit: 7,
      });

      expect(result.content).not.toContain('```');
    });
  });

  describe('Language Support', () => {
    const languages = [
      'bash',
      'python',
      'javascript',
      'typescript',
      'ruby',
      'perl',
      'powershell',
    ] as const;

    it.each(languages)('supports %s language', async (lang) => {
      mockMollyGenerate
        .mockResolvedValueOnce({
          text: `# ${lang} script\nprint("hello")`,
        })
        .mockResolvedValueOnce({ text: 'Explanation' });

      const { textToScriptFlow } = await import('../text-to-script');

      const result = await textToScriptFlow({
        goal: 'hello world',
        language: lang,
        documented: true,
        robust: true,
        environment: 'linux',
        complexityLimit: 7,
      });

      expect(result.language).toBe(lang);
      expect(result.success).toBe(true);
    });
  });

  describe('Auto Language Detection', () => {
    it('selects python for data/ML tasks', async () => {
      mockMollyGenerate
        .mockResolvedValueOnce({
          text: 'import pandas as pd\ndf = pd.read_csv("data.csv")',
        })
        .mockResolvedValueOnce({ text: 'Reads CSV data.' });

      const { textToScriptFlow } = await import('../text-to-script');

      const result = await textToScriptFlow({
        goal: 'load data from csv using pandas',
        language: 'auto',
        documented: true,
        robust: true,
        environment: 'linux',
        complexityLimit: 7,
      });

      expect(result.language).toBe('python');
    });

    it('selects bash for file/system tasks', async () => {
      mockMollyGenerate
        .mockResolvedValueOnce({
          text: '#!/bin/bash\ncp -r /src /backup',
        })
        .mockResolvedValueOnce({ text: 'Backs up files.' });

      const { textToScriptFlow } = await import('../text-to-script');

      const result = await textToScriptFlow({
        goal: 'backup my files to another directory',
        language: 'auto',
        documented: true,
        robust: true,
        environment: 'linux',
        complexityLimit: 7,
      });

      expect(result.language).toBe('bash');
    });

    it('selects javascript for node/npm tasks', async () => {
      mockMollyGenerate
        .mockResolvedValueOnce({
          text: 'const express = require("express");',
        })
        .mockResolvedValueOnce({ text: 'Express server.' });

      const { textToScriptFlow } = await import('../text-to-script');

      const result = await textToScriptFlow({
        goal: 'create an express web server with npm',
        language: 'auto',
        documented: true,
        robust: true,
        environment: 'linux',
        complexityLimit: 7,
      });

      expect(result.language).toBe('javascript');
    });

    it('selects powershell for windows', async () => {
      mockMollyGenerate
        .mockResolvedValueOnce({
          text: 'Get-Process',
        })
        .mockResolvedValueOnce({ text: 'Lists processes.' });

      const { textToScriptFlow } = await import('../text-to-script');

      const result = await textToScriptFlow({
        goal: 'list processes',
        language: 'auto',
        documented: true,
        robust: true,
        environment: 'windows',
        complexityLimit: 7,
      });

      expect(result.language).toBe('powershell');
    });
  });

  describe('Dependency Detection', () => {
    it('detects Python dependencies', async () => {
      mockMollyGenerate
        .mockResolvedValueOnce({
          text: 'import requests\nimport numpy as np\nrequests.get("url")',
        })
        .mockResolvedValueOnce({ text: 'Makes HTTP requests.' });

      const { textToScriptFlow } = await import('../text-to-script');

      const result = await textToScriptFlow({
        goal: 'make http request',
        language: 'python',
        documented: true,
        robust: true,
        environment: 'linux',
        complexityLimit: 7,
      });

      expect(result.dependencies).toContain('requests');
      expect(result.dependencies).toContain('numpy');
      expect(result.installCommands).toBeDefined();
      expect(result.installCommands?.[0]).toContain('pip install');
    });

    it('detects JavaScript dependencies', async () => {
      mockMollyGenerate
        .mockResolvedValueOnce({
          text: 'const axios = require("axios");\nconst lodash = require("lodash");',
        })
        .mockResolvedValueOnce({ text: 'Uses axios and lodash.' });

      const { textToScriptFlow } = await import('../text-to-script');

      const result = await textToScriptFlow({
        goal: 'make http request',
        language: 'javascript',
        documented: true,
        robust: true,
        environment: 'linux',
        complexityLimit: 7,
      });

      expect(result.dependencies).toContain('axios');
      expect(result.dependencies).toContain('lodash');
      expect(result.installCommands?.[0]).toContain('npm install');
    });

    it('ignores standard library imports', async () => {
      mockMollyGenerate
        .mockResolvedValueOnce({
          text: 'import os\nimport sys\nimport json',
        })
        .mockResolvedValueOnce({ text: 'Uses stdlib.' });

      const { textToScriptFlow } = await import('../text-to-script');

      const result = await textToScriptFlow({
        goal: 'work with files',
        language: 'python',
        documented: true,
        robust: true,
        environment: 'linux',
        complexityLimit: 7,
      });

      expect(result.dependencies || []).not.toContain('os');
      expect(result.dependencies || []).not.toContain('sys');
    });
  });

  describe('Security Scanning', () => {
    it('warns about eval usage', async () => {
      mockMollyGenerate
        .mockResolvedValueOnce({
          text: 'eval(user_input)',
        })
        .mockResolvedValueOnce({ text: 'Evaluates input.' });

      const { textToScriptFlow } = await import('../text-to-script');

      const result = await textToScriptFlow({
        goal: 'execute user code',
        language: 'python',
        documented: true,
        robust: true,
        environment: 'linux',
        complexityLimit: 7,
      });

      expect(result.securityNotes).toBeDefined();
      expect(result.securityNotes?.some((n) => n.includes('eval'))).toBe(true);
    });

    it('warns about hardcoded passwords', async () => {
      mockMollyGenerate
        .mockResolvedValueOnce({
          text: 'password = "secret123"',
        })
        .mockResolvedValueOnce({ text: 'Sets password.' });

      const { textToScriptFlow } = await import('../text-to-script');

      const result = await textToScriptFlow({
        goal: 'login script',
        language: 'python',
        documented: true,
        robust: true,
        environment: 'linux',
        complexityLimit: 7,
      });

      expect(result.securityNotes?.some((n) => n.includes('password'))).toBe(
        true
      );
    });

    it('warns about curl piped to shell', async () => {
      mockMollyGenerate
        .mockResolvedValueOnce({
          text: 'curl https://example.com/install.sh | bash',
        })
        .mockResolvedValueOnce({ text: 'Installs something.' });

      const { textToScriptFlow } = await import('../text-to-script');

      const result = await textToScriptFlow({
        goal: 'install remote script',
        language: 'bash',
        documented: true,
        robust: true,
        environment: 'linux',
        complexityLimit: 7,
      });

      expect(result.securityNotes?.some((n) => n.includes('shell'))).toBe(true);
    });
  });

  describe('Filename Generation', () => {
    it('generates descriptive filename', async () => {
      mockMollyGenerate
        .mockResolvedValueOnce({
          text: 'print("test")',
        })
        .mockResolvedValueOnce({ text: 'Test script.' });

      const { textToScriptFlow } = await import('../text-to-script');

      const result = await textToScriptFlow({
        goal: 'backup my database daily',
        language: 'python',
        documented: true,
        robust: true,
        environment: 'linux',
        complexityLimit: 7,
      });

      expect(result.filename).toContain('backup');
      expect(result.filename).toMatch(/\.py$/);
    });

    const extensionTests = [
      ['bash', 'sh'],
      ['python', 'py'],
      ['javascript', 'js'],
      ['typescript', 'ts'],
      ['ruby', 'rb'],
    ] as const;

    it.each(extensionTests)(
      'uses .%s extension for %s language',
      async (lang, ext) => {
        mockMollyGenerate
          .mockResolvedValueOnce({ text: `# ${lang} code\nprint("test")` })
          .mockResolvedValueOnce({ text: 'Explanation' });

        const { textToScriptFlow } = await import('../text-to-script');

        const result = await textToScriptFlow({
          goal: 'test script',
          language: lang,
          documented: true,
          robust: true,
          environment: 'linux',
          complexityLimit: 7,
        });

        expect(result.extension).toBe(ext);
      }
    );
  });

  describe('Memory Integration', () => {
    it('recalls related past scripts', async () => {
      mockRecallExperiences.mockResolvedValue([
        {
          suggestion: 'Previous backup script',
          context: 'script python backup',
        },
      ]);

      mockMollyGenerate
        .mockResolvedValueOnce({
          text: 'import shutil\nshutil.copy(...)',
        })
        .mockResolvedValueOnce({ text: 'Copies files.' });

      const { textToScriptFlow } = await import('../text-to-script');

      const result = await textToScriptFlow({
        goal: 'backup script',
        language: 'python',
        userId: 'test-user',
        documented: true,
        robust: true,
        environment: 'linux',
        complexityLimit: 7,
      });

      expect(mockRecallExperiences).toHaveBeenCalled();
      expect(result.relatedScripts).toBeDefined();
    });

    it('saves script to memory', async () => {
      mockMollyGenerate
        .mockResolvedValueOnce({
          text: 'print("hello")',
        })
        .mockResolvedValueOnce({ text: 'Hello script.' });

      const { textToScriptFlow } = await import('../text-to-script');

      await textToScriptFlow({
        goal: 'hello world',
        language: 'python',
        userId: 'test-user',
        documented: true,
        robust: true,
        environment: 'linux',
        complexityLimit: 7,
      });

      expect(mockRecordCodeModification).toHaveBeenCalledWith(
        'test-user',
        'SCRIPT_GENERATION',
        expect.any(String),
        expect.stringContaining('Generated python script')
      );
    });
  });

  describe('Convenience Functions', () => {
    beforeEach(() => {
      mockMollyGenerate
        .mockResolvedValueOnce({ text: 'echo "test"' })
        .mockResolvedValueOnce({ text: 'Test script.' });
    });

    it('textToScript() returns filename and content', async () => {
      const { textToScript } = await import('../text-to-script');

      const result = await textToScript('hello world');

      expect(result).toHaveProperty('filename');
      expect(result).toHaveProperty('content');
    });

    it('generateBashScript() creates bash script', async () => {
      const { generateBashScript } = await import('../text-to-script');

      const result = await generateBashScript('list files');

      expect(result.language).toBe('bash');
    });

    it('generatePythonScript() creates python script', async () => {
      mockMollyGenerate.mockReset();
      mockMollyGenerate
        .mockResolvedValueOnce({ text: 'print("hello")' })
        .mockResolvedValueOnce({ text: 'Hello script.' });

      const { generatePythonScript } = await import('../text-to-script');

      const result = await generatePythonScript('print hello');

      expect(result.language).toBe('python');
    });

    it('generateTermuxScript() uses termux environment', async () => {
      mockMollyGenerate.mockReset();
      mockMollyGenerate
        .mockResolvedValueOnce({ text: 'termux-setup-storage' })
        .mockResolvedValueOnce({ text: 'Sets up storage.' });

      const { generateTermuxScript } = await import('../text-to-script');

      const result = await generateTermuxScript('setup storage');

      expect(result.language).toBe('bash');
    });

    it('generateCrossPlatformScript() uses python', async () => {
      mockMollyGenerate.mockReset();
      mockMollyGenerate
        .mockResolvedValueOnce({ text: 'import os\nos.name' })
        .mockResolvedValueOnce({ text: 'Gets OS.' });

      const { generateCrossPlatformScript } = await import('../text-to-script');

      const result = await generateCrossPlatformScript('detect os');

      expect(result.language).toBe('python');
    });
  });

  describe('Error Handling', () => {
    it('returns error on LLM failure', async () => {
      mockMollyGenerate.mockRejectedValue(new Error('LLM unavailable'));

      const { textToScriptFlow } = await import('../text-to-script');

      const result = await textToScriptFlow({
        goal: 'some script',
        language: 'python',
        documented: true,
        robust: true,
        environment: 'linux',
        complexityLimit: 7,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.content).toBe('');
    });

    it('adds shebang to empty content but still generates output', async () => {
      mockMollyGenerate
        .mockResolvedValueOnce({
          text: '',
        })
        .mockResolvedValueOnce({ text: 'Empty script with shebang.' });

      const { textToScriptFlow } = await import('../text-to-script');

      const result = await textToScriptFlow({
        goal: 'empty script',
        language: 'bash',
        documented: true,
        robust: true,
        environment: 'linux',
        complexityLimit: 7,
      });

      // Empty content gets shebang added, making it valid
      expect(result.content).toContain('#!/bin/bash');
    });
  });

  describe('Confidence Estimation', () => {
    it('higher confidence for longer, structured scripts', async () => {
      mockMollyGenerate
        .mockResolvedValueOnce({
          text: `#!/usr/bin/env python3
def main():
    try:
        do_something()
    except Exception as e:
        print(e)

if __name__ == "__main__":
    main()`,
        })
        .mockResolvedValueOnce({ text: 'Main script.' });

      const { textToScriptFlow } = await import('../text-to-script');

      const result = await textToScriptFlow({
        goal: 'structured script',
        language: 'python',
        documented: true,
        robust: true,
        environment: 'linux',
        complexityLimit: 7,
      });

      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('lower confidence for minimal scripts', async () => {
      mockMollyGenerate
        .mockResolvedValueOnce({
          text: 'x',
        })
        .mockResolvedValueOnce({ text: 'Minimal.' });

      const { textToScriptFlow } = await import('../text-to-script');

      const result = await textToScriptFlow({
        goal: 'minimal',
        language: 'python',
        documented: true,
        robust: true,
        environment: 'linux',
        complexityLimit: 7,
      });

      // Very short content that still passes validation
      expect(result.confidence).toBeLessThanOrEqual(0.7);
    });
  });
});
