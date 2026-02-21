/** When thrown, the callee restores the AST to the previous state. */
export class ControlFlowRollback extends Error {}

/** When thrown, the callee stops execution and rethrows the error up. */
export class ControlFlowBreak extends Error {}
