# Food planner — editable project plan

Updated: September 25, 2026  
Status: Draft for team editing  
Working name: TBD  
Team members: TBD / TBD

This is a proposed workflow, not a final specification. Change scope, owners,
and checkboxes as decisions are made. See [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md)
for background and [EVENT_PACKET.md](EVENT_PACKET.md) for sourced event details.

## 1. Goal

Help people choose nutritious food they enjoy within their food budget, combining
home cooking, grocery shopping, and restaurant alternatives.

**Primary audience:** people with limited or moderate food budgets.

**Example request:** “I have $65 for this week, like Indian and Mexican food,
already have rice, and only want to cook three times.”

**Desired result:** an understandable meal plan, a grocery basket with estimated
purchase cost, nutrition information, and options to adjust the plan.

## 2. Track alignment

| Target                                                 | What we intend to demonstrate                                                            | Still to confirm                                                           |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| A Marina's Mission — Aramco Americas social-good track | Practical access to affordable, nutritious food choices                                  | How we will demonstrate usefulness and measure estimated savings           |
| Visa — Reimagine Shopping with Generative AI           | AI-assisted food discovery, personalization, decisions, and a trusted payment experience | Sponsor sandbox access, required integration, and acceptable checkout demo |

We are choosing one event track plus a sponsor challenge. Meta/social features
are a possible extension, not a current commitment. Do not claim health outcomes
or savings that the demo does not substantiate.

## 3. User workflow

| Step                   | User action                                                                      | App behavior                                                                      | Visible result                                         |
| ---------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 1. Set preferences     | Enter budget, people/servings, plan duration, cuisines, and dietary restrictions | Validate inputs and record constraints                                            | A clear summary of the request                         |
| 2. Add practical needs | Optionally enter pantry ingredients, available time, and kitchen access          | Adjust candidate meals and shopping needs                                         | Preferences ready to use                               |
| 3. Generate a plan     | Select “Create my plan”                                                          | Retrieve known foods and recipes, select meals, calculate costs/nutrients         | Meals with estimated total spending and an explanation |
| 4. Inspect choices     | Open a meal or grocery item                                                      | Show ingredients, portions, preparation time, data sources, and price assumptions | Understand why it fits                                 |
| 5. Adjust the plan     | Swap a meal, change budget, or request a different cuisine                       | Recalculate the whole affected plan and basket                                    | Updated cost and nutrition                             |
| 6. Shop                | Review grocery basket or restaurant alternative                                  | Show package quantities, estimated charges, and the chosen payment flow           | Explicit user confirmation before a sandbox purchase   |
| 7. Save, if included   | Save the plan                                                                    | Persist it with appropriate access controls                                       | Reopen the same plan later                             |

**When no plan fits:** explain which constraints conflict and let the user change
them. Do not silently exceed the budget or ignore restrictions.

## 4. Proposed MVP boundary

### Core

- [ ] Budget, cuisine, dietary restrictions, household size, and duration inputs.
- [ ] Small curated ingredient and recipe catalog.
- [ ] One complete plan-generation flow.
- [ ] Correct serving quantities, nutrition totals, and purchase-cost arithmetic.
- [ ] Grocery basket with package quantities and estimated cost.
- [ ] Meal swap with recalculation.
- [ ] Meaningful generative-AI interpretation/explanation grounded in catalog data.
- [ ] Sponsor-aligned payment demo, with sandbox/simulation status clearly shown.
- [ ] Loading, failure, and no-feasible-plan states.

### Decide before building

- [ ] Weekly plan or shorter multi-day plan?
- [ ] All meals or dinners only?
- [ ] Restaurant options in the first demo or immediately afterward?
- [ ] Accounts and saved plans, or guest-only initial flow?
- [ ] Include pantry tracking in the first version?

### Later

- Social feed, shared meal planning, and Meta challenge entry.
- Large-scale live restaurant/store coverage.
- Learned preference models or a formal optimization service.
- Automatic purchases without user review.

Restaurant recommendations remain part of the general idea; reducing their
initial scope is a proposal, not a decision already made.

## 5. How the system works

1. **Frontend:** Next.js + TypeScript + Chakra collects inputs and presents results.
2. **Route Handler:** validates the request and coordinates the planning steps.
3. **Supabase:** provides saved food, recipe, and price records.
4. **Planner:** filters candidates and selects a feasible combination.
5. **Application calculations:** compute quantities, purchase cost, and nutrition.
6. **Generative AI:** interprets natural-language preferences and explains the
   validated plan. Proposed swaps must pass the same checks.
7. **Payment integration:** uses the sponsor-supported sandbox after user review.

USDA calls happen when importing or refreshing foods, or adding an uncached food.
Generating each plan should primarily use our curated database.

### Data to store

| Entity             | Main fields                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| Foods              | FDC ID, description, raw/cooked state, normalized nutrients, units, source response, fetched date |
| Recipes            | Name, cuisine tags, servings, cooking time, instructions                                          |
| Recipe ingredients | Recipe ID, food ID, quantity and unit                                                             |
| Price estimates    | Food/product reference, store/location if known, package size, price, source/date                 |
| Plans, if saved    | Preferences, selected meals, quantities, calculated totals, owner/access model                    |

