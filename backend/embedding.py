import logging
from typing import List
from sentence_transformers import SentenceTransformer

log = logging.getLogger(__name__)

# Singleton local model instance
_model = None

def get_embeddings(texts: List[str], api_key: str = None) -> List[List[float]]:
    """
    Generate text embeddings locally using the sentence-transformers model 'all-MiniLM-L6-v2'.
    Runs 100% locally on CPU, with zero API key dependencies and zero rate limits.
    """
    global _model
    if _model is None:
        log.info("Loading local SentenceTransformer model 'all-MiniLM-L6-v2' (approx. 90MB)...")
        # Loads or downloads the model once
        _model = SentenceTransformer("all-MiniLM-L6-v2")
        log.info("Local SentenceTransformer model loaded successfully.")

    if not texts:
        return []

    try:
        # Generate embeddings on CPU
        embeddings_np = _model.encode(texts, show_progress_bar=False)
        return embeddings_np.tolist()
    except Exception as e:
        log.error(f"Failed to generate local embeddings: {e}")
        raise e
