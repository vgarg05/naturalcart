import React from 'react';

export default function CartItem({ cartEntry, onUpdateQty, onRemove, displayQty }) {
  const { product, quantity } = cartEntry;
  const subtotal = product.price * quantity;

  return (
    <div className="ci-row">
      {/* Product avatar */}
      <div className="ci-avatar">{product.name.charAt(0)}</div>

      {/* Info */}
      <div className="ci-info">
        <div className="ci-name" title={product.name}>{product.name}</div>
        <div className="ci-meta">{product.brand} · {product.quantity}</div>
        {displayQty && (
          <div className="ci-req">Required: {displayQty}</div>
        )}
        <div className="ci-price-row">
          <span className="ci-unit-price">₹{product.price}/pack</span>
          <span className="ci-subtotal">₹{subtotal}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="ci-controls">
        <div className="ci-qty-row">
          <button className="ci-qty-btn" onClick={() => onUpdateQty(-1)}>−</button>
          <span className="ci-qty-val">{quantity}</span>
          <button className="ci-qty-btn" onClick={() => onUpdateQty(1)}>+</button>
        </div>
        <button className="ci-remove-btn" onClick={onRemove} title="Remove item">🗑</button>
      </div>
    </div>
  );
}
