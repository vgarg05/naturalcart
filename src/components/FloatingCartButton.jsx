import React, { useState, useEffect, useRef } from 'react';

/**
 * FloatingCartButton
 *
 * Appears (slides up + fades in) after the first item is added.
 * Hides (fades out + scales down) when cart is empty.
 * Shows live: item count and estimated total.
 * Clicking opens the CartDrawer.
 */
export default function FloatingCartButton({ cart, onOpen }) {
  const hasItems = cart.length > 0;
  const totalPacks = cart.reduce((sum, c) => sum + c.quantity, 0);
  const grandTotal = cart.reduce((sum, c) => sum + c.product.price * c.quantity, 0);

  // Track whether the button has ever been rendered (for entry animation)
  const [visible, setVisible] = useState(false);
  const prevTotal = useRef(grandTotal);
  const [priceAnimate, setPriceAnimate] = useState(false);

  useEffect(() => {
    if (hasItems) setVisible(true);
  }, [hasItems]);

  // Animate price change
  useEffect(() => {
    if (grandTotal !== prevTotal.current) {
      setPriceAnimate(true);
      const t = setTimeout(() => setPriceAnimate(false), 400);
      prevTotal.current = grandTotal;
      return () => clearTimeout(t);
    }
  }, [grandTotal]);

  if (!visible) return null;

  return (
    <button
      className={`fcb ${hasItems ? 'fcb-show' : 'fcb-hide'}`}
      onClick={onOpen}
      aria-label="View cart"
    >
      {/* Left: icon + label */}
      <div className="fcb-left">
        <span className="fcb-icon">🛒</span>
        <div className="fcb-labels">
          <span className="fcb-title">View Cart</span>
          <span className="fcb-sub">{totalPacks} {totalPacks === 1 ? 'pack' : 'packs'}</span>
        </div>
      </div>

      {/* Right: total */}
      <div className={`fcb-total ${priceAnimate ? 'price-pop' : ''}`}>
        ₹{grandTotal}
      </div>
    </button>
  );
}
