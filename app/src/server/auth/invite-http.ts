import type { InviteErrorCode } from "./team";

const INVITE_ERROR_STATUS: Record<InviteErrorCode, number> = {
  inviteNotFound: 404,
  inviteRemoved: 410,
  inviteAlreadyAccepted: 409,
  inviteExpired: 410,
  inviteEmailMismatch: 403,
};

export function getInviteErrorHttpStatus(code: InviteErrorCode) {
  return INVITE_ERROR_STATUS[code];
}
