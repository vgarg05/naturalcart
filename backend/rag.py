import logging
import re
import numpy as np
from typing import List, Dict, Any
from backend.embedding import get_embeddings
from backend.vector_store import ProductVectorStore

log = logging.getLogger(__name__)

SIMILARITY_THRESHOLD = 0.35

# Allowed product catalog categories per aisle
COMPATIBLE_CATEGORIES = {
    "produce": ["Vegetables", "Fruits"],
    "vegetables": ["Vegetables"],
    "fruits": ["Fruits"],
    "dairy": ["Dairy"],
    "meat": ["Meat"],
    "seafood": ["Seafood"],
    "spices": ["Spices"],
    "bakery": ["Bakery"],
    "frozen": ["Frozen Foods"],
    "oils": ["Oils & Ghee"],
    "condiments": ["Sauces & Condiments"],
    "beverages": ["Beverages"],
    "pantry": [
        "Instant Foods", "Snacks", "Pulses & Rice", "Breakfast",
        "Dry Fruits", "Flour & Atta", "Bakery", "Spices", "Oils & Ghee", "Sauces & Condiments"
    ],
    "canned goods": ["Instant Foods", "Sauces & Condiments", "Pulses & Rice"],
}

NON_FOOD_CATEGORIES = {"Household", "Cleaning Supplies", "Personal Care"}

# Hardcoded substitution rules mapping normalized ingredient queries to allowed normalized alternatives
SUBSTITUTION_MAP = {
    "butter": ["ghee", "margarine"],
    "paneer": ["tofu"],
    "curd": ["greek yogurt", "yogurt"],
    "cream": ["fresh cream", "cream"],
    "lemon": ["lime"],
    "ghee": ["butter"],
    "tofu": ["paneer"],
}

def normalize_name(name: str) -> str:
    """
    Normalizes product or ingredient names to root forms.
    Examples:
      Turmeric Powder -> turmeric
      Fresh Tomatoes -> tomato
      Onions -> onion
    """
    if not name:
        return ""
    name = name.lower().strip()
    
    # Remove common adjectives and filler words
    for word in ["fresh", "whole", "raw", "organic", "powder", "clove", "cloves", "pack", "bag", "pure", "ground", "dry", "dried"]:
        name = re.sub(r'\b' + re.escape(word) + r'\b', '', name)
    
    # Remove punctuation & standardise spacing
    name = re.sub(r'[^a-z0-9\s]', '', name)
    name = " ".join(name.split())
    
    # Exact keyword overrides for clean mapping of grocery concepts
    overrides = {
        "turmeric": "turmeric",
        "haldi": "turmeric",
        "red chilli": "red chilli",
        "chilli": "red chilli",
        "chili": "red chilli",
        "mirch": "red chilli",
        "onion": "onion",
        "pyaz": "onion",
        "tomato": "tomato",
        "tamatar": "tomato",
        "garlic": "garlic",
        "lehsun": "garlic",
        "ginger": "ginger",
        "adrak": "ginger",
        "milk": "milk",
        "doodh": "milk",
        "butter": "butter",
        "makhan": "butter",
        "paneer": "paneer",
        "tofu": "tofu",
        "curd": "curd",
        "dahi": "curd",
        "yogurt": "curd",
        "cream": "cream",
        "lemon": "lemon",
        "lime": "lemon",
        "salt": "salt",
        "sugar": "sugar",
        "black pepper": "pepper",
        "pepper": "pepper",
        "coriander": "coriander",
        "dhaniya": "coriander",
        "cumin": "cumin",
        "jeera": "cumin",
        "oil": "oil",
        "ghee": "ghee",
        "chicken": "chicken",
        "mutton": "mutton",
        "pork": "pork",
        "fish": "fish",
        "prawns": "prawns",
        "rice": "rice",
        "pasta": "pasta",
        "noodle": "noodle",
    }
    
    for key, val in overrides.items():
        if key in name:
            return val
            
    # Basic fallback singularization
    if name.endswith("es"):
        name = name[:-2]
    elif name.endswith("s") and not name.endswith("ss"):
        name = name[:-1]
        
    return name

