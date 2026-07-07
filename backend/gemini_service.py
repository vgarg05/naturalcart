import logging
import json
from typing import List, Optional
from pydantic import BaseModel, Field
from google import genai
from google.genai import types as genai_types

log = logging.getLogger(__name__)

GEMINI_MODEL = "gemini-2.5-flash"

FILTER_RULES = {
    "vegetarian": "Replace all meat (chicken, beef, lamb, pork, seafood) with vegetarian alternatives like paneer, tofu, or chickpeas. Keep dairy products.",
    "vegan": "Replace ALL animal products — meat, poultry, seafood, dairy, eggs, honey — with plant-based alternatives like tofu, tempeh, oat milk, flax eggs, or coconut cream.",
    "gluten-free": "Exclude all gluten-containing ingredients (wheat flour, regular pasta, regular bread, regular soy sauce). Substitute with gluten-free versions (rice flour, GF pasta, GF bread, tamari).",
}

# ── PYDANTIC SCHEMAS FOR STRUCTURED OUTPUT ────────────────────────────────────
class IngredientItem(BaseModel):
    name: str = Field(description="Name of the ingredient, e.g. 'Ghee', 'Chicken Breast', 'Tomato'")
    qty_per_person: str = Field(description="Quantity required for exactly 1 person, e.g. '20g', '100g', '0.5 tsp'")
    aisle: str = Field(description="Grocery aisle category, e.g. 'Dairy', 'Produce', 'Meat', 'Spices'")
    meal: str = Field(description="Name of the meal this ingredient is for")
    substitute: Optional[str] = Field(default=None, description="Alternative if the item is hard to find")

class MealDecomposition(BaseModel):
    items: List[IngredientItem]

def build_prompt(meal_plan: str, dietary_filters: list[str]) -> str:
    dietary_section = ""
    if dietary_filters:
        rules = []
        for f in dietary_filters:
            rule = FILTER_RULES.get(f.lower())
            if rule:
                label = f.replace("-", " ").title()
                rules.append(f"• {label}: {rule}")
        if rules:
            dietary_section = (
                "\n\nActive dietary filters — apply ALL of the following rules strictly:\n"
                + "\n".join(rules)
            )

    return f"""You are a grocery list assistant. The user is planning their meals.
User's meal plan: "{meal_plan}"{dietary_section}

Rules:
- qty_per_person = the quantity required for exactly 1 person (e.g. "100g", "0.5 tsp", "1 piece")
- Group logically into aisles: Produce, Dairy, Meat, Seafood, Pantry, Spices, Bakery, Frozen, Oils, Canned Goods, Condiments, Beverages
- Be comprehensive — include every ingredient needed, including pantry staples
- Apply ALL dietary filter rules strictly — no exceptions"""

def decompose_meals(meal_plan: str, dietary_filters: list[str], api_key: str) -> list:
    """
    Calls Gemini API to decompose a meal plan into structured ingredient names.
    Returns a list of parsed ingredient dictionaries. Guaranteed to be valid JSON.
    """
    prompt = build_prompt(meal_plan, dietary_filters)
    log.info("Sending prompt to Gemini model with Structured Outputs...")
    
    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=prompt,
        config=genai_types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=MealDecomposition,
            max_output_tokens=4096,
            temperature=0.1,
        ),
    )
    
    raw_text = response.text
    parsed = json.loads(raw_text)
    
    items = parsed.get("items", [])
    return items
