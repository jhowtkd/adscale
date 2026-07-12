export const CREATE_POST_HREF = "/quick-tools/create-post";

export type CreatePostQuickToolCopy = {
  id: "quick-tool-create-post";
  icon: string;
  name: string;
  desc: string;
  count: string;
  href: typeof CREATE_POST_HREF;
};

export function buildCreatePostQuickTool(
  t: (key: "createPostName" | "createPostDescription" | "createPostCount") => string
): CreatePostQuickToolCopy {
  return {
    id: "quick-tool-create-post",
    icon: "✦",
    name: t("createPostName"),
    desc: t("createPostDescription"),
    count: t("createPostCount"),
    href: CREATE_POST_HREF,
  };
}