Keep missing nutrition values unknown. Ingredient presence and available data
must support restriction checks; missing allergen information is not proof of
safety. Keep nutrition data separate from prices.

### Proposed planning method

Start with constraint filtering, scoring, and meal swaps in TypeScript. Compare
feasible plans using cost, cuisine preference, preparation effort, and ingredient
reuse. Specify priorities before implementing scores.

Buying one package may cost more than the portion consumed; enforce the shopping
budget against required purchases. Include restaurant fees/taxes when known,
or explain their omission in estimates.

Gradient descent is an earlier brainstorm, not a requirement. Select a different
solver only if the actual problem needs it.

## 6. Build sequence and team ownership

Owners are intentionally unassigned; fill these in together. Tasks in phases
2 and 3 can proceed alongside each other after the request/response shape is agreed.

| Phase                   | Work                                                                                        | Done when                                                | Owner                |
| ----------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------- | -------------------- |
| 0. Foundation           | Shared Next.js, Chakra, TypeScript, lint/format setup                                       | Starter and health route run; checks pass                | Completed foundation |
| 1. Lock scope           | Decide plan duration, meals covered, AI provider, price source, payment access              | Both teammates agree on one demo journey                 | TBD                  |
| 2. Data                 | Create Supabase project/tables/access rules; import selected USDA foods; add recipes/prices | One recipe has traceable cost and nutrition calculations | TBD                  |
| 3. Interface            | Build preferences, results, meal details, and basket using sample responses                 | Screens work together on mobile and desktop              | TBD                  |
| 4. Planner              | Implement constraints, calculations, and selection behind a Route Handler                   | Inputs produce a feasible, reproducible plan             | TBD                  |
| 5. AI and changes       | Interpret requests, explain results, and process swaps                                      | A preference change produces a valid updated plan        | TBD                  |
| 6. Commerce             | Connect chosen sandbox flow and validate user confirmation                                  | Basket proceeds through a clearly labeled payment demo   | TBD                  |
| 7. Integrate and submit | Deploy, test the full flow, prepare demo/write-up                                           | Deployed journey works and submission assets are ready   | Both                 |

Confirm payment access in phase 1 even though implementation is later; it could
affect the demo scope. Agree on JSON request/response examples before splitting UI
and backend work.

## 7. Verification and demo

- [ ] A sample budget produces an affordable plan using whole-package costs.
- [ ] Quantities and nutrition units are consistent; no raw/cooked mismatch.
- [ ] Restrictions are respected or limitations are explicitly surfaced.
- [ ] An impossible request returns an explanation.
- [ ] Swapping a meal updates the basket and totals.
- [ ] API/AI failures produce a recoverable UI state.
- [ ] Private API keys never reach the browser or repository.
- [ ] Private saved plans have working access rules if persistence is included.
- [ ] Payment success, cancellation, and failure are handled for the chosen sandbox.
- [ ] Lint, typecheck, formatting, and production build pass.
- [ ] One deployed mobile/desktop demo flow works from start to finish.

**Suggested demo:** enter the example budget/preferences → generate a plan →
explain one recommendation → swap a meal → show updated spending → review basket
and demonstrate the sandbox checkout.

Use only supported claims in the presentation. Label sample prices, estimated
nutrition, and mocked integrations. Confirm Devpost deadlines, required assets,
and current sponsor expectations against the live event guidance.

## 8. Open decisions

| Question                 | Current proposal                                                 | Final decision |
| ------------------------ | ---------------------------------------------------------------- | -------------- |
| Product name             | TBD                                                              |                |
| Plan duration and meals  | Small enough to demo reliably                                    |                |
| Initial catalog size     | Approximately 30–50 ingredients and a smaller recipe set         |                |
| AI provider/model        | One hosted API with available access/credits                     |                |
| Price source             | Curated dated estimates initially                                |                |
| Restaurant source/scope  | Small curated selection if included                              |                |
| Nutrition criteria       | Decide what to display and optimize; no invented medical targets |                |
| Optimizer                | TypeScript filtering/scoring/swaps                               |                |
| Accounts                 | Guest flow first; saving optional                                |                |
| Visa payment integration | Confirm with sponsor                                             |                |
| Deployment               | Vercel proposed                                                  |                |
| Team ownership           | Assign after agreeing on API contract                            |                |

## 9. Current status and next action

**Available:** shared app foundation, standalone USDA API experiments, and a
100-record ingredient catalog retrieved through FoodData Central API calls.
The catalog and experiments are not yet integrated into the app. Supabase
dependencies are installed.

**Not connected yet:** hosted database, in-app catalog access, AI provider, planner,
authentication, and payments.

**Next action:** fill in the scope decisions in sections 4 and 8, assign owners,
and agree on one sample plan request and response.

## Team notes / changes

-
