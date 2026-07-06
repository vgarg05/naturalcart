"""
generate_embeddings.py
Run once during Docker build to pre-compute and cache product embeddings.
This bakes the cached_embeddings.npy file into the Docker image so the
server starts instantly with zero embedding computation at runtime.
"""
import sys
from pathlib import Path

# Allow importing from the backend package
sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.vector_store import ProductVectorStore
from backend.embedding import get_embeddings

PRODUCTS_PATH = Path(__file__).parent / "products.json"
CACHE_PATH = Path(__file__).parent / "cached_embeddings.npy"

def main():
    print("==> Loading product catalog...")
    vs = ProductVectorStore()
    vs.load_catalog(str(PRODUCTS_PATH))

    print(f"==> Loaded {len(vs.products)} products.")
    print("==> Generating embeddings with all-MiniLM-L6-v2 (downloads ~90MB on first run)...")

    texts = vs.get_product_texts()
    embeddings = get_embeddings(texts)
    vs.build_index(embeddings)

    print(f"==> Embeddings generated. Shape: {embeddings.shape}")
    print(f"==> Cache saved to: {CACHE_PATH}")
    print("==> Done. Server will load this cache on startup.")

if __name__ == "__main__":
    main()
