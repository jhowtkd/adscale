// dispatch_publication (#548): the system dispatch job claimed a due
// intent; this command revalidates the FULL domain publication gate at send
// time and calls the Publisher port. Fail → held (with reasons) or
// missed_window past the item time; never a send.
//
// Split by phase — this file only re-exports the public surface:
// dispatch-gate (gate + claim), dispatch-outcomes (failed/verifying/
// published writers + attempt record), dispatch-send (two-step send).

export * from "./dispatch-gate";
export * from "./dispatch-outcomes";
export * from "./dispatch-send";
