import React, { useState, useEffect, useRef, useCallback } from 'react';
import { SUGGESTIONS, FILTER_META } from './constants';
import { getIcon, scaleQty, copyToClipboard, calculatePacksRequired } from './utils';
import CartDrawer from './components/CartDrawer';
import FloatingCartButton from './components/FloatingCartButton';
import ToastContainer, { useToast } from './components/Toast';

export default function App() {
  // ── FORM STATE ────────────────────────────────────────────────────────────
  const [apiKey, setApiKey] = useState('');
  const [isKeySaved, setIsKeySaved] = useState(false);
  const [mealInput, setMealInput] = useState('');
  const [activeFilters, setActiveFilters] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ── RESULTS STATE ─────────────────────────────────────────────────────────
  const [items, setItems] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const [servings, setServings] = useState(4);
  const [currentView, setCurrentView] = useState('aisle');
  const [swappedMatches, setSwappedMatches] = useState({});
  const [expandedMatches, setExpandedMatches] = useState(new Set());

  // ── CART STATE ────────────────────────────────────────────────────────────
  const [cart, setCart] = useState([]);
  const [checkedItems, setCheckedItems] = useState(new Set());
  const [copied, setCopied] = useState(false);

  // ── UI STATE ──────────────────────────────────────────────────────────────
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const { toasts, showToast, dismiss } = useToast();

  const resultsRef = useRef(null);

  // ── PERSIST API KEY ───────────────────────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem('nc_gemini_key');
    if (saved) { setApiKey(saved); setIsKeySaved(true); }
  }, []);

  // ── SERVINGS → RECALCULATE CART PACKS ────────────────────────────────────
  useEffect(() => {
    if (!items.length || !cart.length) return;
    setCart((prev) =>
      prev.map((c) => {
        const item = items[c.itemIdx];
        if (!item) return c;
        const dq = scaleQty(item.qty_per_person, servings);
        return { ...c, quantity: calculatePacksRequired(dq, c.product.quantity) };
      })
    );
  }, [servings, items]);

  const handleApiKeyChange = (val) => {
    setApiKey(val);
    if (val.trim()) { localStorage.setItem('nc_gemini_key', val.trim()); setIsKeySaved(true); }
    else { localStorage.removeItem('nc_gemini_key'); setIsKeySaved(false); }
  };

  // ── SUGGESTIONS ───────────────────────────────────────────────────────────
  const fillChip = (text) => { setMealInput(text); setShowSuggestions(false); };
  const fillSuggestion = (text) => {
    setMealInput(text);
    setShowSuggestions(false);
    setTimeout(() => document.getElementById('meal-input')?.focus(), 50);
  };

  // ── DIETARY FILTERS ───────────────────────────────────────────────────────
  const toggleFilter = (key) =>
    setActiveFilters((prev) => prev.includes(key) ? prev.filter((f) => f !== key) : [...prev, key]);

  // ── BUILD LIST ────────────────────────────────────────────────────────────
  const buildList = async () => {
    setError('');
    if (!mealInput.trim()) { setError("Please describe what you're cooking."); return; }
    setLoading(true);
    setShowSuggestions(false);
    try {
      const res = await fetch('/api/grocery-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meal_plan: mealInput, dietary_filters: activeFilters, api_key: apiKey }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.detail || `Server error: ${res.status}`);
      }
      const data = await res.json();
      const initialSwaps = {};
      (data.items || []).forEach((item, idx) => {
        const firstOk = (item.matches || []).findIndex((m) => m.product?.available && m.score >= 0.35);
        initialSwaps[idx] = firstOk !== -1 ? firstOk : 0;
      });
      setItems(data.items || []);
      setServings(4);
      setSwappedMatches(initialSwaps);
      setExpandedMatches(new Set());
      setCheckedItems(new Set());
      setCart([]);
      setCurrentView('aisle');
      setShowResults(true);
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch (err) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  // ── CART OPERATIONS ───────────────────────────────────────────────────────
  const toggleCartItem = useCallback((idx, product, packsRequired = 1) => {
    if (!product) return;
    setCart((prev) => {
      const exists = prev.find((c) => c.itemIdx === idx);
      return exists
        ? prev.filter((c) => c.itemIdx !== idx)
        : [...prev, { itemIdx: idx, product, quantity: packsRequired }];
    });
  }, []);

  const updateCartQty = useCallback((idx, delta) => {
    setCart((prev) =>
      prev.map((c) => c.itemIdx === idx ? { ...c, quantity: Math.max(1, c.quantity + delta) } : c)
    );
  }, []);

  const removeFromCart = useCallback((idx) => {
    setCart((prev) => prev.filter((c) => c.itemIdx !== idx));
    setCheckedItems((prev) => { const n = new Set(prev); n.delete(idx); return n; });
  }, []);

  const updateProductInCart = (idx, product, quantity) => {
    setCart((prev) => prev.map((c) => c.itemIdx === idx ? { ...c, product, quantity } : c));
  };

  // ── SWAP ──────────────────────────────────────────────────────────────────
  const cycleMatchSwap = (idx, e) => {
    e.stopPropagation();
    const item = items[idx];
    const count = item?.matches?.length || 0;
    if (count <= 1) return;
    const nextIdx = ((swappedMatches[idx] || 0) + 1) % count;
    setSwappedMatches({ ...swappedMatches, [idx]: nextIdx });
    const np = item.matches?.[nextIdx]?.product;
    if (np) {
      const dq = scaleQty(item.qty_per_person, servings);
      updateProductInCart(idx, np, calculatePacksRequired(dq, np.quantity));
    }
  };

  const selectMatch = (idx, matchIdx, e) => {
    e.stopPropagation();
    setSwappedMatches({ ...swappedMatches, [idx]: matchIdx });
    const np = items[idx]?.matches?.[matchIdx]?.product;
    if (np) {
      const dq = scaleQty(items[idx].qty_per_person, servings);
      updateProductInCart(idx, np, calculatePacksRequired(dq, np.quantity));
    }
  };

  const toggleExpandMatches = (idx, e) => {
    e.stopPropagation();
    const n = new Set(expandedMatches);
    n.has(idx) ? n.delete(idx) : n.add(idx);
    setExpandedMatches(n);
  };

  // ── CHECK (card click) ────────────────────────────────────────────────────
  const UNAVAIL_TOAST = {
    title: '⚠ Product Unavailable',
    message: 'This ingredient could not be matched with any product in the current catalog. It cannot be added to your shopping cart.',
  };

  const toggleCheck = (idx, e) => {
    if (e.target.closest('.swap-btn,.top-matches-trigger,.top-matches-list,.cart-action-btn')) return;

    // Block interaction on unmatched cards
    const item = items[idx];
    const mi = swappedMatches[idx] || 0;
    const am = item?.matches?.[mi];
    const isMatched = !!am?.product && am?.score >= 0.35;
    if (!isMatched) {
      showToast(UNAVAIL_TOAST);
      return;
    }

    const nc = new Set(checkedItems);
    nc.has(idx) ? nc.delete(idx) : nc.add(idx);
    setCheckedItems(nc);
    const prod = am.product;
    const dq = scaleQty(item.qty_per_person, servings);
    toggleCartItem(idx, prod, calculatePacksRequired(dq, prod.quantity));
  };

  // ── COPY LIST ─────────────────────────────────────────────────────────────
  const handleCopy = async () => {
    const groups = {};
    items.forEach((item, idx) => {
      if (checkedItems.has(idx)) return;
      const key = currentView === 'aisle' ? (item.aisle || 'Other') : (item.meal || 'Other');
      const mi = swappedMatches[idx] || 0;
      const am = item.matches?.[mi];
      const ok = !!am?.product && am?.score >= 0.35;
      const dq = scaleQty(item.qty_per_person, servings);
      let line = ok
        ? `- [Product] ${am.product.name} (${am.product.brand}) — ₹${am.product.price}×${calculatePacksRequired(dq, am.product.quantity)} = ₹${calculatePacksRequired(dq, am.product.quantity) * am.product.price} (Req: ${dq}, Pack: ${am.product.quantity})`
        : `- ${item.name} — ${dq} (Not Available)`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(line);
    });
    const lines = [];
    for (const [h, ls] of Object.entries(groups)) { lines.push(h.toUpperCase(), ...ls, ''); }
    const text = lines.join('\n').trim();
    if (!text) { alert('No unchecked items to copy!'); return; }
    try { await copyToClipboard(text); setCopied(true); setTimeout(() => setCopied(false), 2200); }
    catch { alert('Failed to copy.'); }
  };

  // ── GROUPING ──────────────────────────────────────────────────────────────
  const groupItems = () => {
    const groups = {};
    items.forEach((item, idx) => {
      const key = currentView === 'aisle' ? (item.aisle || 'Other') : (item.meal || 'Other');
      if (!groups[key]) groups[key] = [];
      groups[key].push({ item, idx });
    });
    return groups;
  };

  const grouped = groupItems();
  const totalItems = items.length;
  const checkedCount = checkedItems.size;
  const progressPct = totalItems > 0 ? Math.round((checkedCount / totalItems) * 100) : 0;

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div className="page">

      {/* ── NAV ── */}
      <nav className="topnav">
        <a className="brand" href="#">
          <div className="brand-icon">🛒</div>
          <div className="brand-name">Natural<span>Cart</span></div>
        </a>
        <div className="gemini-badge">
          <svg viewBox="0 0 24 24" width="14" height="14" style={{ fill: 'currentColor', marginRight: '6px' }}>
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
          Powered by Gemini AI
        </div>
      </nav>

      {/* ── HERO ── */}
      <div className="hero">
        <h1>Tell me what you're cooking,<br/><em>I'll handle the shopping.</em></h1>
        <p>Describe your week's meals — AI breaks it into a structured, aisle-organised grocery list. Ready to shop in seconds.</p>
      </div>

      {/* ── SUGGESTION CARDS ── */}
      {showSuggestions && (
        <div className="suggestions">
          {SUGGESTIONS.map((s, i) => (
            <div key={i} className="suggestion-card" onClick={() => fillSuggestion(s.text)}>
              <span className="suggestion-emoji">{s.emoji}</span>
              <div className="suggestion-title">{s.title}</div>
              <div className="suggestion-sub">{s.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── FORM CARD ── */}
      <div className="form-card">
        <label className="field-label" htmlFor="api-key">🔒 Gemini API Key (Optional)</label>
        <div className="api-key-row">
          <span className="api-key-icon">🔑</span>
          <input id="api-key" className="api-input" type="password"
            placeholder="Optional: Leave blank to use our key, or paste your own key to use yours"
            value={apiKey} onChange={(e) => handleApiKeyChange(e.target.value)}
            autoComplete="off" spellCheck="false" />
          <div className={`api-saved-dot ${isKeySaved ? 'visible' : ''}`} title="Key saved locally" />
        </div>

        <span className="chips-label">Quick fill</span>
        <div className="chips-row">
          <button className="chip" onClick={() => fillChip('Butter chicken for 4 people')}>🍛 Butter chicken for 4</button>
          <button className="chip" onClick={() => fillChip('Sunday pasta night for 6 people')}>🍝 Pasta night for 6</button>
          <button className="chip" onClick={() => fillChip('Healthy meal prep for 5 days for 1 person')}>🥗 5-day meal prep</button>
          <button className="chip" onClick={() => fillChip('Taco Tuesday for 8 people')}>🌮 Taco Tuesday for 8</button>
        </div>

        <label className="field-label" htmlFor="meal-input">What are you cooking?</label>
        <textarea id="meal-input" className="meal-textarea"
          placeholder="e.g. Butter chicken and dal makhani for 6 people this week, plus a quick pasta for lunch on Monday…"
          value={mealInput} onChange={(e) => setMealInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) buildList(); }} />

        <div className="filter-section">
          <label className="field-label">Dietary Preferences</label>
          <div className="filter-row">
            {Object.entries(FILTER_META).map(([key, meta]) => {
              const isActive = activeFilters.includes(key);
              const emoji = key === 'vegetarian' ? '🌿' : key === 'vegan' ? '🌱' : '🌾';
              return (
                <button key={key} id={`filter-${key}`}
                  className={`filter-btn ${isActive ? 'active' : ''}`}
                  onClick={() => toggleFilter(key)}>
                  <span className="f-check">✓</span> {emoji} {meta.label}
                </button>
              );
            })}
          </div>
          {activeFilters.length > 0 && (
            <div className="active-filters-note">
              ✦ Active: <strong>{activeFilters.map(f => FILTER_META[f].label).join(', ')}</strong> — AI will adjust ingredients
            </div>
          )}
        </div>

        {error && <div className="error-box">{error}</div>}

        <button id="build-btn" className="btn" onClick={buildList} disabled={loading}>
          <span id="btn-text">
            {loading
              ? (<>Building your list<span className="dots"><span/><span/><span/></span></>)
              : '✨ Build My List'}
          </span>
        </button>
      </div>

      {/* ── RESULTS ── */}
      {showResults && (
        <div id="results" ref={resultsRef}>
          <div className="results-header">
            <div className="results-title">Your Grocery List</div>
            <div className="item-count">{totalItems} items</div>
          </div>

          <div className="progress-bar-wrap">
            <span className="progress-label">{checkedCount} / {totalItems} items checked</span>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progressPct}%` }} />
            </div>
            <button className={`copy-btn ${copied ? 'copied' : ''}`} onClick={handleCopy}>
              {copied ? '✅ Copied!' : '📋 Copy List'}
            </button>
          </div>

          <div className="controls-bar">
            <div className="view-toggle" role="group" aria-label="View mode">
              <button className={`view-btn ${currentView === 'aisle' ? 'active' : ''}`} onClick={() => setCurrentView('aisle')}>🛒 By Aisle</button>
              <button className={`view-btn ${currentView === 'meal' ? 'active' : ''}`} onClick={() => setCurrentView('meal')}>🍽️ By Meal</button>
            </div>
            <div className="servings-adjuster">
              <span className="servings-label">Servings</span>
              <div className="servings-controls">
                <button className="srv-btn" onClick={() => setServings(s => Math.max(1, s - 1))} disabled={servings === 1}>−</button>
                <span className="srv-count">{servings}</span>
                <button className="srv-btn" onClick={() => setServings(s => Math.min(20, s + 1))} disabled={servings === 20}>+</button>
              </div>
            </div>
          </div>

          {/* ── FULL-WIDTH GROCERY GRID ── */}
          <div id="aisle-container">
            {Object.entries(grouped).map(([heading, entries]) => {
              const icon = currentView === 'aisle' ? getIcon(heading) : '🍽️';
              return (
                <div key={heading} className="aisle-group">
                  <div className="aisle-heading">
                    <span className="aisle-icon">{icon}</span>
                    {heading}
                    <span className="aisle-count">({entries.length})</span>
                  </div>
                  <div className="items-grid">
                    {entries.map(({ item, idx }) => {
                      const isChecked = checkedItems.has(idx);
                      const activeMatchIdx = swappedMatches[idx] || 0;
                      const activeMatch = item.matches?.[activeMatchIdx];
                      const activeProduct = activeMatch?.product;
                      const activeScore = activeMatch?.score || 0;
                      const isMatched = !!activeProduct && activeScore >= 0.35;
                      const displayName = isMatched ? activeProduct.name : item.name;
                      const hasSub = (item.matches?.length || 0) > 1;
                      const isSwapped = activeMatchIdx > 0;
                      const displayQty = scaleQty(item.qty_per_person, servings);
                      const packsRequired = isMatched ? calculatePacksRequired(displayQty, activeProduct.quantity) : 1;
                      const estimatedCost = isMatched ? packsRequired * activeProduct.price : 0;
                      const badgeText = currentView === 'aisle' ? (item.meal || '') : (item.aisle || '');
                      const isInCart = cart.some((c) => c.itemIdx === idx);

                      return (
                        <div
                          key={idx}
                          className={`item-card ${isChecked ? 'checked' : ''} ${isSwapped ? 'is-swapped' : ''} ${!isMatched ? 'item-card--unavailable' : ''}`}
                          onClick={(e) => toggleCheck(idx, e)}
                        >
                          <div className="item-header">
                            <div className="item-header-left">
                              <div className="item-check">✓</div>
                              <div>
                                <div className="item-name">{displayName}</div>
                                {isMatched && <div className="product-brand">{activeProduct.brand}</div>}
                              </div>
                            </div>
                            {hasSub && (
                              <button className={`swap-btn ${isSwapped ? 'swapped' : ''}`}
                                onClick={(e) => cycleMatchSwap(idx, e)} title="Swap to next best brand">🔄</button>
                            )}
                          </div>

                          <div className="item-meta">
                            <span className="item-qty">{displayQty}</span>
                            <span className="item-badge">{badgeText}</span>
                          </div>

                          {isMatched ? (
                            <div style={{ marginTop: '8px', paddingLeft: '24px', fontSize: '11.5px', color: 'var(--text-2)', display: 'flex', flexDirection: 'column' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', margin: '8px 0 10px' }}>
                                <div>
                                  <div style={{ color: 'var(--muted)', fontSize: '10px', textTransform: 'uppercase', fontWeight: '700' }}>Price / Pack</div>
                                  <div style={{ fontWeight: '800', color: 'var(--text)', fontSize: '13px' }}>₹{activeProduct.price}</div>
                                </div>
                                <div>
                                  <div style={{ color: 'var(--muted)', fontSize: '10px', textTransform: 'uppercase', fontWeight: '700' }}>Pack Size</div>
                                  <div style={{ fontWeight: '800', color: 'var(--text)', fontSize: '13px' }}>{activeProduct.quantity}</div>
                                </div>
                                <div>
                                  <div style={{ color: 'var(--muted)', fontSize: '10px', textTransform: 'uppercase', fontWeight: '700' }}>Required Qty</div>
                                  <div style={{ fontWeight: '800', color: 'var(--text)', fontSize: '13px' }}>{displayQty}</div>
                                </div>
                                <div>
                                  <div style={{ color: 'var(--muted)', fontSize: '10px', textTransform: 'uppercase', fontWeight: '700' }}>Packs Required</div>
                                  <div style={{ fontWeight: '800', color: 'var(--green)', fontSize: '13px' }}>{packsRequired}</div>
                                </div>
                              </div>

                              <div style={{ marginBottom: '8px' }}>
                                {packsRequired === 1
                                  ? <span className="product-stock available">✓ 1 Pack Sufficient</span>
                                  : <span className="product-stock available" style={{ background: 'rgba(245,158,11,0.12)', color: '#F59E0B' }}>Needs {packsRequired} Packs</span>
                                }
                              </div>

                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
                                <div>
                                  <div style={{ color: 'var(--muted)', fontSize: '9.5px', textTransform: 'uppercase', fontWeight: '700' }}>Estimated Cost</div>
                                  <span className="product-price" style={{ fontSize: '14.5px' }}>₹{estimatedCost}</span>
                                </div>
                                <span className={`product-stock ${activeProduct.available ? 'available' : 'out-of-stock'}`}>
                                  {activeProduct.available ? 'Available' : 'Out of Stock'}
                                </span>
                              </div>

                              <button className="top-matches-trigger" onClick={(e) => toggleExpandMatches(idx, e)}>
                                Top Matches ({item.matches?.length || 0}) {expandedMatches.has(idx) ? '▴' : '▾'}
                              </button>

                              {expandedMatches.has(idx) && (
                                <div className="top-matches-list">
                                  {item.matches.map((m, mi) => (
                                    <div key={mi} className={`top-match-item ${activeMatchIdx === mi ? 'active' : ''}`}>
                                      <div>
                                        <div style={{ fontWeight: '700' }}>{m.product.name}</div>
                                        <div style={{ fontSize: '9.5px', color: 'var(--muted)' }}>₹{m.product.price} · {m.product.brand} · {Math.round(m.score * 100)}%</div>
                                      </div>
                                      {activeMatchIdx !== mi && (
                                        <button className="top-match-btn" onClick={(e) => selectMatch(idx, mi, e)}>Select</button>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}

                              <button
                                className={`cart-action-btn ${isInCart ? 'added' : ''}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleCartItem(idx, activeProduct, packsRequired);
                                  setCheckedItems((prev) => {
                                    const n = new Set(prev);
                                    isInCart ? n.delete(idx) : n.add(idx);
                                    return n;
                                  });
                                }}
                              >
                                {isInCart ? '✓ Added' : '+ Add to Cart'}
                              </button>
                            </div>
                          ) : (
                            <div className="unavail-block">
                              <div className="unavail-icon">🔒</div>
                              <div className="unavail-title">Product Not Available</div>
                              <div className="unavail-sub">This ingredient is not currently available in the product catalog.</div>
                              <button
                                className="cart-action-btn unavailable"
                                disabled
                                title="Product not available in the current catalog."
                                onClick={(e) => { e.stopPropagation(); showToast(UNAVAIL_TOAST); }}
                              >
                                🔒 Unavailable
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── FLOATING CART BUTTON ── */}
      <FloatingCartButton cart={cart} onOpen={() => setIsDrawerOpen(true)} />

      {/* ── CART DRAWER ── */}
      <CartDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        cart={cart}
        servings={servings}
        items={items}
        onUpdateQty={updateCartQty}
        onRemove={removeFromCart}
        onBuyNow={() => { setIsDrawerOpen(false); setShowCheckoutModal(true); }}
      />

      {/* ── TOAST NOTIFICATIONS ── */}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      {/* ── CHECKOUT MODAL ── */}
      {showCheckoutModal && (
        <div className="modal-overlay" onClick={() => setShowCheckoutModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <span className="modal-icon">🚀</span>
            <h3 className="modal-title">Demo Mode</h3>
            <div className="modal-body">
              This project demonstrates AI-powered meal planning, product matching, and smart shopping cart functionality.<br/><br/>
              Checkout has not been implemented yet and is planned for a future release.
            </div>
            <button className="modal-close-btn" onClick={() => setShowCheckoutModal(false)}>Got it!</button>
          </div>
        </div>
      )}

      {/* ── FOOTER ── */}
      <footer>
        <div style={{ fontWeight: '700', marginBottom: '4px' }}>NaturalCart  •  AI-Powered Grocery Shopping Platform</div>
        <div style={{ fontSize: '11px', color: 'var(--muted)' }}>FastAPI • Gemini LLM • RAG • Vector Search</div>
      </footer>
    </div>
  );
}
