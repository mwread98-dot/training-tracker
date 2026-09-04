/**
 * Amplify's `list()` returns a single page. With a filter, DynamoDB scans up to
 * `limit` items and *then* applies the filter, so a filtered list can silently
 * omit matching records that sit beyond the first page — they come back only via
 * `nextToken`. Ignoring that token means newly created records appear to vanish,
 * because where a record falls in scan order depends on its random UUID key.
 *
 * This walks every page so callers always get the complete set.
 */
type ListPage<T> = {
  data: T[];
  nextToken?: string | null;
  errors?: readonly unknown[];
};

type ListOptions = {
  limit?: number;
  nextToken?: string | null;
};

// Large pages keep the round trips down; DynamoDB still caps a page at 1MB and
// hands back a nextToken when it truncates, which the loop below follows.
const PAGE_LIMIT = 1000;

// Stops a malformed or cyclic nextToken from looping forever.
const MAX_PAGES = 50;

export async function listAllPages<T>(
  listPage: (options: ListOptions) => Promise<ListPage<T>>
): Promise<{ data: T[]; errors?: readonly unknown[] }> {
  const all: T[] = [];
  let nextToken: string | null | undefined = undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await listPage({ limit: PAGE_LIMIT, nextToken });
    if (result.errors?.length) {
      return { data: all, errors: result.errors };
    }
    all.push(...result.data);
    nextToken = result.nextToken;
    if (!nextToken) break;
  }

  return { data: all };
}
