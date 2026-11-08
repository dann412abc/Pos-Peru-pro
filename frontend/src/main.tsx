import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import './index.css';

// Punto de entrada de la aplicación Mi Carrito POS.
// Se envuelve con Router, proveedor de autenticación y notificaciones toast.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3500,
            style: {
              background: '#1B4B6F',
              color: '#fff',
              fontSize: '14px',
            },
            success: { iconTheme: { primary: '#D97706', secondary: '#fff' } },
          }}
        />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);

// PWA: registro solo bajo HTTPS/localhost. El service worker nunca almacena respuestas API.
if ('serviceWorker' in navigator && (window.isSecureContext || location.hostname === 'localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('No se pudo registrar el modo instalable:', error);
    });
  });
}
