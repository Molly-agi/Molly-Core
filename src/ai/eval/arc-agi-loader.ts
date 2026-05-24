/**
 * ARC-AGI Dataset Loader
 * Loads and manages Abstraction and Reasoning Corpus tasks
 * Each task: infer pattern from input→output pairs, apply to test case
 * 
 * Dataset structure:
 * - train: [{ input: Grid, output: Grid }, ...] (3-5 examples)
 * - test: [{ input: Grid }, ...] (1-3 test cases, answers withheld)
 * 
 * Grid: 2D array of integers (0-9, colors)
 */

export interface Grid {
  grid: number[][];
  width: number;
  height: number;
}

export interface TrainExample {
  input: Grid;
  output: Grid;
}

export interface TestCase {
  input: Grid;
}

export interface ArcAgiTask {
  id: string;
  benchmark: 'arc-agi';
  train: TrainExample[];
  test: TestCase[];
  difficulty?: 'easy' | 'medium' | 'hard'; // Not always available
}

export interface ArcAgiExample {
  id: string;
  benchmark: 'arc-agi';
  taskId: string;
  input: {
    train: TrainExample[];
    testInput: Grid;
  };
  expectedOutput?: {
    testOutput: Grid;
  };
  metadata?: {
    difficulty?: string;
    source?: string;
    solvedByHumans?: number;
  };
}

/**
 * Parse raw ARC-AGI JSON format to internal structure
 */
function parseArcTask(taskId: string, rawTask: any): ArcAgiTask {
  const parseGrid = (grid: number[][]): Grid => ({
    grid,
    width: grid[0]?.length || 0,
    height: grid.length,
  });

  return {
    id: taskId,
    benchmark: 'arc-agi',
    train: (rawTask.train || []).map((example: any) => ({
      input: parseGrid(example.input),
      output: parseGrid(example.output),
    })),
    test: (rawTask.test || []).map((example: any) => ({
      input: parseGrid(example.input),
    })),
    difficulty: rawTask.difficulty as any,
  };
}

/**
 * Load ARC-AGI dataset from JSON
 */
export async function loadArcAgiDataset(
  filePath: string = 'arc_agi_sample.json'
): Promise<ArcAgiExample[]> {
  try {
    const fs = await import('fs').then(m => m.promises);
    const content = await fs.readFile(filePath, 'utf-8');
    const rawData = JSON.parse(content);

    const examples: ArcAgiExample[] = [];

    // Handle both array and object formats
    const tasks = Array.isArray(rawData) ? rawData : Object.entries(rawData);

    let index = 0;
    for (const [taskId, taskData] of (tasks as any)) {
      const actualTaskId = typeof taskId === 'string' ? taskId : `task_${index}`;
      const parsedTask = parseArcTask(actualTaskId, taskData);

      // Create one example per test case in the task
      for (let testIdx = 0; testIdx < parsedTask.test.length; testIdx++) {
        const testCase = parsedTask.test[testIdx];
        examples.push({
          id: `${actualTaskId}_test_${testIdx}`,
          benchmark: 'arc-agi',
          taskId: actualTaskId,
          input: {
            train: parsedTask.train,
            testInput: testCase.input,
          },
          metadata: {
            difficulty: parsedTask.difficulty,
          },
        });
      }

      index++;
    }

    console.log(`✓ Loaded ${examples.length} ARC-AGI test cases from ${Object.keys(rawData).length} tasks`);
    return examples;
  } catch (error) {
    console.error(`❌ Failed to load ARC-AGI dataset from ${filePath}:`, error);
    throw error;
  }
}

/**
 * Get statistics about loaded dataset
 */
export function getArcAgiStats(examples: ArcAgiExample[]): {
  totalExamples: number;
  totalTasks: number;
  tasksCount: Record<string, number>;
  avgTrainExamples: number;
  difficultyBreakdown: Record<string, number>;
} {
  const uniqueTasks = new Set(examples.map(e => e.taskId));
  const taskStats: Record<string, number> = {};
  const difficultyStats: Record<string, number> = {};
  let totalTrainExamples = 0;

  examples.forEach(ex => {
    taskStats[ex.taskId] = (taskStats[ex.taskId] || 0) + 1;
    totalTrainExamples += ex.input.train.length;
    if (ex.metadata?.difficulty) {
      difficultyStats[ex.metadata.difficulty] = (difficultyStats[ex.metadata.difficulty] || 0) + 1;
    }
  });

  return {
    totalExamples: examples.length,
    totalTasks: uniqueTasks.size,
    tasksCount: taskStats,
    avgTrainExamples: totalTrainExamples / examples.length,
    difficultyBreakdown: difficultyStats,
  };
}

/**
 * Filter examples by difficulty
 */
export function filterByDifficulty(
  examples: ArcAgiExample[],
  difficulty: 'easy' | 'medium' | 'hard'
): ArcAgiExample[] {
  return examples.filter(ex => ex.metadata?.difficulty === difficulty);
}

/**
 * Sample random examples
 */
export function sampleExamples(examples: ArcAgiExample[], count: number): ArcAgiExample[] {
  const shuffled = [...examples].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, examples.length));
}

/**
 * Render grid as ASCII for debugging
 */
export function renderGrid(grid: Grid): string {
  const colorMap: Record<number, string> = {
    0: '⬛', // Black
    1: '🟦', // Blue
    2: '🟥', // Red
    3: '🟩', // Green
    4: '🟨', // Yellow
    5: '🟪', // Magenta
    6: '🟧', // Orange
    7: '⬜', // Gray
    8: '🟦', // Light blue
    9: '🟫', // Maroon
  };

  return grid.grid
    .map(row => row.map(cell => colorMap[cell] || '?').join(''))
    .join('\n');
}

/**
 * Compare two grids for equality
 */
export function gridsEqual(g1: Grid, g2: Grid): boolean {
  if (g1.width !== g2.width || g1.height !== g2.height) {
    return false;
  }

  for (let i = 0; i < g1.height; i++) {
    for (let j = 0; j < g1.width; j++) {
      if (g1.grid[i][j] !== g2.grid[i][j]) {
        return false;
      }
    }
  }

  return true;
}

export default {
  loadArcAgiDataset,
  getArcAgiStats,
  filterByDifficulty,
  sampleExamples,
  renderGrid,
  gridsEqual,
};
