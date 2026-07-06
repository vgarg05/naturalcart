import logging
from typing import List, Dict, Any
from backend.embedding import get_embeddings
from backend.vector_store import ProductVectorStore

log = logging.getLogger(__name__)

SIMILARITY_THRESHOLD = 0.35

def process_rag_list(
    ingredients: List[Dict[str, Any]],
    vector_store: ProductVectorStore,
    api_key: str
) -> List[Dict[str, Any]]:
    """
    RAG Orchestrator:
    1. Extracts names of all generated ingredients.
    2. Batches embedding calls to Google Embedding model.
    3. Performs vector similarity queries against the Product Catalog.
    4. Computes scores and thresholds; structures the final response.
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
        # Return fallback with empty product mapping if embedding fails
        return [
            {
                **item,
                "product": None,
                "matches": [],
                "message": f"Embedding generation failed: {exc}"
            }
            for item in ingredients
        ]

    # 2. Perform vector search for each ingredient
    enriched_items = []
    for idx, item in enumerate(ingredients):
        q_emb = query_embeddings[idx]
        
        # Search for top 3 matching products
        matches_with_scores = vector_store.search(q_emb, k=3)
        
        matches_list = []
        best_product = None
        message = None

        # Process matches
        for p, score in matches_with_scores:
            match_entry = {
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
            }
            matches_list.append(match_entry)

        # Log the best match and score for debugging
        if matches_list:
            best_match = matches_list[0]
            log.info(f"RAG: Query '{item.get('name')}' -> Best Match: '{best_match['product']['name']}' (Score: {best_match['score']})")

        # Apply threshold filtering (Step 5) on the highest similarity match
        if matches_list and matches_list[0]["score"] >= SIMILARITY_THRESHOLD:
            best_product = matches_list[0]["product"]
        else:
            message = "No close product found"
            best_product = None

        enriched_item = {
            "name": item.get("name"),
            "qty_per_person": item.get("qty_per_person"),
            "aisle": item.get("aisle"),
            "meal": item.get("meal"),
            "substitute": item.get("substitute"), # Keep raw text substitute fallback
            "product": best_product,
            "matches": matches_list,
            "message": message
        }
        enriched_items.append(enriched_item)

    return enriched_items
