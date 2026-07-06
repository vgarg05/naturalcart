import logging
import json
from typing import List, Dict, Any, Tuple
from pathlib import Path
import numpy as np

log = logging.getLogger(__name__)

# Try to import FAISS, with standard numpy fallback if not installed/supported
try:
    import faiss
    HAS_FAISS = True
    log.info("FAISS successfully imported for vector search.")
except ImportError:
    HAS_FAISS = False
    log.warning("FAISS not found. Falling back to NumPy native Cosine Similarity.")

class ProductVectorStore:
    def __init__(self):
        self.products: List[Dict[str, Any]] = []
        self.embeddings: np.ndarray = np.empty((0, 0))
        self.faiss_index = None
        self.dimension = 0
        self.cache_path = Path(__file__).parent / "cached_embeddings.npy"

    def load_catalog(self, products_json_path: str):
        """Loads products from local catalog JSON file."""
        log.info(f"Loading product catalog from {products_json_path}...")
        with open(products_json_path, 'r', encoding='utf-8') as f:
            self.products = json.load(f)
        log.info(f"Loaded {len(self.products)} products from catalog.")

    def get_product_texts(self) -> List[str]:
        """Creates textual descriptions of products to build context for embeddings."""
        texts = []
        for p in self.products:
            keywords_str = ", ".join(p.get("keywords", []))
            avail = "available" if p.get("available", True) else "out of stock"
            veg = "vegetarian" if p.get("vegetarian", True) else "non-vegetarian"
            
            text = (
                f"Product: {p.get('name', '')} | "
                f"Brand: {p.get('brand', '')} | "
                f"Category: {p.get('category', '')} ({p.get('subcategory', '')}) | "
                f"Quantity: {p.get('quantity', '')} | "
                f"Description: {p.get('description', '')} | "
                f"Keywords: {keywords_str} | "
                f"Availability: {avail} | "
                f"Diet: {veg}"
            )
            texts.append(text)
        return texts

    def save_embeddings(self):
        """Saves current embeddings numpy array to disk cache."""
        try:
            log.info(f"Saving computed embeddings to cache at {self.cache_path}...")
            np.save(str(self.cache_path), self.embeddings)
            log.info("Embeddings successfully saved to cache.")
        except Exception as e:
            log.error(f"Failed to save embeddings to cache: {e}")

    def load_cached_embeddings(self) -> bool:
        """Loads cached embeddings from disk and builds vector index."""
        if not self.cache_path.exists():
            return False
        
        try:
            log.info(f"Loading cached embeddings from {self.cache_path}...")
            self.embeddings = np.load(str(self.cache_path)).astype('float32')
            self.dimension = self.embeddings.shape[1]
            
            # Rebuild index
            if HAS_FAISS:
                faiss_embeddings = self.embeddings.copy()
                faiss.normalize_L2(faiss_embeddings)
                self.faiss_index = faiss.IndexFlatIP(self.dimension)
                self.faiss_index.add(faiss_embeddings)
                log.info("FAISS index rebuilt from cache.")
            else:
                log.info("NumPy arrays loaded from cache.")
            return True
        except Exception as e:
            log.error(f"Failed to load cached embeddings: {e}")
            return False

    def build_index(self, embeddings_list: List[List[float]]):
        """Builds index using FAISS (or falls back to NumPy arrays) and caches it."""
        if not embeddings_list:
            log.warning("Empty embeddings list passed. Cannot build index.")
            return

        self.embeddings = np.array(embeddings_list).astype('float32')
        self.dimension = self.embeddings.shape[1]

        if HAS_FAISS:
            # Flat Index with Inner Product (Cosine similarity for normalized embeddings)
            # Normalize embeddings first to ensure exact cosine similarity matching
            faiss_embeddings = self.embeddings.copy()
            faiss.normalize_L2(faiss_embeddings)
            
            self.faiss_index = faiss.IndexFlatIP(self.dimension)
            self.faiss_index.add(faiss_embeddings)
            log.info("FAISS vector index built successfully.")
        else:
            log.info("NumPy array built for manual Cosine Similarity calculations.")
            
        self.save_embeddings()

    def search(self, query_embedding: List[float], k: int = 3) -> List[Tuple[Dict[str, Any], float]]:
        """
        Search for top K closest matching products.
        Returns list of tuples: (product_metadata, similarity_score)
        """
        if self.embeddings.size == 0:
            log.error("Vector store index has not been built yet!")
            return []

        q_emb = np.array(query_embedding).astype('float32').reshape(1, -1)

        if HAS_FAISS:
            # Normalize the query embedding for cosine similarity
            faiss.normalize_L2(q_emb)
            scores, indices = self.faiss_index.search(q_emb, k)
            
            results = []
            for score, idx in zip(scores[0], indices[0]):
                if idx < 0 or idx >= len(self.products):
                    continue
                # FAISS scores can sometimes exceed 1.0 slightly due to float precision
                results.append((self.products[idx], min(float(score), 1.0)))
            return results
        else:
            # NumPy native fallback cosine search
            # similarity = dot(A, B) / (norm(A) * norm(B))
            prod_norms = np.linalg.norm(self.embeddings, axis=1)
            q_norm = np.linalg.norm(q_emb[0])
            
            # Prevent division by zero
            if q_norm == 0:
                return []
                
            dot_products = np.dot(self.embeddings, q_emb[0])
            similarities = dot_products / (prod_norms * q_norm)
            
            # Sort descending
            top_indices = np.argsort(similarities)[::-1][:k]
            
            results = []
            for idx in top_indices:
                score = float(similarities[idx])
                results.append((self.products[idx], min(score, 1.0)))
            return results
