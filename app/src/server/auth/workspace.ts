import { getSession, getSessionFromHeaders } from "./session";
import { getWorkspaceForUser } from "../repositories/workspace";

export async function requireWorkspaceAccess(request?: Request) {
  const session = request
    ? await getSessionFromHeaders(request.headers)
    : await getSession();

  if (!session) {
    throw new Error("Unauthorized");
  }

  const workspace = await getWorkspaceForUser(session.user.id);
  if (!workspace) {
    throw new Error("No workspace");
  }

  return { user: session.user, workspace };
}
