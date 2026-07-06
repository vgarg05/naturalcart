import os
import logging
from typing import Optional, List
from pathlib import Path
from contextlib import asynccontextmanager

from dotenv import load_dotenv
# Load environment variables from parent root .env if it exists, otherwise local
dotenv_path = Path(__file__).parent.parent / ".env"
if dotenv_path.exists():
    load_dotenv(dotenv_path=dotenv_path)
else:
    load_dotenv()

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

from backend.vector_store import ProductVectorStore
from backend.embedding import get_embeddings
from backend.gemini_service import decompose_meals
from backend.rag import process_rag_list

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Global Vector Store State
# ---------------------------------------------------------------------------
vector_store = ProductVectorStore()

PRODUCTS_PATH = Path(__file__).parent / "products.json"
if not PRODUCTS_PATH.exists():
    PRODUCTS_PATH = Path(__file__).parent.parent / "products.json"

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    On startup: loads the Instamart product catalog and pre-computes or loads
    product embeddings locally (without API key dependencies).
    """
    # 1. Load the catalog
    try:
        vector_store.load_catalog(str(PRODUCTS_PATH))
    except Exception as e:
        log.error(f"Failed to load product catalog during startup: {e}")

    # 2. Try loading cached embeddings from disk first
    if vector_store.load_cached_embeddings():
        log.info("Startup: Successfully loaded cached product embeddings from disk.")
    else:
        # Generate them locally (no API key needed!)
        try:
            log.info("Startup: Embedding cache not found. Generating product embeddings locally...")
            texts = vector_store.get_product_texts()
            embeddings = get_embeddings(texts)
            vector_store.build_index(embeddings)
        except Exception as e:
            log.error(f"Startup: Product embedding generation failed: {e}. Will fall back to lazy indexing on first request.")

    yield
    log.info("Shutting down NaturalCart API.")

# ---------------------------------------------------------------------------
# FastAPI App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="NaturalCart RAG API",
    description="FastAPI backend utilizing Retrieval-Augmented Generation (RAG) to map meal plan ingredients to catalog products.",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Request & Response Schemas
# ---------------------------------------------------------------------------
class GroceryRequest(BaseModel):
    meal_plan: str
    dietary_filters: List[str] = []
    api_key: Optional[str] = None


class ProductSchema(BaseModel):
    id: int
    name: str
    brand: str
    category: str
    quantity: str
    price: float
    available: bool


class MatchSchema(BaseModel):
    product: ProductSchema
    score: float


class GroceryItemResponse(BaseModel):
    name: str
    qty_per_person: str
    aisle: str
    meal: str
    substitute: Optional[str] = None
    product: Optional[ProductSchema] = None
    matches: List[MatchSchema] = []
    message: Optional[str] = None


class GroceryResponse(BaseModel):
    items: List[GroceryItemResponse]

# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------
def ensure_index_initialized(api_key: Optional[str] = None):
    """
    Checks if vector store embeddings are empty, and builds the index.
    Attempts to load from disk cache first to bypass API embedding calls.
    """
    if vector_store.embeddings.size == 0:
        log.info("Lazy Indexing: Embedding index is empty. Checking disk cache...")
        if vector_store.load_cached_embeddings():
            log.info("Lazy Indexing: Successfully loaded cached product embeddings from disk.")
            return

        log.info("Lazy Indexing: Embedding cache not found. Generating embeddings locally...")
        try:
            texts = vector_store.get_product_texts()
            embeddings = get_embeddings(texts)
            vector_store.build_index(embeddings)
            log.info("Lazy Indexing: Successfully built and cached product embeddings.")
        except Exception as e:
            log.error(f"Lazy Indexing failed: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to initialize product catalog embeddings: {str(e)}"
            )

# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.get("/", tags=["Health"])
async def root():
    return {"status": "ok", "message": "NaturalCart RAG API is running."}


@app.post("/api/grocery-list", response_model=GroceryResponse, tags=["Grocery"])
async def generate_grocery_list(body: GroceryRequest):
    """
    Accepts meal plan and dietary preferences. Decomposes into ingredients,
    performs semantic searches on product catalog, maps items and returns top matches.
    """
    if not body.meal_plan.strip():
        raise HTTPException(status_code=400, detail="meal_plan cannot be empty.")

    # 1. Resolve API Key
    api_key = (body.api_key or "").strip() or os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(
            status_code=400,
            detail="We are currently not doing service. Please mention your key."
        )

    # 2. Ensure the product catalog has been embedded and cached
    ensure_index_initialized(api_key)

    # 3. Call Gemini to decompose the meals into a raw ingredient list
    try:
        raw_ingredients = decompose_meals(body.meal_plan, body.dietary_filters, api_key)
    except Exception as exc:
        log.error(f"Gemini decomposition failed: {exc}")
        exc_str = str(exc)
        # Check if the error is a 429 / quota limit
        if "429" in exc_str or "quota" in exc_str.lower() or "resource_exhausted" in exc_str.lower():
            # If the user did not supply their own key in the request, they are using our default key
            using_default_key = not (body.api_key and body.api_key.strip())
            if using_default_key:
                raise HTTPException(
                    status_code=429,
                    detail="Our free shared service is temporarily overloaded. Please enter your own Gemini API key in the Gemini API Key input box to build your list!"
                )
            else:
                raise HTTPException(
                    status_code=429,
                    detail="Your Gemini API key has exceeded its rate limit. Please wait a moment or try another key."
                )
        # Check if the API key is invalid (400 INVALID_ARGUMENT)
        elif "API_KEY_INVALID" in exc_str or "API key not valid" in exc_str or "API key" in exc_str and "not valid" in exc_str:
            raise HTTPException(
                status_code=400,
                detail="The Gemini API key provided is not valid. Please check your key and try again!"
            )
        raise HTTPException(
            status_code=502,
            detail=f"Failed to generate ingredient list: {str(exc)}"
        )

    # 4. Map the ingredients to catalog products using semantic vector matching (RAG)
    try:
        enriched_grocery_list = process_rag_list(raw_ingredients, vector_store, api_key)
        return GroceryResponse(items=enriched_grocery_list)
    except Exception as exc:
        log.error(f"RAG processing failed: {exc}")
        raise HTTPException(
            status_code=500,
            detail=f"RAG matching failed: {str(exc)}"
        )

# ---------------------------------------------------------------------------
# Static Frontend (Production / Hugging Face)
# ---------------------------------------------------------------------------
# Serve the built React app. This MUST come after all /api/* routes so it
# does not intercept API calls.
_dist = Path(__file__).parent.parent / "dist"
if _dist.exists():
    # Serve static assets (JS, CSS, images)
    app.mount("/assets", StaticFiles(directory=str(_dist / "assets")), name="assets")

    # Catch-all: return index.html for any non-API path (supports React Router)
    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        index = _dist / "index.html"
        if index.exists():
            return FileResponse(str(index))
        return {"detail": "Frontend not built. Run 'npm run build' first."}
else:
    log.warning(
        "'dist/' folder not found. Run 'npm run build' to serve the frontend. "
        "In development, Vite proxy handles this automatically."
    )
