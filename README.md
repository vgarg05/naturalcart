---
title: NaturalCart
emoji: 🛒
colorFrom: green
colorTo: green
sdk: docker
pinned: false
---

# 🛒 NaturalCart

### AI-Powered Grocery Shopping Platform

> Describe your week's meals. NaturalCart generates a complete, aisle-organised grocery list and matches every ingredient to real products — instantly.

---

## ✨ What It Does

NaturalCart is a full-stack AI grocery shopping application. You type a meal plan in plain English, and the system:

1. **Decomposes** the meal plan into structured ingredients using **Google Gemini 2.5 Flash**
2. **Matches** every ingredient to the closest real product in the catalog using **semantic vector search (RAG)**
3. **Calculates** how many packs you need to buy based on required quantity vs. pack size
4. **Presents** a clean, interactive shopping list — sortable by aisle or by meal
5. Lets you **add products to a shopping cart** with live price totals

---

## 🎥 Demo

| Feature | Preview |
|---|---|
| AI meal decomposition | Describe any meal in natural language |
| RAG product matching | Semantic similarity search via FAISS |
| Smart Pack Optimizer | Calculates exact pack quantities needed |
| Shopping Cart Drawer | Slide-in cart with live total |
| Floating Cart Button | Blinkit/Zepto-style floating CTA |
| Dietary Filters | Vegetarian, Vegan, Gluten-Free |
| Smart Swaps | Cycle between top-matched alternatives |

---

## 🏗️ Architecture

```
naturalcart/
├── backend/                    # FastAPI Python backend
│   ├── main.py                 # API routes, startup, lifespan
│   ├── gemini_service.py       # Gemini 2.5 Flash prompt + parsing
│   ├── rag.py                  # RAG orchestration pipeline
│   ├── vector_store.py         # FAISS vector index + product catalog
│   ├── embedding.py            # Local SentenceTransformer embeddings
│   ├── products.json           # 250-product Instamart-style catalog
│   ├── cached_embeddings.npy   # Auto-generated embedding cache
│   └── requirements.txt
│
├── src/                        # React 18 + Vite frontend
│   ├── App.jsx                 # Main application component
│   ├── index.css               # Global design system (dark theme)
│   ├── components/
│   │   ├── CartDrawer.jsx      # Slide-in cart panel
│   │   ├── CartItem.jsx        # Individual cart row component
│   │   ├── FloatingCartButton.jsx  # Fixed bottom-right CTA
│   │   └── Toast.jsx           # Toast notification system
│   ├── constants/              # Suggestions, filter metadata
│   └── utils/                  # Quantity scaling, pack calculations
│
├── vite.config.js              # Vite dev server + API proxy
├── index.html
└── .env                        # GEMINI_API_KEY
```

---

## ⚙️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, Vite, Vanilla CSS |
| **Backend** | FastAPI, Uvicorn, Python 3.11+ |
| **AI / LLM** | Google Gemini 2.5 Flash (`google-genai`) |
| **Embeddings** | SentenceTransformers `all-MiniLM-L6-v2` (local, ~90MB) |
| **Vector Search** | FAISS (`faiss-cpu`) |
| **Data Validation** | Pydantic v2 |
| **Environment** | python-dotenv |

---

## 🚀 Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- A [Google Gemini API key](https://aistudio.google.com/app/apikey) (free tier works)

---

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/naturalcart.git
cd naturalcart
```

---

### 2. Backend Setup

```bash
# Create and activate a virtual environment
python -m venv venv

# Windows
venv\Scripts\activate

# macOS / Linux
source venv/bin/activate

# Install dependencies
pip install -r backend/requirements.txt
```

Create a `.env` file in the project root:

```env
GEMINI_API_KEY=your_gemini_api_key_here
```

> **Note:** You can also paste your key directly into the API Key field in the UI — it is saved to your browser's `localStorage` and never sent to any third party.

---

### 3. Frontend Setup

```bash
npm install
```

---

### 4. Run the Application

**Terminal 1 — Backend:**

```bash
uvicorn backend.main:app --reload
```

The FastAPI server starts at `http://127.0.0.1:8000`.

On first run, it will download the `all-MiniLM-L6-v2` embedding model (~90MB, one-time) and generate `cached_embeddings.npy` for the 250-product catalog. Every subsequent restart loads the cache in milliseconds.

**Terminal 2 — Frontend:**

```bash
npm run dev
```

The Vite dev server starts at `http://localhost:5173` and proxies all `/api/*` requests to the FastAPI backend.

Open **http://localhost:5173** in your browser.

---

## 🔑 API Key Options

| Method | How |
|---|---|
| **.env file** | Set `GEMINI_API_KEY` — used by default for all requests |
| **UI input** | Paste your key in the 🔑 field — stored in `localStorage`, sent per-request |

If both are set, the UI key takes precedence.

---

## 🧠 How the RAG Pipeline Works

