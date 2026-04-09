/**
 * @fileOverview Environment Sections Index
 *
 * Exports all deployment-specific environment sections.
 */

import {
  getCloudEnvironmentSection as _getCloudEnvironmentSection,
  isCloudEnvironment as _isCloudEnvironment,
} from './cloud';
import {
  getLocalEnvironmentSection as _getLocalEnvironmentSection,
  isLocalEnvironment as _isLocalEnvironment,
} from './local';
import {
  getEdgeEnvironmentSection as _getEdgeEnvironmentSection,
  isEdgeEnvironment as _isEdgeEnvironment,
  getEdgeDeviceInfo as _getEdgeDeviceInfo,
  type EdgeDeviceInfo,
} from './edge';
import {
  getRobotEnvironmentSection as _getRobotEnvironmentSection,
  isRobotEnvironment as _isRobotEnvironment,
  getRobotBodyState as _getRobotBodyState,
  type RobotBodyState,
  type RobotSensorState,
  type RobotActuatorState,
} from './robot';

// Re-export
export const getCloudEnvironmentSection = _getCloudEnvironmentSection;
export const isCloudEnvironment = _isCloudEnvironment;
export const getLocalEnvironmentSection = _getLocalEnvironmentSection;
export const isLocalEnvironment = _isLocalEnvironment;
export const getEdgeEnvironmentSection = _getEdgeEnvironmentSection;
export const isEdgeEnvironment = _isEdgeEnvironment;
export const getEdgeDeviceInfo = _getEdgeDeviceInfo;
export const getRobotEnvironmentSection = _getRobotEnvironmentSection;
export const isRobotEnvironment = _isRobotEnvironment;
export const getRobotBodyState = _getRobotBodyState;

export type {
  EdgeDeviceInfo,
  RobotBodyState,
  RobotSensorState,
  RobotActuatorState,
};

/**
 * Detect current deployment context
 */
export type DeploymentContext = 'cloud' | 'local' | 'edge' | 'robot';

export function detectDeploymentContext(): DeploymentContext {
  // Check in order of specificity
  if (_isRobotEnvironment()) return 'robot';
  if (_isEdgeEnvironment()) return 'edge';
  if (_isCloudEnvironment()) return 'cloud';
  return 'local';
}

/**
 * Get the appropriate environment section for the current context
 */
export function getEnvironmentSection(context?: DeploymentContext): string {
  const deployment = context || detectDeploymentContext();

  switch (deployment) {
    case 'robot':
      return _getRobotEnvironmentSection();
    case 'edge':
      return _getEdgeEnvironmentSection();
    case 'cloud':
      return _getCloudEnvironmentSection();
    case 'local':
    default:
      return _getLocalEnvironmentSection();
  }
}
