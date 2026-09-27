# Current project direction

See [PROJECT_PLAN.md](PROJECT_PLAN.md) for the editable workflow, build sequence,
checklists, and open decisions.

Last updated: September 25, 2026.

This file records the team's current idea and intended direction. It is not a
claim that the features exist, and proposed implementation choices remain open.
See AGENTS.md for the actual stack and EVENT_PACKET.md for event requirements.

## Idea and audience

Build a food-planning and shopping application that helps people eat within their
budget while respecting their tastes and nutritional needs. The audience includes
people with lower incomes and people with moderate incomes managing food spending.

The core question is: “What can I eat and buy that fits my budget and preferences?”
The idea covers groceries/home cooking and restaurant options. Personalization
should account for cuisine preferences, dietary restrictions, and food budget.
Pantry contents, cooking time, and kitchen access are useful proposed inputs.
Prefer asking for a food budget instead of requiring users to disclose income.

## Selected track and sponsor challenge

- **A Marina's Mission, presented by Aramco Americas:** the chosen social-good
  track. The intended impact is making affordable, nutritious food choices easier
  to find and plan. Ingredient reuse could also reduce waste. Do not claim measured
  savings, improved health, or reduced waste without evidence.
- **Visa — Reimagine Shopping with Generative AI:** the selected additional sponsor
  challenge. Food discovery, comparison, personalization, and budget-aware shopping
  are the intended fit. Meaningful generative AI and a secure, trusted payment
  experience need to be addressed; sponsor API access and acceptable demo/payment
  scope remain to be confirmed.
- **Meta/social features:** discussed as a later possibility. They are not part of
  the current selected challenge set or required initial build.

## Proposed first end-to-end flow

1. Enter a food budget, preferences, and relevant restrictions.
2. Receive a meal plan with estimated spending and nutrition.
3. Review a grocery list and relevant restaurant alternatives.
4. Swap a meal or change a preference and recalculate the plan.
5. Demonstrate the shopping/payment step using the sponsor-supported integration
   available to the team. Clearly label simulations and sample data.

Keep the initial catalog and feature scope small enough to demonstrate reliably.
This sequence is a planning proposal, not a final product specification.

## Data and AI approach under consideration

- USDA FoodData Central supplies nutrition information. Store selected food records
  in Supabase with their FDC IDs, units, data type, and retrieval date, rather than
  refetching every ingredient for every plan.
- A curated recipe catalog links ingredient quantities to food records. Prices
  need a separate source, date/location, and package-size information. USDA is not
  the source of live store prices or local restaurant availability.
- Calculate nutrition and costs in application code. Preserve unknown values;
  distinguish raw/cooked foods and portion units, and distinguish consumed
  ingredient cost from the cost of purchasing whole packages.
- Use generative AI to interpret requests and explain or adapt recommendations
  grounded in the catalog. Validate outputs against application constraints.
- Optimization is an area of interest. Begin with filtering/scoring and swaps if
  sufficient; a discrete solver is an option. Gradient descent was brainstormed,
  not selected as a requirement or justified method.
- API provider, restaurant/price sources, payment integration, exact optimization
  method, authentication scope, and deployment still need decisions.

## Implementation status

The shared Next.js/TypeScript/Chakra foundation, starter page, and health Route
Handler are present on `main`. Manual USDA scripts and 100 reviewed ingredient
records retrieved through FoodData Central API calls are available locally.
Twelve records include separately sourced, labeled SR Legacy energy fallbacks.
Supabase packages are installed, but no hosted database, authentication, in-app
USDA integration, recommendation engine, payments, or social features are connected.