```
User Input: "Butter chicken for 4 people"
        │
        ▼
┌───────────────────────┐
│   Gemini 2.5 Flash    │  ← Decomposes meal into structured ingredients
│   (Prompt → JSON)     │     e.g. { name: "chicken", qty_per_person: "150g" }
└───────────────────────┘
        │
        ▼
┌───────────────────────┐
│  SentenceTransformer  │  ← Encodes ingredient name as a 384-dim vector
│  all-MiniLM-L6-v2     │
└───────────────────────┘
        │
        ▼
┌───────────────────────┐
│    FAISS Index        │  ← Cosine similarity search over 250 products
│  (250 products)       │     Returns top-3 matches with similarity scores
└───────────────────────┘
        │
        ▼
┌───────────────────────┐
│  Smart Pack Optimizer │  ← Calculates packs needed:
│                       │     ceil(required_qty / pack_size)
└───────────────────────┘
        │
        ▼
    React UI — Product cards, cart, totals
```

---

## 🛍️ Key Features

### 🤖 AI Meal Decomposition
Describe any meal in plain English. Gemini parses it into a structured JSON list of ingredients, quantities, aisles, and meal associations.

### 📦 Smart Pack Optimizer
The system calculates the minimum number of full packs to buy. If a recipe needs 100g but the pack is 70g, it tells you to buy 2 packs — not scale the price proportionally.

### 🔄 Smart Swaps
Every product card shows the best match. You can cycle through the top-3 alternatives if you prefer a different brand or pack size.

### 🛒 Shopping Cart Drawer
A Blinkit-style slide-in cart drawer shows every added item with live subtotals, pack quantity controls, and an estimated grand total.

### 🚀 Floating Cart Button
A fixed bottom-right pill button appears as soon as you add your first product. It shows live item count and total. On mobile it spans 88% width like Zepto and Instamart.

### 🔔 Toast Notifications
Unavailable products fire an orange toast notification when clicked, explaining why they cannot be added to cart.

### 🌿 Dietary Filters
Choose Vegetarian, Vegan, or Gluten-Free. The Gemini prompt is dynamically adjusted with strict substitution rules before generating the ingredient list.

### 📋 Copy List
One-click copy of the full grocery list — available products formatted with brand, pack count, and price. Unavailable ingredients are marked `(Not Available)`.

---

## 📡 API Reference

### `POST /api/grocery-list`

Generates a grocery list from a meal plan.

**Request Body:**

```json
{
  "meal_plan": "Butter chicken and dal makhani for 4 people",
  "dietary_filters": ["vegetarian"],
  "api_key": "optional-override-key"
}
```

**Response:**

```json
{
  "items": [
    {
      "name": "Chicken",
      "qty_per_person": "150g",
      "aisle": "Meat",
      "meal": "Butter Chicken",
      "substitute": null,
      "matches": [
        {
          "product": {
            "id": 42,
            "name": "Fresho Chicken Breast",
            "brand": "Fresho",
            "category": "Poultry",
            "quantity": "500g",
            "price": 249.0,
            "available": true
          },
          "score": 0.87
        }
      ]
    }
  ]
}
```

### `GET /`

Health check — returns `{ "status": "ok" }`.

---

## 🗂️ Product Catalog

The catalog (`backend/products.json`) contains **250 products** across categories including:

`Produce` · `Dairy` · `Meat` · `Seafood` · `Pantry` · `Spices` · `Oils` · `Canned Goods` · `Bakery` · `Frozen` · `Condiments` · `Beverages`

Each product includes: `id`, `name`, `brand`, `category`, `quantity`, `price`, `available`.

---

## 🎨 Design System

Built with **Vanilla CSS** using a dark-mode design system inspired by Blinkit, Zepto, and Instamart.

| Token | Value |
|---|---|
| `--green` | `#22C55E` |
| `--bg` | `#080D0A` |
| `--surface` | `#0F1510` |
| `--card` | `#141C15` |
| Font | Inter (Google Fonts) |
| Border radius | `10px` / `14px` / `20px` |

---

## 📁 Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | Yes (or via UI) | Your Google Gemini API key |

---

## 🛣️ Roadmap

- [ ] Real Instamart / Blinkit checkout integration
- [ ] User accounts and saved meal plans
- [ ] Price comparison across multiple catalogs
- [ ] Weekly meal planner view
- [ ] Notify Me button for unavailable products
- [ ] PWA / mobile app wrapper

---

## 📜 License

MIT License. Feel free to fork, extend, and deploy.

---

## 🙌 Acknowledgements

- [Google Gemini](https://deepmind.google/technologies/gemini/) — LLM for meal decomposition
- [Sentence Transformers](https://www.sbert.net/) — Local semantic embedding model
- [FAISS](https://github.com/facebookresearch/faiss) — Efficient vector similarity search
- [FastAPI](https://fastapi.tiangolo.com/) — High-performance Python web framework
- [Vite](https://vitejs.dev/) + [React](https://react.dev/) — Frontend tooling

---

<div align="center">
  <strong>NaturalCart</strong> · AI-Powered Grocery Shopping Platform<br/>
  FastAPI · Gemini · RAG · Vector Search
</div>
