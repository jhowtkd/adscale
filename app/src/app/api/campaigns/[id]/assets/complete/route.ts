import { objectStorage } from "@/server/storage";
import { createPostHandler } from "./handler";

export const POST = createPostHandler({ storage: objectStorage });
