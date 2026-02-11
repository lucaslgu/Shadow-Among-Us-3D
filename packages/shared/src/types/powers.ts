export enum PowerType {
  METAMORPH = 'metamorph',
  INVISIBLE = 'invisible',
  TELEPORT = 'teleport',
  MEDIC = 'medic',
  TIME_CONTROLLER = 'time_controller',
  HACKER = 'hacker',
  FLASH = 'flash',
  NECROMANCER = 'necromancer',
  MIND_CONTROLLER = 'mind_controller',
}

export interface PowerConfig {
  type: PowerType;
  displayName: string;
  description: string;
  duration: number;
  cooldown: number;
  usesPerMatch: number;
  requiresTarget: boolean;
  requiresLocation: boolean;
}

export const POWER_CONFIGS: Record<PowerType, PowerConfig> = {
  [PowerType.METAMORPH]: {
    type: PowerType.METAMORPH,
    displayName: 'Metamorph',
    description: 'Copy another player\'s appearance for 30 seconds.',
    duration: 30000,
    cooldown: 60000,
    usesPerMatch: 1,
    requiresTarget: true,
    requiresLocation: false,
  },
  [PowerType.INVISIBLE]: {
    type: PowerType.INVISIBLE,
    displayName: 'Invisible',
    description: 'Become invisible for 15 seconds.',
    duration: 15000,
    cooldown: 45000,
    usesPerMatch: 1,
    requiresTarget: false,
    requiresLocation: false,
  },
  [PowerType.TELEPORT]: {
    type: PowerType.TELEPORT,
    displayName: 'Teleport',
    description: 'Instantly teleport to a selected room.',
    duration: 0,
    cooldown: 40000,
    usesPerMatch: 1,
    requiresTarget: false,
    requiresLocation: true,
  },
  [PowerType.MEDIC]: {
    type: PowerType.MEDIC,
    displayName: 'Medic',
    description: 'Revive a ghost or grant a protective shield.',
    duration: 0,
    cooldown: 60000,
    usesPerMatch: 1,
    requiresTarget: true,
    requiresLocation: false,
  },
  [PowerType.TIME_CONTROLLER]: {
    type: PowerType.TIME_CONTROLLER,
    displayName: 'Time Controller',
    description: 'Freeze all other players for 5 seconds.',
    duration: 5000,
    cooldown: 60000,
    usesPerMatch: 1,
    requiresTarget: false,
    requiresLocation: false,
  },
  [PowerType.HACKER]: {
    type: PowerType.HACKER,
    displayName: 'Hacker',
    description: 'Access security cameras and lock doors remotely.',
    duration: 20000,
    cooldown: 45000,
    usesPerMatch: 1,
    requiresTarget: false,
    requiresLocation: false,
  },
  [PowerType.FLASH]: {
    type: PowerType.FLASH,
    displayName: 'Flash',
    description: 'Triple your speed for 10 seconds.',
    duration: 10000,
    cooldown: 40000,
    usesPerMatch: 1,
    requiresTarget: false,
    requiresLocation: false,
  },
  [PowerType.NECROMANCER]: {
    type: PowerType.NECROMANCER,
    displayName: 'Necromancer',
    description: 'Spawn an NPC follower from a dead body.',
    duration: 0,
    cooldown: 60000,
    usesPerMatch: 1,
    requiresTarget: true,
    requiresLocation: false,
  },
  [PowerType.MIND_CONTROLLER]: {
    type: PowerType.MIND_CONTROLLER,
    displayName: 'Mind Controller',
    description: 'Take over another player\'s movement for 8 seconds.',
    duration: 8000,
    cooldown: 60000,
    usesPerMatch: 1,
    requiresTarget: true,
    requiresLocation: false,
  },
};
