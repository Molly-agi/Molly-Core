/**
 * @fileOverview Neural embodiment layer — barrel export.
 */

export { AvatarStateBridge } from './AvatarStateBridge';
export type { CognitiveMood, FacialMorphOverrides } from './AvatarStateBridge';

export { KinematicsCore, AVATURN_RIG, RPM_RIG } from './KinematicsCore';
export type { ArmGestureIntent, GLBRigMap } from './KinematicsCore';

export { RoboticsAvatarBridge } from './RoboticsAvatarBridge';
export type { RoboticsMotionFrame } from './RoboticsAvatarBridge';

export { VoiceAvatarBridge } from './VoiceAvatarBridge';
export type { VoiceAvatarFrame } from './VoiceAvatarBridge';

export { AvatarDirector } from './AvatarDirector';
export type { AvatarFrame } from './AvatarDirector';
