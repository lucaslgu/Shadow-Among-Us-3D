export enum PowerType {
  METAMORPH = 'metamorph',
  INVISIBLE = 'invisible',
  TELEPORT = 'teleport',
  MEDIC = 'medic',
  HACKER = 'hacker',
  FLASH = 'flash',
  MIND_CONTROLLER = 'mind_controller',
  IMPERMEABLE = 'impermeable',
  MURALHA = 'muralha',
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
  targetRange?: number;
}

export const POWER_CONFIGS: Record<PowerType, PowerConfig> = {
  [PowerType.METAMORPH]: {
    type: PowerType.METAMORPH,
    displayName: 'Metamorph',
    description: 'Copy another player\'s appearance and power for 30 seconds.',
    duration: 30000,
    cooldown: 30000,
    usesPerMatch: 1,
    requiresTarget: true,
    requiresLocation: false,
    targetRange: 30,
  },
  [PowerType.INVISIBLE]: {
    type: PowerType.INVISIBLE,
    displayName: 'Invisible',
    description: 'Become invisible for 15 seconds.',
    duration: 15000,
    cooldown: 22000,
    usesPerMatch: 1,
    requiresTarget: false,
    requiresLocation: false,
  },
  [PowerType.TELEPORT]: {
    type: PowerType.TELEPORT,
    displayName: 'Teleport',
    description: 'Press Q to teleport where you aim (3 charges). Hold Q to open map and select destination.',
    duration: 0,
    cooldown: 20000,
    usesPerMatch: 3,
    requiresTarget: false,
    requiresLocation: false,
  },
  [PowerType.MEDIC]: {
    type: PowerType.MEDIC,
    displayName: 'Medic',
    description: 'Revive a ghost or grant a protective shield.',
    duration: 0,
    cooldown: 30000,
    usesPerMatch: 1,
    requiresTarget: true,
    requiresLocation: false,
    targetRange: 10,
  },
  [PowerType.IMPERMEABLE]: {
    type: PowerType.IMPERMEABLE,
    displayName: 'Impermeable',
    description: 'Pass through walls, immune to kills and all environmental damage for 10 seconds.',
    duration: 10000,
    cooldown: 22000,
    usesPerMatch: 1,
    requiresTarget: false,
    requiresLocation: false,
  },
  [PowerType.HACKER]: {
    type: PowerType.HACKER,
    displayName: 'Hacker',
    description: 'Go invisible and remotely control doors, pipes, lights and oxygen for 45 seconds.',
    duration: 45000,
    cooldown: 22000,
    usesPerMatch: 1,
    requiresTarget: false,
    requiresLocation: false,
  },
  [PowerType.FLASH]: {
    type: PowerType.FLASH,
    displayName: 'Flash',
    description: 'Triple your speed for 10 seconds.',
    duration: 10000,
    cooldown: 20000,
    usesPerMatch: 1,
    requiresTarget: false,
    requiresLocation: false,
  },
  [PowerType.MURALHA]: {
    type: PowerType.MURALHA,
    displayName: 'Rampart',
    description: 'Create up to 4 cement walls where you aim. Each wall blocks movement for 60 seconds. Charges recharge after cooldown.',
    duration: 60000,
    cooldown: 20000,
    usesPerMatch: 4,
    requiresTarget: false,
    requiresLocation: false,
  },
  [PowerType.MIND_CONTROLLER]: {
    type: PowerType.MIND_CONTROLLER,
    displayName: 'Mind Controller',
    description: 'Take over another player\'s movement for 20 seconds. Press E to use their power.',
    duration: 20000,
    cooldown: 30000,
    usesPerMatch: 1,
    requiresTarget: true,
    requiresLocation: false,
    targetRange: 30,
  },
};
