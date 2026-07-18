import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

if (typeof window !== 'undefined') {
  window.onerror = function(msg, url, line, col, error) {
    const div = document.createElement('div');
    div.style.position = 'fixed';
    div.style.top = '10px';
    div.style.left = '10px';
    div.style.right = '10px';
    div.style.background = 'rgba(255, 0, 0, 0.95)';
    div.style.color = '#fff';
    div.style.padding = '15px';
    div.style.borderRadius = '8px';
    div.style.zIndex = '99999';
    div.style.fontFamily = 'monospace';
    div.style.fontSize = '12px';
    div.style.whiteSpace = 'pre-wrap';
    div.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';
    div.innerHTML = `<strong>JS ERROR:</strong> ${msg}<br>at ${url}:${line}:${col}<br><br>${error ? error.stack : ''}`;
    document.body.appendChild(div);
    return false;
  };

  window.onunhandledrejection = function(event) {
    const div = document.createElement('div');
    div.style.position = 'fixed';
    div.style.top = '10px';
    div.style.left = '10px';
    div.style.right = '10px';
    div.style.background = 'rgba(255, 100, 0, 0.95)';
    div.style.color = '#fff';
    div.style.padding = '15px';
    div.style.borderRadius = '8px';
    div.style.zIndex = '99999';
    div.style.fontFamily = 'monospace';
    div.style.fontSize = '12px';
    div.style.whiteSpace = 'pre-wrap';
    div.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';
    div.innerHTML = `<strong>UNHANDLED REJECTION:</strong> ${event.reason?.message || event.reason}`;
    document.body.appendChild(div);
  };
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
