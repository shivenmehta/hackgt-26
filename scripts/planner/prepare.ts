import { prepareCatalog } from "../../src/lib/meal-planning/catalog";
const args = process.argv.slice(2);
const at = args.indexOf("--limit");
prepareCatalog(
  at < 0 ? Infinity : Number(args[at + 1]),
  args.includes("--offline"),
)
  .then(console.log)
  .catch(() => {
    console.error(
      "Preparation failed. Check Grok credentials and source data; completed recipes remain cached.",
    );
    process.exitCode = 1;
  });