def process_rag_list(
    ingredients: List[Dict[str, Any]],
    vector_store: ProductVectorStore,
    api_key: str
) -> List[Dict[str, Any]]:
    """
    RAG Orchestrator:
    1. Normalizes generated ingredients.
    2. Performs category-aware + ingredient normalization validation.
    3. Leverages a substitution dictionary for alternatives.
    4. Handles unavailable states without hallucination.
    """
    if not ingredients:
        return []

    # 1. Gather all ingredient names to embed in a single batch
    query_texts = [item.get("name", "") for item in ingredients]
    log.info(f"RAG: Batch embedding {len(query_texts)} ingredient queries...")
    
    try:
        query_embeddings = get_embeddings(query_texts, api_key)
    except Exception as exc:
        log.error(f"Failed to generate embeddings for query list: {exc}")
        return [
            {
                **item,
                "product": None,
                "matches": [],
                "message": f"Embedding generation failed: {exc}"
            }
            for item in ingredients
        ]

    enriched_items = []
    
    # 2. Iterate through each ingredient and apply strict matching rules
    for idx, item in enumerate(ingredients):
        q_emb = query_embeddings[idx]
        ingred_name = item.get("name", "")
        aisle = item.get("aisle", "")
        
        # Normalize the query ingredient
        norm_query = normalize_name(ingred_name)
        
        # Calculate similarity scores for all products in catalog using matrix operations
        q_emb_arr = np.array(q_emb).astype('float32')
        q_norm = np.linalg.norm(q_emb_arr)
        if q_norm > 0:
            q_emb_arr = q_emb_arr / q_norm
            
        prod_embeddings = vector_store.embeddings
        prod_norms = np.linalg.norm(prod_embeddings, axis=1)
        prod_norms[prod_norms == 0] = 1e-8
        
        all_scores = np.dot(prod_embeddings, q_emb_arr) / prod_norms

        aisle_lower = aisle.lower().strip()
        allowed_cats = COMPATIBLE_CATEGORIES.get(aisle_lower)
        
        is_household_query = any(k in aisle_lower or k in ingred_name.lower() for k in [
            "cleaning", "household", "wash", "detergent", "soap", "personal", "toothpaste", "shampoo", "care", "dish"
        ])

        # Step 4 Validation: Exact Matches
        exact_matches = []
        for i, p in enumerate(vector_store.products):
            p_norm = normalize_name(p.get("name", ""))
            
            # Check exact matching name
            if p_norm == norm_query:
                p_cat = p.get("category")
                
                # Check category compatibility
                is_cat_ok = False
                if allowed_cats:
                    is_cat_ok = p_cat in allowed_cats
                elif not is_household_query:
                    is_cat_ok = p_cat not in NON_FOOD_CATEGORIES
                else:
                    is_cat_ok = True
                    
                if is_cat_ok:
                    score = float(all_scores[i])
                    if score >= SIMILARITY_THRESHOLD:
                        exact_matches.append({
                            "product": {
                                "id": p.get("id"),
                                "name": p.get("name"),
                                "brand": p.get("brand"),
                                "category": p.get("category"),
                                "quantity": p.get("quantity"),
                                "price": p.get("price"),
                                "available": p.get("available")
                            },
                            "score": round(score, 4)
                        })
                        
        # Sort exact matches descending by score
        exact_matches.sort(key=lambda x: x["score"], reverse=True)

        # Substitution rules: lookup substitutes
        substitute_matches = []
        allowed_subs = SUBSTITUTION_MAP.get(norm_query, [])
        for sub_name in allowed_subs:
            for i, p in enumerate(vector_store.products):
                p_norm = normalize_name(p.get("name", ""))
                if p_norm == sub_name:
                    p_cat = p.get("category")
                    is_cat_ok = False
                    if allowed_cats:
                        is_cat_ok = p_cat in allowed_cats
                    elif not is_household_query:
                        is_cat_ok = p_cat not in NON_FOOD_CATEGORIES
                    else:
                        is_cat_ok = True
                        
                    if is_cat_ok:
                        score = float(all_scores[i])
                        # Allow slightly relaxed similarity threshold for substitutes (e.g. 0.40)
                        if score >= 0.40:
                            substitute_matches.append({
                                "product": {
                                    "id": p.get("id"),
                                    "name": p.get("name"),
                                    "brand": p.get("brand"),
                                    "category": p.get("category"),
                                    "quantity": p.get("quantity"),
                                    "price": p.get("price"),
                                    "available": p.get("available")
                                },
                                "score": round(score, 4)
                            })
                            
        # Sort substitutes descending by score
        substitute_matches.sort(key=lambda x: x["score"], reverse=True)

        # DEBUG MODE LOGGING
        log_lines = [
            "",
            "==================================================",
            f"Ingredient: {ingred_name}",
            f"Normalized Ingredient: {norm_query}",
            "Retrieved Products:"
        ]
        
        # Get top 10 raw nearest neighbors indices for printout
        top_10_indices = np.argsort(all_scores)[::-1][:10]
        for idx in top_10_indices:
            p = vector_store.products[idx]
            score = float(all_scores[idx])
            p_cat = p.get("category")
            p_norm = normalize_name(p.get("name", ""))
            
            is_score_ok = score >= SIMILARITY_THRESHOLD
            
            is_cat_ok = False
            if allowed_cats:
                is_cat_ok = p_cat in allowed_cats
            elif not is_household_query:
                is_cat_ok = p_cat not in NON_FOOD_CATEGORIES
            else:
                is_cat_ok = True
                
            is_name_ok = (p_norm == norm_query) or (p_norm in allowed_subs)
            
            accepted = is_score_ok and is_cat_ok and is_name_ok
            status_str = "Accepted" if accepted else "Rejected"
            
            reasons = []
            if not is_score_ok:
                reasons.append("Score below threshold")
            if not is_cat_ok:
                reasons.append("Wrong category")
            if not is_name_ok:
                reasons.append("Ingredient mismatch")
                
            reason_str = f" (Reason: {', '.join(reasons)})" if reasons else ""
            log_lines.append(f"  - {p.get('name')} | Similarity: {round(score, 4)} | Category: {p_cat} | {status_str}{reason_str}")
            
        log_lines.append("==================================================")
        log.info("\n".join(log_lines))

        # Determine best match and alternatives list
        best_product = None
        matches_list = []
        message = None

        if exact_matches:
            best_product = exact_matches[0]["product"]
            matches_list = exact_matches + substitute_matches
        elif substitute_matches:
            best_product = substitute_matches[0]["product"]
            matches_list = substitute_matches
        else:
            best_product = None
            matches_list = []
            message = "Product not available in the current catalog."

        # Limit UI alternatives list to top 3
        matches_list = matches_list[:3]

        enriched_item = {
            "name": ingred_name,
            "qty_per_person": item.get("qty_per_person"),
            "aisle": aisle,
            "meal": item.get("meal"),
            "substitute": item.get("substitute"),
            "product": best_product,
            "matches": matches_list,
            "message": message
        }
        enriched_items.append(enriched_item)

    return enriched_items
