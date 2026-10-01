export type LibraryAssetKind = "reference" | "logo" | "photo" | "generated" | "page" | "post";

/** The same ordered classification drives SQL filters and browser rendering. */
export function classifyLibraryAsset<Predicate, Result>(
  matches: { logo: Predicate; page: Predicate; post: Predicate; generated: Predicate; legacyLogo: Predicate; photo: Predicate },
  choose: (cases: ReadonlyArray<readonly [Predicate, LibraryAssetKind]>, fallback: LibraryAssetKind) => Result,
): Result {
  return choose([
    [matches.logo, "logo"],
    [matches.page, "page"],
    [matches.post, "post"],
    [matches.generated, "generated"],
    [matches.legacyLogo, "logo"],
    [matches.photo, "photo"],
  ], "reference");
}
