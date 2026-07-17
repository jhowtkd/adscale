import LegacyCreatePostRedirect, {
  type LegacyCreatePostSearchParams,
} from "./LegacyCreatePostRedirect";

export default async function CreatePostPage({
  searchParams,
}: {
  searchParams: Promise<LegacyCreatePostSearchParams>;
}) {
  return <LegacyCreatePostRedirect searchParams={await searchParams} />;
}
