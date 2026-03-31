/**
 * RAKON CORE: API Integration Engine
 * Architecture: Modular / Singleton Pattern
 */

import 'dotenv/config';

class APIClient {
  constructor(baseURL, defaultHeaders = {}) {
    this.baseURL = baseURL;
    this.headers = {
      'Content-Type': 'application/json',
      ...defaultHeaders
    };
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const config = {
      ...options,
      headers: { ...this.headers, ...options.headers }
    };

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`[API_ERROR] ${response.status}: ${JSON.stringify(errorData)}`);
      }

      return await response.json();
    } catch (error) {
      this.handleError(error);
    }
  }

  handleError(error) {
    // Implementar lógica de logging avanzada o derivar a EPSILON
    console.error(`[FATAL_LOG]: ${error.message}`);
    throw error;
  }

  get(endpoint) {
    return this.request(endpoint, { method: 'GET' });
  }

  post(endpoint, body) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(body)
    });
  }
}

// Inicialización de servicios core
const RakonService = new APIClient(process.env.CORE_API_URL, {
  'Authorization': `Bearer ${process.env.CORE_API_KEY}`
});

export default RakonService;

/** 
 * Boilerplate de ejecución (Test)
 * Usage: 
 * import RakonService from './main.js';
 * const data = await RakonService.get('/status');
 */
