async function mealdb1() {
  const response = await fetch(
    "https://www.themealdb.com/api/json/v1/1/lookup.php?i=52772",
  );

  if (!response.ok) {
    throw new Error(`MealDB request failed: HTTP ${response.status}`);
  }

  const { meals } = await response.json();
  const recipe = meals?.[0];

  const ingredients = [];

  for (let i = 1; i <= 20; i++) {
    const ingredient = recipe[`strIngredient${i}`]?.trim();
    const measurement = recipe[`strMeasure${i}`]?.trim();

    // Skip unused ingredient slots.
    if (ingredient) {
      ingredients.push({
        ingredient,
        measurement: measurement || null,
      });
    }
  }

  console.log(JSON.stringify(ingredients, null, 2));

  if (!recipe) {
    console.log("No recipe found.");
    return;
  }

  console.log(recipe.strMeal);
  console.log(recipe.strInstructions);
  console.log(recipe.strIngredient1, recipe.strMeasure1);
}

mealdb1().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
