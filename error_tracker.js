/**
 * Universal Error Tracker & Telemetry Client
 * Rastreamento de Erros, Exceções e Falhas em Tempo Real para Apps e Sites
 */
(function () {
  'use strict';

  const ERROR_ENDPOINT = '/api/telemetry/error';
  const MAX_QUEUE_SIZE = 20;
  const errorQueue = [];
  let isSending = false;

  const isStaticHost = window.location.hostname.includes('github.io') || window.location.protocol === 'file:';

  // Gerar ID de sessão único
  const sessionId = 'sess_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();

  function sanitize(str) {
    if (typeof str !== 'string') return '';
    return str.substring(0, 1000);
  }

  function sendErrors() {
    if (isStaticHost) return; // GitHub Pages / estático não possui backend Node
    if (isSending || errorQueue.length === 0) return;
    isSending = true;

    const payload = errorQueue.splice(0, 5);

    fetch(ERROR_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ errors: payload, sessionId, timestamp: new Date().toISOString() })
    })
      .catch(err => {
        // Falha de envio não deve quebrar nada
        console.warn('⚠️ Telemetria: não foi possível despachar erros para o servidor:', err.message);
      })
      .finally(() => {
        isSending = false;
        if (errorQueue.length > 0) {
          setTimeout(sendErrors, 2000);
        }
      });
  }

  function queueError(errorData) {
    if (errorQueue.length >= MAX_QUEUE_SIZE) {
      errorQueue.shift();
    }
    errorQueue.push({
      ...errorData,
      url: window.location.href,
      userAgent: navigator.userAgent,
      time: new Date().toISOString()
    });

    // Envio com debounce
    setTimeout(sendErrors, 500);
  }

  // Notificação visual elegante e não-intrusiva na tela
  function showToastError(message, details) {
    let container = document.getElementById('error-tracker-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'error-tracker-toast-container';
      container.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 999999;
        display: flex;
        flex-direction: column;
        gap: 10px;
        max-width: 420px;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      `;
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.style.cssText = `
      background: #1e1e24;
      color: #fff;
      border: 1px solid #ef4444;
      border-left: 6px solid #ef4444;
      border-radius: 8px;
      padding: 12px 16px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.4);
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 13px;
      animation: errorFadeIn 0.3s ease;
    `;

    toast.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <strong style="color:#f87171; display:flex; align-items:center; gap:6px;">
          <span>⚠️</span> Falha Detectada
        </strong>
        <button style="background:none; border:none; color:#aaa; cursor:pointer; font-size:16px;" onclick="this.parentElement.parentElement.remove()">✕</button>
      </div>
      <div style="color:#e5e7eb; word-break:break-word; max-height:80px; overflow-y:auto;">
        ${sanitize(message || 'Ocorreu um erro inesperado no sistema.')}
      </div>
      <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:4px;">
        <button id="copy-err-btn" style="background:#374151; color:#fff; border:none; padding:4px 8px; border-radius:4px; cursor:pointer; font-size:11px;">
          Copiar Erro
        </button>
      </div>
    `;

    const copyBtn = toast.querySelector('#copy-err-btn');
    if (copyBtn) {
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(JSON.stringify(details, null, 2));
        copyBtn.innerText = 'Copiado!';
        setTimeout(() => { copyBtn.innerText = 'Copiar Erro'; }, 2000);
      };
    }

    container.appendChild(toast);
    setTimeout(() => {
      if (toast.parentElement) toast.remove();
    }, 9000);
  }

  // 1. Rastrear window.onerror
  window.onerror = function (msg, url, lineNo, columnNo, error) {
    const errorInfo = {
      type: 'uncaught_exception',
      message: msg ? msg.toString() : 'Unknown Script Error',
      source: url,
      lineno: lineNo,
      colno: columnNo,
      stack: error ? error.stack : null
    };

    queueError(errorInfo);
    showToastError(errorInfo.message, errorInfo);
    return false; // Permite que o console original ainda exiba
  };

  // 2. Rastrear Promessas Rejeitadas (unhandledrejection)
  window.addEventListener('unhandledrejection', function (event) {
    const reason = event.reason || {};
    const errorInfo = {
      type: 'unhandled_rejection',
      message: reason.message || (typeof reason === 'string' ? reason : 'Promise rejeitada sem tratamento'),
      stack: reason.stack || null
    };

    queueError(errorInfo);
    showToastError(errorInfo.message, errorInfo);
  });

  // 3. Interceptar falhas em Fetch
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    try {
      const response = await originalFetch.apply(this, args);
      if (!response.ok && response.status >= 400) {
        queueError({
          type: 'http_error',
          url: args[0],
          status: response.status,
          statusText: response.statusText
        });
      }
      return response;
    } catch (err) {
      queueError({
        type: 'fetch_network_failure',
        url: args[0],
        message: err.message
      });
      throw err;
    }
  };

  // Expor API global para uso explícito
  window.ErrorTracker = {
    track: function (err, context = {}) {
      const data = {
        type: 'manual_report',
        message: err.message || String(err),
        stack: err.stack || null,
        context
      };
      queueError(data);
    },
    getQueue: function () {
      return [...errorQueue];
    }
  };

  console.log('🛡️ [ErrorTracker] Sistema de rastreamento de falhas ativo no frontend.');
})();
