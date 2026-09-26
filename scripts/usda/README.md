# USDA API experiments

Set `USDA_API_KEY` in the repository root's ignored `.env.local`, then run a
command below from the repository root. Node loads the environment file and
`tsx` runs TypeScript. No Next.js server is needed.

| Command                               | Request              | File                                                   |
| ------------------------------------- | -------------------- | ------------------------------------------------------ |
| `npm run test:usda:get-food`          | `GET /food/534358`   | [usda-get-food.ts](usda-get-food.ts)                   |
| `npm run test:usda:get-foods`         | `GET /foods`         | [usda-get-foods.ts](usda-get-foods.ts)                 |
| `npm run test:usda:post-foods`        | `POST /foods`        | [usda-post-foods.ts](usda-post-foods.ts)               |
| `npm run test:usda:get-foods-list`    | `GET /foods/list`    | [usda-get-foods-list.ts](usda-get-foods-list.ts)       |
| `npm run test:usda:post-foods-list`   | `POST /foods/list`   | [usda-post-foods-list.ts](usda-post-foods-list.ts)     |
| `npm run test:usda:get-foods-search`  | `GET /foods/search`  | [usda-get-foods-search.ts](usda-get-foods-search.ts)   |
| `npm run test:usda:post-foods-search` | `POST /foods/search` | [usda-post-foods-search.ts](usda-post-foods-search.ts) |
| `npm run test:usda:get-json-spec`     | `GET /json-spec`     | [usda-get-json-spec.ts](usda-get-json-spec.ts)         |
| `npm run test:usda:get-yaml-spec`     | `GET /yaml-spec`     | [usda-get-yaml-spec.ts](usda-get-yaml-spec.ts)         |

Each file exposes its request parameters and fetch call for experimentation.
`usda-utils.ts` shares key loading, HTTP status checks, and redacted error handling.
The original `usda-api-testing.ts` and `npm run test:usda` remain available as a scratchpad.

- GET filters go into URL query parameters; POST filters go into a JSON body.
  All these POST endpoints only retrieve information, not create or change records.
- Search uses `query`, and returns an object containing `foods` and pagination metadata.
- List and batch-details return arrays; single-food details return an object.
- Batch details accepts up to 20 IDs. Unrecognized IDs may be omitted.
- Start with search, then copy returned FDC IDs into the details examples. The
  default detail IDs come from documentation and are not guaranteed to remain available.
- List/search examples limit results to 10. Add `pageNumber` to experiment with pagination.
- Each command makes one real request, counts toward API limits, prints the result,
  and does not change USDA records. The get-food example saves a local JSON file. Requests time out after 15 seconds and failures exit nonzero.
- The specification endpoints print API documentation, not food data. YAML uses
  `response.text()` instead of `response.json()`.
- Keep `.env.local` private; never print the full request URL because it contains the key.

References: [USDA API guide](https://fdc.nal.usda.gov/api-guide/) and
[USDA-hosted specification](https://api.nal.usda.gov/fdc/v1/yaml-spec?api_key=DEMO_KEY).
These are manual experiments, not an automated test suite.

## Importing a reviewed ingredient

The search script accepts a search phrase:

```bash
npm run test:usda:get-foods-search -- "brown rice"
```

The get-food script accepts an ID, output path, and name. It saves an abridged
record, and overwrites the specified output file if it exists:

```bash
npm run test:usda:get-food -- 2512380 data/usda/foundation/brown-rice-raw.json "Rice, brown, long grain, unenriched, raw"
```

See `data/usda/foundation-manifest.json` for the 100 reviewed ingredient IDs and
`data/usda/README.md` for dataset coverage. No-argument get-food still selects
brown rice flour (1104812), not rice grains.
