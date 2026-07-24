// Calling React's act() outside RTL wrappers requires this flag; RTL only sets it inside its own
// APIs when framework globals are off, so runners like WebStorm's warn without it.
// https://react.dev/reference/react/act#error-the-current-testing-environment-is-not-configured-to-support-act
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
