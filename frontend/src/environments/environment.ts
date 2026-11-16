// Settings for running on your own computer: the local sandbox API (see backend/scripts/dev_server.py).
//
// The sandbox API normally runs on port 8000. If that port is busy, start the sandbox on another port
// (for example PORT=8001) and open the app once with ?api=http://localhost:8001 added to the address.
// The choice is remembered for this browser tab. This only exists in the local test version, never in the live one.
function sandboxApiBase(): string {
  const fallback = 'http://localhost:8000';
  try {
    const fromAddress = new URLSearchParams(window.location.search).get('api');
    if (fromAddress) sessionStorage.setItem('pragyaprep.api', fromAddress);
    return sessionStorage.getItem('pragyaprep.api') ?? fallback;
  } catch {
    return fallback;
  }
}

export const environment = {
  name: 'sandbox',
  apiBase: sandboxApiBase(),
};
