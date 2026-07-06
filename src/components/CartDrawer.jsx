import React, { useEffect } from 'react';
import CartItem from './CartItem';
import { scaleQty } from '../utils';

export default function CartDrawer({ isOpen, onClose, cart, servings, items, onUpdateQty, onRemove, onBuyNow }) {
  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  // Lock body scroll when open
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const grandTotal = cart.reduce((sum, c) => sum + c.product.price * c.quantity, 0);
  const totalPacks = cart.reduce((sum, c) => sum + c.quantity, 0);

  return (
    <>
      {/* Dimmed backdrop */}
      <div className={`drawer-overlay ${isOpen ? 'open' : ''}`} onClick={onClose} />

      {/* Drawer panel */}
      <aside className={`cart-drawer ${isOpen ? 'open' : ''}`} aria-label="Shopping Cart">

        {/* ── Header ── */}
        <div className="drawer-header">
          <div className="drawer-title">
            🛒 Shopping Cart
            {cart.length > 0 && (
              <span className="drawer-count-badge">{totalPacks} packs</span>
            )}
          </div>
          <button className="drawer-close-btn" onClick={onClose} aria-label="Close cart">✕</button>
        </div>

        {/* ── Body ── */}
        <div className="drawer-body">
          {cart.length === 0 ? (
            <div className="drawer-empty">
              <div className="drawer-empty-icon">🛒</div>
              <div className="drawer-empty-title">Your cart is empty</div>
              <div className="drawer-empty-sub">Select grocery items to add them here.</div>
            </div>
          ) : (
            <div className="drawer-items">
              {cart.map((c) => {
                const item = items[c.itemIdx];
                const displayQty = item ? scaleQty(item.qty_per_person, servings) : '';
                return (
                  <CartItem
                    key={c.itemIdx}
                    cartEntry={c}
                    displayQty={displayQty}
                    onUpdateQty={(delta) => onUpdateQty(c.itemIdx, delta)}
                    onRemove={() => onRemove(c.itemIdx)}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        {cart.length > 0 && (
          <div className="drawer-footer">
            <div className="drawer-totals">
              <div className="drawer-total-row">
                <span>Total Packs</span>
                <span>{totalPacks}</span>
              </div>
              <div className="drawer-total-row grand">
                <span>Estimated Total</span>
                <span className="drawer-grand-val">₹{grandTotal}</span>
              </div>
            </div>
            <button className="drawer-buy-btn" onClick={onBuyNow}>
              🛍️ Buy Now · ₹{grandTotal}
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
