import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Não aplicar estilos no root para permitir que o componente controle
const root = document.getElementById('root');

ReactDOM.createRoot(root!).render(
  // StrictMode desabilitado para evitar duplicação de listeners Socket.IO em desenvolvimento
  // (StrictMode monta componentes 2x, causando registro duplicado de event handlers)
  <App />
);
