import { eq } from "drizzle-orm";
import { db } from "../db";
import { user } from "../db/schema";

export interface UserProfileRow {
  id: string;
  name: string;
  bio: string | null;
  timezone: string | null;
  image: string | null;
}

export interface UserProfileResponse {
  firstName: string;
  lastName: string;
  email: string;
  bio: string;
  timezone: string;
  avatarUrl: string | null;
}

export interface UpdateUserProfileInput {
  firstName?: string;
  lastName?: string;
  bio?: string;
  timezone?: string;
}

function splitName(name: string): { firstName: string; lastName: string } {
  const trimmed = name.trim();
  if (!trimmed) {
    return { firstName: "", lastName: "" };
  }

  const spaceIndex = trimmed.indexOf(" ");
  if (spaceIndex === -1) {
    return { firstName: trimmed, lastName: "" };
  }

  return {
    firstName: trimmed.slice(0, spaceIndex),
    lastName: trimmed.slice(spaceIndex + 1).trim(),
  };
}

function joinName(firstName?: string, lastName?: string): string | undefined {
  if (firstName === undefined && lastName === undefined) {
    return undefined;
  }

  const first = (firstName ?? "").trim();
  const last = (lastName ?? "").trim();
  return [first, last].filter(Boolean).join(" ");
}

export function toUserProfileResponse(
  row: UserProfileRow,
  email: string
): UserProfileResponse {
  const { firstName, lastName } = splitName(row.name);
  return {
    firstName,
    lastName,
    email,
    bio: row.bio ?? "",
    timezone: row.timezone ?? "",
    avatarUrl: row.image,
  };
}

export async function getUserProfile(userId: string): Promise<UserProfileRow | null> {
  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      bio: user.bio,
      timezone: user.timezone,
      image: user.image,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  return rows[0] ?? null;
}

export async function updateUserProfile(
  userId: string,
  input: UpdateUserProfileInput
): Promise<UserProfileRow> {
  const updates: {
    name?: string;
    bio?: string;
    timezone?: string;
    updatedAt: Date;
  } = {
    updatedAt: new Date(),
  };

  const joinedName = joinName(input.firstName, input.lastName);
  if (joinedName !== undefined) {
    updates.name = joinedName;
  }
  if (input.bio !== undefined) {
    updates.bio = input.bio;
  }
  if (input.timezone !== undefined) {
    updates.timezone = input.timezone;
  }

  const rows = await db
    .update(user)
    .set(updates)
    .where(eq(user.id, userId))
    .returning({
      id: user.id,
      name: user.name,
      bio: user.bio,
      timezone: user.timezone,
      image: user.image,
    });

  const updated = rows[0];
  if (!updated) {
    throw new Error("User not found");
  }

  return updated;
}

export async function updateUserAvatar(
  userId: string,
  avatarUrl: string
): Promise<string> {
  await db
    .update(user)
    .set({ image: avatarUrl, updatedAt: new Date() })
    .where(eq(user.id, userId));

  return avatarUrl;
}
