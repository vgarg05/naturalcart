import React, { useState, useCallback } from 'react';

/**
 * useToast — returns { toasts, showToast }
 * showToast({ title, message, duration? }) adds a dismissing toast.
 */
export function useToast() {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback(({ title, message, duration = 3500 }) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, title, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, showToast, dismiss };
}

/**
 * ToastContainer — fixed bottom-left stack of toast notifications.
 */
export default function ToastContainer({ toasts, onDismiss }) {
  if (!toasts.length) return null;
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast" role="alert">
          <div className="toast-icon">⚠️</div>
          <div className="toast-body">
            <div className="toast-title">{t.title}</div>
            <div className="toast-message">{t.message}</div>
          </div>
          <button className="toast-close" onClick={() => onDismiss(t.id)} aria-label="Dismiss">✕</button>
        </div>
      ))}
    </div>
  );
}
