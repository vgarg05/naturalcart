import logging
import json
from google import genai
from google.genai import types as genai_types

log = logging.getLogger(__name__)

GEMINI_MODEL = "gemini-2.5-flash"

FILTER_RULES = {
    "vegetarian": "Replace all meat (chicken, beef, lamb, pork, seafood) with vegetarian alternatives like paneer, tofu, or chickpeas. Keep dairy products.",
    "vegan": "Replace ALL animal products — meat, poultry, seafood, dairy, eggs, honey — with plant-based alternatives like tofu, tempeh, oat milk, flax eggs, or coconut cream.",
    "gluten-free": "Exclude all gluten-containing ingredients (wheat flour, regular pasta, regular bread, regular soy sauce). Substitute with gluten-free versions (rice flour, GF pasta, GF bread, tamari).",
}

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

Return ONLY a JSON object, no markdown, no backticks, just raw JSON like this:
{{"items":[{{"name":"Ghee","qty_per_person":"20g","aisle":"Dairy","meal":"Butter Chicken","substitute":"Unsalted butter"}}]}}

Rules:
- Each item must have: name, qty_per_person, aisle, meal
- qty_per_person = the quantity required for exactly 1 person (e.g. "100g", "0.5 tsp", "1 piece")
- Group logically into aisles: Produce, Dairy, Meat, Seafood, Pantry, Spices, Bakery, Frozen, Oils, Canned Goods, Condiments, Beverages
- Be comprehensive — include every ingredient needed, including pantry staples
- Add a "substitute" field ONLY for items that may be hard to find in a regular supermarket (e.g. specialty spices, regional ingredients). Most items will NOT need a substitute.
- Apply ALL dietary filter rules strictly — no exceptions
- Only return the raw JSON, nothing else"""

def decompose_meals(meal_plan: str, dietary_filters: list[str], api_key: str) -> list:
    """
    Calls Gemini API to decompose a meal plan into structured ingredient names.
    Returns a list of parsed ingredient dictionaries.
    """
    prompt = build_prompt(meal_plan, dietary_filters)
    log.info("Sending prompt to Gemini model...")
    
    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=prompt,
        config=genai_types.GenerateContentConfig(
            max_output_tokens=4096,
            temperature=0.3,
        ),
    )
    
    raw_text = response.text
    
    # Clean output from potential markdown fences
    clean_text = raw_text.replace("```json", "").replace("```", "").strip()
    parsed = json.loads(clean_text)
    
    items = parsed.get("items", parsed) if isinstance(parsed, dict) else parsed
    if not isinstance(items, list):
        raise ValueError("Invalid format: expected a list of items.")
        
    return items
