// Shared mutable mouse state — written by useInput, read by camera every frame
export const mouseState = {
  yaw: 0,
  pitch: 0,
};

// Shared mutable input state — written by useInput, read by entities every frame
export const inputState = {
  flashlightOn: false,
  batteryLevel: 1,       // 0–1
  batteryDepleted: false, // true when drained to 0, stays true until recharged to 20%
  jumpRequested: false,   // set true on Space press, consumed by gravity hook
};
