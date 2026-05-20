/**
 * @fileOverview Composers Index
 *
 * Exports all prompt composers.
 */

export {
  composeSystemPrompt,
  composeMinimalPrompt,
  clearComposerCache,
  onRogueModeChanged,
  onDeploymentChanged,
  type ComposerContext,
  type InjectionContext,
} from './base-composer';

// Future composers:
// export { composeDreamPrompt } from './dream-composer';
// export { composeEdgePrompt } from './edge-composer';
// export { composeRobotPrompt } from './robot-composer';
