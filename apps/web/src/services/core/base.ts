import axios, { AxiosInstance } from 'axios';
import type { ServicesConfig } from '../../types/services';

class BaseServices {
  #axios: AxiosInstance;

  constructor({ baseURL }: ServicesConfig) {
    this.#axios = axios.create({
      timeout: 10000,
      baseURL,
    });
  }

  protected getAxiosInstance(): AxiosInstance {
    return this.#axios;
  }
}

export default BaseServices;
