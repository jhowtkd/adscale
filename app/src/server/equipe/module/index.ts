// Public surface of the Equipe module ("Operação da conta").
// Adapters call executeCommand + the queries; tests use ./testing.

export * from "./ports";
export * from "./envelope";
export * from "./equipe-enabled";
export * from "./shared";
export * from "./commands";
export * from "./queries";
export * from "./open-account";
// #582 — internal open-account candidates query.
export * from "./open-account-candidates";
export * from "./platform-owner-staff";
export * from "./scope-materials";
export * from "./context";
export * from "./plan-mandate";
// #584 — staff-proposed mandate activation.
export * from "./mandate-activation";
export * from "./ideas-decide";
export * from "./onboarding";
export * from "./item-shared";
export * from "./items-deliver";
export * from "./items-approve";
export * from "./items-adjust";
export * from "./items-choose";
export * from "./items-deadline";
// #551
export * from "./threads";
// #547 — escalonamentos, exceções de atendimento e pausas.
export * from "./escalations";
export * from "./exceptions";
export * from "./pauses";
export * from "./escalation-queries";
// #583 — parada global de publicações sem deploy.
export * from "./global-stop";
// Calibration (#546)
export * from "./calibration-shared";
export * from "./calibration-conference";
export * from "./calibration-round-access";
export * from "./calibration-open-close";
export * from "./calibration-scoring";
export * from "./calibration-classify";
export * from "./calibration-release";
export * from "./calibration-queries";
// #548 — despacho de publicação, conexão Instagram e publicação manual.
export * from "./publish-enabled";
export * from "./dispatch";
export * from "./reconcile";
export * from "./manual-publishing";
export * from "./removal";
export * from "./instagram-connect";
// #549 — jobs duráveis e notificações.
export * from "./jobs-reminders";
export * from "./jobs-deadlines";
export * from "./jobs-monitor";
export * from "./jobs-signals";
export * from "./jobs-delivery";
// Staff consoles (#554)
export * from "./staff-labels";
